"use client";

import { useEffect, useState } from "react";
import { RARITY_LABEL } from "@/lib/game/rarity";
import type { Rarity } from "@/lib/constants";

type Point = {
  t: number;
  requests: number;
  app: number;
  sb: number;
  in: number;
  out: number;
  errors: number;
  avgMs: number;
};
type Stats = {
  at: number;
  deploy: {
    sha: string;
    subject: string;
    builtAt: string | null;
    migrations: { name: string; appliedAt: string }[] | null;
  };
  db: {
    users: number;
    users24h: number;
    users7d: number;
    captures: number;
    captures24h: number;
    captures7d: number;
    battlesFinished: number;
    battlesActive: number;
    friendships: number;
    byRarity: { rarity: Rarity; count: number }[];
    userSeries: { day: string; count: number }[];
    captureSeries: { day: string; count: number }[];
  };
  host: {
    cpuPercent: number;
    cores: number;
    mem: { total: number; free: number };
    disks: { mount: string; total: number; free: number }[];
    osUptimeSec: number;
    appUptimeSec: number;
    appRssMb: number;
    containers: { name: string; cpu: number; memMb: number }[] | null;
  };
  traffic: null | {
    uptimeSec: number;
    inflight: number;
    sockets: number;
    total: { requests: number; in: number; out: number };
    uniqueVisitorsToday: number;
    last5min: {
      requests: number;
      rpm: number;
      in: number;
      out: number;
      avgMs: number;
      errors5xx: number;
    };
    last24h: { requests: number; in: number; out: number; s4: number; s5: number };
    minutes: Point[];
    hours: Point[];
  };
};

const nf = new Intl.NumberFormat("ko-KR");
const bytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 2 : 1)} ${u[i]}`;
};
const dur = (s: number) => {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}일 ${h}시간` : h ? `${h}시간 ${m}분` : `${m}분`;
};

