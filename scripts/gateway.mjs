// 단일 진입점 게이트웨이. Cloudflare Tunnel 은 이 포트(기본 8080) 하나만 공개하면 된다.
//   /sb/*  -> Supabase API 게이트웨이 (접두사 /sb 를 떼고 전달, WebSocket 포함)
//   그 외  -> Next.js 앱
// 지나가는 요청을 분 단위로 집계한다. 집계는 127.0.0.1:STATS_PORT/stats 로만 노출한다(공개 포트가 아님).
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";

const PORT = Number(process.env.GATEWAY_PORT ?? 8080);
const STATS_PORT = Number(process.env.STATS_PORT ?? 8081);
const APP = { host: "127.0.0.1", port: Number(process.env.APP_PORT ?? 3000) };
const SB = { host: "127.0.0.1", port: Number(process.env.SB_PORT ?? 8000) };
const PREFIX = "/sb";
const STATS_FILE =
  process.env.STATS_FILE ?? "C:\\Users\\Owner\\humango-logs\\traffic.json";
const KEEP_MS = 7 * 24 * 3600_000;
const MIN = 60_000;

// ---- 집계 -------------------------------------------------------------
// buckets[분] = { app, sb, ws, in, out, s2, s3, s4, s5, ms(응답시간 합), n(응답시간 표본) }
let buckets = {};
let visitors = { day: "", set: new Set() }; // 하루 단위 고유 방문자(IP 해시만 보관)
let salt = crypto.randomBytes(8).toString("hex");
const startedAt = Date.now();
let inflight = 0;
let sockets = 0;
let total = { requests: 0, in: 0, out: 0 };

try {
  const saved = JSON.parse(fs.readFileSync(STATS_FILE, "utf8"));
  buckets = saved.buckets ?? {};
  salt = saved.salt ?? salt;
  total = saved.total ?? total;
  if (saved.visitors?.day)
    visitors = { day: saved.visitors.day, set: new Set(saved.visitors.list) };
} catch {
  // 처음 실행
}

const day = (t = Date.now()) =>
  new Date(t + 9 * 3600_000).toISOString().slice(0, 10); // KST 기준 날짜

function bucket(t = Date.now()) {
  const k = String(Math.floor(t / MIN));
  return (buckets[k] ??= {
    app: 0, sb: 0, ws: 0, in: 0, out: 0, s2: 0, s3: 0, s4: 0, s5: 0, ms: 0, n: 0,
  });
}

function seen(req) {
  const ip =
    req.headers["cf-connecting-ip"] ?? req.socket.remoteAddress ?? "unknown";
  if (visitors.day !== day()) visitors = { day: day(), set: new Set() };
  visitors.set.add(
    crypto.createHash("sha256").update(salt + ip).digest("hex").slice(0, 16),
  );
}

function save() {
  const cutoff = Math.floor((Date.now() - KEEP_MS) / MIN);
  for (const k of Object.keys(buckets)) if (Number(k) < cutoff) delete buckets[k];
  try {
    fs.mkdirSync(STATS_FILE.replace(/[\\/][^\\/]+$/, ""), { recursive: true });
    fs.writeFileSync(
      STATS_FILE,
      JSON.stringify({
        buckets,
        salt,
        total,
        visitors: { day: visitors.day, list: [...visitors.set] },
      }),
    );
  } catch (e) {
    console.error("stats save failed", e.message);
  }
}
setInterval(save, MIN).unref();
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, () => {
    save();
    process.exit(0);
  });

function snapshot() {
  const now = Date.now();
  const cur = Math.floor(now / MIN);
  const sum = (from, to) => {
    const r = { app: 0, sb: 0, ws: 0, in: 0, out: 0, s2: 0, s3: 0, s4: 0, s5: 0, ms: 0, n: 0 };
    for (let m = from; m <= to; m++) {
      const b = buckets[m];
      if (b) for (const k in r) r[k] += b[k];
    }
    return r;
  };
  const series = (count, step) => {
    const out = [];
    for (let i = count - 1; i >= 0; i--) {
      const to = cur - i * step;
      const b = sum(to - step + 1, to);
      out.push({
        t: to * MIN,
        requests: b.app + b.sb,
        app: b.app,
        sb: b.sb,
        in: b.in,
        out: b.out,
        errors: b.s5,
        avgMs: b.n ? Math.round(b.ms / b.n) : 0,
      });
    }
    return out;
  };
  const last5 = sum(cur - 4, cur);
  return {
    now,
    startedAt,
    uptimeSec: Math.round((now - startedAt) / 1000),
    inflight,
    sockets,
    total,
    uniqueVisitorsToday: visitors.day === day() ? visitors.set.size : 0,
    last5min: {
      requests: last5.app + last5.sb,
      rpm: Math.round((last5.app + last5.sb) / 5),
      in: last5.in,
      out: last5.out,
      avgMs: last5.n ? Math.round(last5.ms / last5.n) : 0,
      errors5xx: last5.s5,
    },
    minutes: series(60, 1), // 최근 60분, 분 단위
    hours: series(48, 60), // 최근 48시간, 시간 단위
    last24h: (() => {
      const b = sum(cur - 1439, cur);
      return { requests: b.app + b.sb, in: b.in, out: b.out, s4: b.s4, s5: b.s5 };
    })(),
  };
}

