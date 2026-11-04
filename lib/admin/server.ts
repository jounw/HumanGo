// 서버 전용: 관리자 권한 확인과 서버/DB 지표 수집.
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RARITY_ORDER } from "@/lib/game/rarity";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/** 로그인했고 ADMIN_EMAILS 에 포함된 사용자만 통과. 아니면 null. */
export async function requireAdmin() {
  const list = adminEmails();
  if (!list.length) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !list.includes(user.email.toLowerCase())) return null;
  const admin = createAdminClient();
  return admin ? { user, admin } : null;
}

// ---- 배포 정보 ---------------------------------------------------------
/** 지금 돌고 있는 빌드의 커밋과, DB 에 적용된 마이그레이션 목록 */
export async function deployInfo(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("_app_migrations")
    .select("name,applied_at")
    .order("name", { ascending: true });
  return {
    sha: process.env.BUILD_SHA ?? "unknown",
    subject: process.env.BUILD_SUBJECT ?? "",
    builtAt: process.env.BUILD_TIME ?? null,
    // 자동 배포 전용 테이블이라 없으면(수동 설치 등) null
    migrations: error
      ? null
      : (data ?? []).map((m) => ({
          name: m.name as string,
          appliedAt: m.applied_at as string,
        })),
  };
}

// ---- DB 지표 ----------------------------------------------------------
const DAYS = 14;
const kstDay = (t: number) =>
  new Date(t + 9 * 3600_000).toISOString().slice(0, 10);

async function count(
  admin: SupabaseClient,
  table: string,
  col?: string,
  since?: number,
  eq?: [string, string],
) {
  let q = admin.from(table).select("*", { count: "exact", head: true });
  if (col && since) q = q.gte(col, new Date(since).toISOString());
  if (eq) q = q.eq(eq[0], eq[1]);
  const { count: c } = await q;
  return c ?? 0;
}

async function daily(
  admin: SupabaseClient,
  table: string,
  col: string,
  now: number,
) {
  const from = now - DAYS * 24 * 3600_000;
  const { data } = await admin
    .from(table)
    .select(col)
    .gte(col, new Date(from).toISOString())
    .limit(20000);
  const map = new Map<string, number>();
  for (const row of (data ?? []) as unknown as Record<string, string>[]) {
    const d = kstDay(Date.parse(row[col]));
    map.set(d, (map.get(d) ?? 0) + 1);
  }
  const out: { day: string; count: number }[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = kstDay(now - i * 24 * 3600_000);
    out.push({ day: d, count: map.get(d) ?? 0 });
  }
  return out;
}

export async function dbStats(admin: SupabaseClient) {
  const now = Date.now();
  const H24 = now - 24 * 3600_000;
  const D7 = now - 7 * 24 * 3600_000;
  const [
    users,
    users24h,
    users7d,
    captures,
    captures24h,
    captures7d,
    battles,
    battlesActive,
    friendships,
    byRarity,
    userSeries,
    captureSeries,
  ] = await Promise.all([
    count(admin, "profiles"),
    count(admin, "profiles", "created_at", H24),
    count(admin, "profiles", "created_at", D7),
    count(admin, "captures"),
    count(admin, "captures", "captured_at", H24),
    count(admin, "captures", "captured_at", D7),
    count(admin, "battles", undefined, undefined, ["status", "finished"]),
    count(admin, "battles", undefined, undefined, ["status", "active"]),
    count(admin, "friendships", undefined, undefined, ["status", "accepted"]),
    Promise.all(
      RARITY_ORDER.map(async (r) => ({
        rarity: r,
        count: await count(admin, "captures", undefined, undefined, ["rarity", r]),
      })),
    ),
    daily(admin, "profiles", "created_at", now),
    daily(admin, "captures", "captured_at", now),
  ]);
  return {
    users,
    users24h,
    users7d,
    captures,
    captures24h,
    captures7d,
    battlesFinished: battles,
    battlesActive,
    friendships,
    byRarity,
    userSeries,
    captureSeries,
  };
}