function Card({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl bg-white/5 p-4">
      <p className="text-xs text-white/55">{label}</p>
      <p className="text-3xl font-black tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-white/50">{sub}</p>}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Bars({
  data,
  label,
  color = "bg-emerald-400",
  format = nf.format,
}: {
  data: { key: string; value: number }[];
  label: (key: string) => string;
  color?: string;
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      <div className="flex h-28 items-end gap-0.5" role="img" aria-label="차트">
        {data.map((d) => (
          <div
            key={d.key}
            title={`${label(d.key)}: ${format(d.value)}`}
            className="flex h-full flex-1 items-end"
          >
            <div
              className={`w-full rounded-t ${color}`}
              style={{ height: `${Math.max(d.value ? 3 : 0, (d.value / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-white/45">
        <span>{data.length ? label(data[0].key) : ""}</span>
        <span>최대 {format(max)}</span>
        <span>{data.length ? label(data[data.length - 1].key) : ""}</span>
      </div>
    </div>
  );
}

function Meter({
  label,
  percent,
  detail,
}: {
  label: string;
  percent: number;
  detail: string;
}) {
  const p = Math.min(100, Math.max(0, percent));
  return (
    <div className="rounded-2xl bg-white/5 p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-xs text-white/55">{label}</p>
        <p className="text-2xl font-black tabular-nums">{p}%</p>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/15">
        <div
          className={`h-full transition-all ${
            p < 60 ? "bg-emerald-400" : p < 85 ? "bg-amber-300" : "bg-rose-400"
          }`}
          style={{ width: `${p}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-white/50">{detail}</p>
    </div>
  );
}

const hhmm = (t: number) =>
  new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
const hour = (t: number) =>
  new Date(t).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", hour12: false });

export default function AdminDashboard() {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [range, setRange] = useState<"minutes" | "hours">("minutes");

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/admin/stats", { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status}`);
        const json = (await res.json()) as Stats;
        if (alive) {
          setS(json);
          setErr(null);
        }
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : "오류");
      }
    }
    void load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!s)
    return (
      <p className="text-white/60">
        {err ? `불러오지 못했어요 (${err})` : "불러오는 중…"}
      </p>
    );

  const { db, host, traffic, deploy } = s;
  const memUsed = host.mem.total - host.mem.free;
  const series = traffic?.[range] ?? [];
  const label = range === "minutes" ? hhmm : hour;
  const errRate =
    traffic && traffic.last24h.requests
      ? ((traffic.last24h.s5 / traffic.last24h.requests) * 100).toFixed(2)
      : "0";

  return (
    <>
      <p className="text-xs text-white/45">
        {new Date(s.at).toLocaleTimeString("ko-KR")} 기준 · 5초마다 자동 갱신
        {err && <span className="ml-2 text-rose-300">(갱신 실패: {err})</span>}
      </p>

      <Section title="배포 상태">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-xs text-white/55">지금 돌고 있는 빌드</p>
            <p className="font-mono text-2xl font-black">
              {deploy.sha === "unknown" ? "unknown" : deploy.sha.slice(0, 7)}
            </p>
            <p className="mt-1 truncate text-sm text-white/70">
              {deploy.subject}
            </p>
            {deploy.builtAt && (
              <p className="mt-1 text-xs text-white/50">
                빌드 {new Date(deploy.builtAt).toLocaleString("ko-KR")}
              </p>
            )}
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-xs text-white/55">적용된 마이그레이션</p>
            {deploy.migrations ? (
              <ul className="mt-1 flex max-h-32 flex-col gap-0.5 overflow-y-auto font-mono text-xs text-white/70">
                {[...deploy.migrations].reverse().map((m) => (
                  <li key={m.name}>{m.name}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-white/50">
                기록 테이블이 없어요
              </p>
            )}
          </div>
        </div>
      </Section>

      <Section title="서비스 현황">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card
            label="총 가입자"
            value={nf.format(db.users)}
            sub={`24시간 +${nf.format(db.users24h)} · 7일 +${nf.format(db.users7d)}`}
          />
          <Card
            label="잡은 캐릭터"
            value={nf.format(db.captures)}
            sub={`24시간 +${nf.format(db.captures24h)} · 7일 +${nf.format(db.captures7d)}`}
          />
          <Card
            label="오늘 방문자"
            value={traffic ? nf.format(traffic.uniqueVisitorsToday) : "-"}
            sub="고유 접속지 수(IP 해시, 한국시간 기준)"
          />
          <Card
            label="배틀"
            value={nf.format(db.battlesFinished)}
            sub={`종료 기준 · 진행 중 ${db.battlesActive} · 친구 관계 ${nf.format(db.friendships)}`}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="mb-2 text-sm font-semibold">일별 가입자 (최근 14일)</p>
            <Bars
              data={db.userSeries.map((d) => ({ key: d.day, value: d.count }))}
              label={(k) => k.slice(5)}
              color="bg-sky-400"
            />
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="mb-2 text-sm font-semibold">일별 포획 (최근 14일)</p>
            <Bars
              data={db.captureSeries.map((d) => ({ key: d.day, value: d.count }))}
              label={(k) => k.slice(5)}
            />
          </div>
        </div>
        <div className="rounded-2xl bg-white/5 p-4">
          <p className="mb-2 text-sm font-semibold">희귀도별 포획 수</p>
          <ul className="flex flex-col gap-1.5">
            {db.byRarity.map((r) => {
              const max = Math.max(1, ...db.byRarity.map((x) => x.count));
              return (
                <li key={r.rarity} className="flex items-center gap-3 text-sm">
                  <span className="w-10 shrink-0 text-white/60">
                    {RARITY_LABEL[r.rarity]}
                  </span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full bg-amber-300"
                      style={{ width: `${(r.count / max) * 100}%` }}
                    />
                  </div>
                  <span className="w-14 text-right tabular-nums">{nf.format(r.count)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </Section>

      <Section title="서버 트래픽">
        {!traffic ? (
          <p className="rounded-2xl bg-amber-300/15 p-4 text-sm text-amber-100">
            게이트웨이 통계에 연결할 수 없어요. 게이트웨이(scripts/gateway.mjs)가 최신 버전으로
            실행 중인지 확인해 주세요.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Card
                label="분당 요청 (최근 5분)"
                value={nf.format(traffic.last5min.rpm)}
                sub={`5분 합계 ${nf.format(traffic.last5min.requests)}`}
              />
              <Card
                label="평균 응답시간"
                value={`${nf.format(traffic.last5min.avgMs)}ms`}
                sub={`5xx 오류 ${traffic.last5min.errors5xx}건`}
              />
              <Card
                label="동시 처리"
                value={nf.format(traffic.inflight)}
                sub={`실시간 연결(WebSocket) ${traffic.sockets}`}
              />
              <Card
                label="24시간 요청"
                value={nf.format(traffic.last24h.requests)}
                sub={`4xx ${nf.format(traffic.last24h.s4)} · 5xx ${nf.format(traffic.last24h.s5)} (${errRate}%)`}
              />
              <Card
                label="최근 5분 전송량"
                value={bytes(traffic.last5min.out)}
                sub={`받음 ${bytes(traffic.last5min.in)}`}
              />
              <Card
                label="24시간 전송량"
                value={bytes(traffic.last24h.out)}
                sub={`받음 ${bytes(traffic.last24h.in)}`}
              />
              <Card
                label="누적 요청"
                value={nf.format(traffic.total.requests)}
                sub={`보냄 ${bytes(traffic.total.out)} · 받음 ${bytes(traffic.total.in)}`}
              />
              <Card
                label="게이트웨이 가동"
                value={dur(traffic.uptimeSec)}
                sub="재시작해도 누적 기록은 유지돼요"
              />
            </div>

            <div className="rounded-2xl bg-white/5 p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">
                  요청 수 ({range === "minutes" ? "최근 60분, 분 단위" : "최근 48시간, 시간 단위"})
                </p>
                <div className="flex gap-1 rounded-lg bg-white/5 p-0.5 text-xs">
                  {(["minutes", "hours"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setRange(r)}
                      className={`rounded-md px-2.5 py-1.5 ${range === r ? "bg-white/15" : "text-white/55"}`}
                    >
                      {r === "minutes" ? "분" : "시간"}
                    </button>
                  ))}
                </div>
              </div>
              <Bars
                data={series.map((p) => ({ key: String(p.t), value: p.requests }))}
                label={(k) => label(Number(k))}
              />
              <p className="mt-3 mb-2 text-sm font-semibold">전송량(내보낸 데이터)</p>
              <Bars
                data={series.map((p) => ({ key: String(p.t), value: p.out }))}
                label={(k) => label(Number(k))}
                color="bg-violet-400"
                format={bytes}
              />
              <p className="mt-3 mb-2 text-sm font-semibold">평균 응답시간(ms)</p>
              <Bars
                data={series.map((p) => ({ key: String(p.t), value: p.avgMs }))}
                label={(k) => label(Number(k))}
                color="bg-amber-300"
              />
            </div>
          </>
        )}
      </Section>

      <Section title="서버 부하">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Meter
            label="CPU"
            percent={host.cpuPercent}
            detail={`${host.cores}스레드`}
          />
          <Meter
            label="메모리"
            percent={Math.round((memUsed / host.mem.total) * 100)}
            detail={`${bytes(memUsed)} / ${bytes(host.mem.total)}`}
          />
          {host.disks.map((d) => (
            <Meter
              key={d.mount}
              label={`디스크 (${d.mount}${d.mount === "D:" ? " HDD · 데이터" : " SSD"})`}
              percent={Math.round(((d.total - d.free) / d.total) * 100)}
              detail={`여유 ${bytes(d.free)} / ${bytes(d.total)}`}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Card label="PC 가동 시간" value={dur(host.osUptimeSec)} />
          <Card label="앱 가동 시간" value={dur(host.appUptimeSec)} sub={`앱 메모리 ${host.appRssMb} MB`} />
          <Card
            label="Supabase 컨테이너"
            value={host.containers ? `${host.containers.length}개` : "-"}
            sub={
              host.containers
                ? `합계 메모리 ${nf.format(host.containers.reduce((a, c) => a + c.memMb, 0))} MB`
                : "docker 상태를 읽지 못했어요"
            }
          />
        </div>
        {host.containers && (
          <div className="overflow-x-auto rounded-2xl bg-white/5">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-white/50">
                <tr>
                  <th className="px-4 py-2">컨테이너</th>
                  <th className="px-4 py-2 text-right">CPU</th>
                  <th className="px-4 py-2 text-right">메모리</th>
                </tr>
              </thead>
              <tbody>
                {host.containers.map((c) => (
                  <tr key={c.name} className="border-t border-white/5">
                    <td className="px-4 py-2">{c.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{c.cpu.toFixed(1)}%</td>
                    <td className="px-4 py-2 text-right tabular-nums">{nf.format(c.memMb)} MB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