http
  .createServer((req, res) => {
    if (req.url?.split("?")[0] === "/stats") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(snapshot()));
    } else {
      res.writeHead(404).end();
    }
  })
  .listen(STATS_PORT, "127.0.0.1");

// ---- 프록시 -----------------------------------------------------------
function route(url) {
  if (url === PREFIX || url.startsWith(PREFIX + "/") || url.startsWith(PREFIX + "?"))
    return { target: SB, path: url.slice(PREFIX.length) || "/", kind: "sb" };
  return { target: APP, path: url, kind: "app" };
}

// 관리자 페이지 자체의 요청(화면, 통계 API, 그 화면이 불러오는 정적 파일)은 집계에서 제외한다
const ADMIN_PATH = /^\/(admin|api\/admin)(\/|\?|$)/;
function isAdminRequest(req) {
  if (ADMIN_PATH.test(req.url ?? "")) return true;
  try {
    const ref = req.headers.referer ? new URL(req.headers.referer).pathname : "";
    return ref === "/admin" || ref.startsWith("/admin/");
  } catch {
    return false;
  }
}

const server = http.createServer((req, res) => {
  const { target, path, kind } = route(req.url ?? "/");
  const started = Date.now();
  const counted = !isAdminRequest(req);
  if (counted) {
    bucket(started)[kind]++;
    total.requests++;
    seen(req);
    inflight++;
  }
  let inBytes = 0;
  let outBytes = 0;
  let done = false;
  const finish = (status) => {
    if (done) return;
    done = true;
    if (!counted) return;
    inflight--;
    const fb = bucket();
    fb.in += inBytes;
    fb.out += outBytes;
    total.in += inBytes;
    total.out += outBytes;
    const cls = Math.floor((status ?? 0) / 100);
    if (cls >= 2 && cls <= 5) fb["s" + cls]++;
    fb.ms += Date.now() - started;
    fb.n++;
  };
  req.on("data", (c) => (inBytes += c.length));

  const proxyReq = http.request(
    {
      ...target,
      method: req.method,
      path,
      headers: { ...req.headers, "x-forwarded-for": req.socket.remoteAddress },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.on("data", (c) => (outBytes += c.length));
      proxyRes.pipe(res);
      res.on("close", () => finish(proxyRes.statusCode));
    },
  );
  proxyReq.on("error", () => {
    if (!res.headersSent) res.writeHead(502);
    res.end("Bad gateway");
    finish(502);
  });
  res.on("close", () => finish(res.statusCode));
  req.pipe(proxyReq);
});

server.on("upgrade", (req, socket, head) => {
  const { target, path } = route(req.url ?? "/");
  bucket().ws++;
  seen(req);
  sockets++;
  let closed = false;
  const upstream = net.connect(target.port, target.host, () => {
    const headers = Object.entries(req.headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\r\n");
    upstream.write(`${req.method} ${path} HTTP/1.1\r\n${headers}\r\n\r\n`);
    if (head?.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  const close = () => {
    if (!closed) {
      closed = true;
      sockets--;
    }
    socket.destroy();
    upstream.destroy();
  };
  upstream.on("error", close);
  upstream.on("close", close);
  socket.on("error", close);
  socket.on("close", close);
  upstream.on("data", (c) => {
    bucket().out += c.length;
    total.out += c.length;
  });
  socket.on("data", (c) => {
    bucket().in += c.length;
    total.in += c.length;
  });
});

server.listen(PORT, "0.0.0.0", () =>
  console.log(
    `gateway :${PORT} -> app :${APP.port}, ${PREFIX} -> supabase :${SB.port}, stats 127.0.0.1:${STATS_PORT}`,
  ),
);