// ---- 호스트(서버 PC) 부하 ----------------------------------------------
type CpuSample = { idle: number; total: number };
const g = globalThis as unknown as { __cpuLast?: CpuSample };

function cpuSample(): CpuSample {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    idle += c.times.idle;
    total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
  }
  return { idle, total };
}

async function cpuPercent(): Promise<number> {
  const prev = g.__cpuLast ?? (await (async () => {
    const s = cpuSample();
    await new Promise((r) => setTimeout(r, 300));
    return s;
  })());
  const cur = cpuSample();
  g.__cpuLast = cur;
  const dt = cur.total - prev.total;
  return dt > 0 ? Math.round((1 - (cur.idle - prev.idle) / dt) * 100) : 0;
}

function disks() {
  const mounts = process.platform === "win32" ? ["C:\\", "D:\\"] : ["/"];
  const out: { mount: string; total: number; free: number }[] = [];
  for (const mount of mounts) {
    try {
      const s = fs.statfsSync(mount);
      out.push({ mount: mount.replace("\\", ""), total: s.blocks * s.bsize, free: s.bavail * s.bsize });
    } catch {
      // 없는 드라이브는 건너뛴다
    }
  }
  return out;
}

const WSL_DISTRO = process.env.WSL_DISTRO ?? "Ubuntu-22.04";
// docker stats 는 느리므로(1~3초) 10초 캐시
type Container = { name: string; cpu: number; memMb: number };
let dockerCache: { at: number; data: Container[] | null } = { at: 0, data: null };

const toMb = (s: string) => {
  const m = /([\d.]+)\s*([KMG]i?B)/i.exec(s);
  if (!m) return 0;
  const v = Number(m[1]);
  const u = m[2].toUpperCase();
  return u.startsWith("G") ? v * 1024 : u.startsWith("K") ? v / 1024 : v;
};

function dockerStats(): Promise<Container[] | null> {
  if (Date.now() - dockerCache.at < 10_000) return Promise.resolve(dockerCache.data);
  const args =
    process.platform === "win32"
      ? ["-d", WSL_DISTRO, "-u", "root", "--", "docker", "stats", "--no-stream", "--format", "{{.Name}}~{{.CPUPerc}}~{{.MemUsage}}"]
      : null;
  const cmd = process.platform === "win32" ? "wsl" : "docker";
  const a = args ?? ["stats", "--no-stream", "--format", "{{.Name}}~{{.CPUPerc}}~{{.MemUsage}}"];
  return new Promise((resolve) => {
    execFile(cmd, a, { timeout: 15_000 }, (err, stdout) => {
      if (err) {
        dockerCache = { at: Date.now(), data: null };
        return resolve(null);
      }
      const data = stdout
        .split("\n")
        .map((l) => l.trim().split("~"))
        .filter((p) => p.length === 3)
        .map(([name, cpu, mem]) => ({
          name,
          cpu: Number.parseFloat(cpu) || 0,
          memMb: Math.round(toMb(mem.split("/")[0])),
        }))
        .sort((x, y) => y.memMb - x.memMb);
      dockerCache = { at: Date.now(), data };
      resolve(data);
    });
  });
}

export async function hostStats() {
  const [cpu, containers] = await Promise.all([cpuPercent(), dockerStats()]);
  const mem = { total: os.totalmem(), free: os.freemem() };
  return {
    cpuPercent: cpu,
    cores: os.cpus().length,
    mem,
    disks: disks(),
    osUptimeSec: Math.round(os.uptime()),
    appUptimeSec: Math.round(process.uptime()),
    appRssMb: Math.round(process.memoryUsage().rss / 1048576),
    containers,
  };
}

// ---- 게이트웨이 트래픽 --------------------------------------------------
export async function trafficStats() {
  try {
    const res = await fetch(
      `http://127.0.0.1:${process.env.STATS_PORT ?? 8081}/stats`,
      { cache: "no-store", signal: AbortSignal.timeout(3000) },
    );
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
