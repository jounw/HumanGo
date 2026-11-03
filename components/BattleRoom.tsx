"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import TeamPicker from "@/components/TeamPicker";
import type { DexItem } from "@/lib/dex";
import {
  MOVE_INFO,
  type BattleState,
  type Fighter,
  type Move,
} from "@/lib/game/battle";
import { RARITY_LABEL, RARITY_STYLE } from "@/lib/game/rarity";
import { createClient } from "@/lib/supabase/client";

export type RoomBattle = {
  id: string;
  status: "pending" | "active" | "finished" | "declined" | "cancelled";
  state: BattleState | null;
  version: number;
  turnDeadline: string | null;
  winnerId: string | null;
  challengerChange: number | null;
  opponentChange: number | null;
  createdAt: string;
};

async function post(id: string, body: object) {
  const res = await fetch(`/api/battle/${id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "실패했어요.");
}

function HpBar({ f }: { f: Fighter }) {
  const pct = Math.max(0, Math.round((f.hp / f.stats.hp) * 100));
  return (
    <div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/15">
        <div
          className={`h-full transition-all duration-500 ${
            pct > 50 ? "bg-emerald-400" : pct > 20 ? "bg-amber-300" : "bg-rose-400"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-0.5 text-right text-[11px] text-white/60">
        {f.hp} / {f.stats.hp}
      </p>
    </div>
  );
}

export default function BattleRoom({
  battle: initial,
  mySide,
  nicknames,
  userIds,
  images,
  myItems,
}: {
  battle: RoomBattle;
  mySide: 0 | 1;
  nicknames: [string, string];
  userIds: [string, string];
  images: Record<string, string>;
  myItems: DexItem[];
}) {
  const router = useRouter();
  const [b, setB] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [switching, setSwitching] = useState(false);
  const statusRef = useRef(b.status);

  // 서버가 새로 내려준 값이 더 최신이면 반영 (Realtime 이 놓쳤을 때의 보정)
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    if (initial.version >= b.version) setB(initial);
  }

  // 상태가 바뀌면(수락 등) 팀/이미지가 달라지므로 서버 데이터를 다시 불러온다
  useEffect(() => {
    if (statusRef.current !== b.status) {
      statusRef.current = b.status;
      router.refresh();
    }
  }, [b.status, router]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`battle-${b.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "battles",
          filter: `id=eq.${b.id}`,
        },
        (p) => {
          const n = p.new as Record<string, unknown>;
          setB((cur) => {
            if (typeof n.version === "number" && n.version < cur.version)
              return cur;
            return {
              ...cur,
              status: (n.status as RoomBattle["status"]) ?? cur.status,
              // TOAST 로 생략된 컬럼은 기존 값을 유지
              state: n.state !== undefined ? (n.state as BattleState | null) : cur.state,
              version: (n.version as number) ?? cur.version,
              turnDeadline:
                n.turn_deadline !== undefined
                  ? (n.turn_deadline as string | null)
                  : cur.turnDeadline,
              winnerId:
                n.winner_id !== undefined ? (n.winner_id as string | null) : cur.winnerId,
              challengerChange:
                (n.challenger_rating_change as number | null) ?? cur.challengerChange,
              opponentChange:
                (n.opponent_rating_change as number | null) ?? cur.opponentChange,
            };
          });
        },
      )
      .subscribe();
    // Realtime 이 끊겨도 진행되도록 주기적으로 서버 상태를 다시 읽는다
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 5000);
    return () => {
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [b.id, router]);

  const act = useCallback(
    async (body: object) => {
      setBusy(true);
      setError(null);
      try {
        await post(b.id, body);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "실패했어요.");
      } finally {
        setBusy(false);
        setSwitching(false);
      }
    },
    [b.id, router],
  );

  // 턴 타이머. 시간이 지나면 어느 쪽 클라이언트든 timeout 을 요청한다 (서버가 실제 만료 여부를 검증)
  const active = b.status === "active" && b.state?.winner === null;
  useEffect(() => {
    if (!active || !b.turnDeadline) return;
    const end = Date.parse(b.turnDeadline);
    let lastCall = 0;
    const tick = () => {
      const ms = end - Date.now();
      setLeft(Math.max(0, Math.ceil(ms / 1000)));
      if (ms < -1200 && Date.now() - lastCall > 3000) {
        lastCall = Date.now();
        post(b.id, { action: "timeout" })
          .then(() => router.refresh())
          .catch(() => {});
      }
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [active, b.turnDeadline, b.id, router]);

  // ---- 대기/종료 상태 ----
  if (b.status === "declined" || b.status === "cancelled")
    return (
      <p className="rounded-2xl bg-white/5 p-6 text-center">
        {b.status === "declined" ? "배틀 신청이 거절됐어요." : "배틀이 취소됐어요."}
      </p>
    );

  if (b.status === "pending") {
    if (mySide === 0)
      return (
        <section className="flex flex-col items-center gap-4 rounded-2xl bg-white/5 p-6 text-center">
          <p className="text-lg font-bold">{nicknames[1]}님의 수락을 기다리는 중…</p>
          <p className="text-sm text-white/60">10분 안에 수락하지 않으면 만료돼요.</p>
          <button
            disabled={busy}
            onClick={() => act({ action: "cancel" })}
            className="min-h-11 rounded-lg bg-white/10 px-5"
          >
            신청 취소
          </button>
          {error && <p className="text-sm text-rose-300">{error}</p>}
        </section>
      );
    return (
      <section className="flex flex-col gap-4">
        <p className="rounded-2xl bg-amber-300/15 p-4 text-center font-bold text-amber-100">
          {nicknames[0]}님이 배틀을 신청했어요!
        </p>
        <TeamPicker
          items={myItems}
          confirmLabel="수락하고 시작"
          busy={busy}
          error={error}
          onConfirm={(team) => act({ action: "accept", team })}
        />
        <button
          disabled={busy}
          onClick={() => act({ action: "decline" })}
          className="min-h-11 rounded-lg bg-white/10"
        >
          거절
        </button>
      </section>
    );
  }

  const s = b.state;
  if (!s) return <p className="text-center text-white/60">불러오는 중…</p>;

  const me = s.sides[mySide];
  const foe = s.sides[1 - mySide];
  const mine = me.team[me.active];
  const theirs = foe.team[foe.active];
  const myTurn = active && s.turn === mySide;
  const finished = b.status === "finished";
  const won = b.winnerId === userIds[mySide];
  const change = mySide === 0 ? b.challengerChange : b.opponentChange;

  const fighterCard = (f: Fighter, name: string, back: boolean) => (
    <div
      className={`flex flex-1 flex-col gap-2 rounded-2xl bg-white/5 p-3 ${RARITY_STYLE[f.rarity].ring}`}
    >
      <p className="truncate text-xs text-white/55">{name}</p>
      <div className={`aspect-square ${f.hp <= 0 ? "opacity-30 grayscale" : ""}`}>
        {images[f.captureId] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={images[f.captureId]}
            alt={f.name}
            className={`size-full object-contain ${back ? "-scale-x-100" : ""}`}
          />
        )}
      </div>
      <div>
        <p className="truncate text-sm font-bold">
          {f.name}{" "}
          <span className="text-[10px] font-normal text-white/50">
            {RARITY_LABEL[f.rarity]}
          </span>
        </p>
        <HpBar f={f} />
      </div>
    </div>
  );

  const dots = (side: Side2) => (
    <div className="flex gap-1">
      {side.team.map((f, i) => (
        <span
          key={i}
          className={`size-2.5 rounded-full ${f.hp > 0 ? "bg-emerald-400" : "bg-white/20"}`}
        />
      ))}
    </div>
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-xs text-white/60">
        <span>
          {nicknames[1 - mySide]} {dots(foe)}
        </span>
        <span>
          {nicknames[mySide]} (나) {dots(me)}
        </span>
      </div>

      <div className="flex gap-3">
        {fighterCard(theirs, nicknames[1 - mySide], false)}
        {fighterCard(mine, nicknames[mySide], true)}
      </div>

      {finished ? (
        <div
          className={`rounded-2xl p-5 text-center ${won ? "bg-emerald-400/20" : "bg-rose-400/20"}`}
        >
          <p className="text-3xl font-black">{won ? "승리!" : "패배…"}</p>
          {change != null && (
            <p className="mt-1 text-lg font-bold">
              레이팅 {change > 0 ? "+" : ""}
              {change}
            </p>
          )}
          <button
            onClick={() => router.push("/battle")}
            className="mt-4 min-h-11 rounded-lg bg-white/15 px-5 font-semibold"
          >
            로비로
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-center font-bold">
            {myTurn ? "내 차례!" : `${nicknames[1 - mySide]}님의 차례`}
            {left !== null && active && (
              <span
                className={`ml-2 text-sm ${left <= 10 ? "text-rose-300" : "text-white/55"}`}
              >
                {left}초
              </span>
            )}
          </p>
          {switching ? (
            <div className="flex flex-col gap-2">
              {me.team.map((f, i) =>
                i === me.active || f.hp <= 0 ? null : (
                  <button
                    key={i}
                    disabled={busy}
                    onClick={() =>
                      act({ action: "move", move: { type: "switch", index: i } satisfies Move })
                    }
                    className="min-h-12 rounded-xl bg-white/10 px-4 text-left font-semibold"
                  >
                    {f.name}{" "}
                    <span className="text-xs text-white/55">
                      HP {f.hp}/{f.stats.hp}
                    </span>
                  </button>
                ),
              )}
              <button
                onClick={() => setSwitching(false)}
                className="min-h-11 rounded-lg bg-white/5 text-sm"
              >
                취소
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {(["attack", "heavy", "guard"] as const).map((m) => (
                <button
                  key={m}
                  disabled={!myTurn || busy}
                  onClick={() => act({ action: "move", move: { type: m } })}
                  className="flex min-h-16 flex-col items-center justify-center rounded-xl bg-emerald-400 px-2 text-black disabled:opacity-35"
                >
                  <span className="font-black">{MOVE_INFO[m].label}</span>
                  <span className="text-[11px] opacity-70">{MOVE_INFO[m].desc}</span>
                </button>
              ))}
              <button
                disabled={
                  !myTurn ||
                  busy ||
                  !me.team.some((f, i) => i !== me.active && f.hp > 0)
                }
                onClick={() => setSwitching(true)}
                className="flex min-h-16 flex-col items-center justify-center rounded-xl bg-sky-300 px-2 text-black disabled:opacity-35"
              >
                <span className="font-black">교체</span>
                <span className="text-[11px] opacity-70">다른 캐릭터 출전</span>
              </button>
            </div>
          )}
          {error && <p className="text-center text-sm text-rose-300">{error}</p>}
          <button
            disabled={busy}
            onClick={() => {
              if (confirm("항복하면 패배로 기록돼요. 항복할까요?"))
                void act({ action: "resign" });
            }}
            className="self-center text-xs text-white/40 underline"
          >
            항복
          </button>
        </div>
      )}

      <ul className="flex max-h-48 flex-col-reverse gap-1 overflow-y-auto rounded-2xl bg-black/30 p-3 text-sm">
        {[...s.log].reverse().map((l, i) => (
          <li
            key={s.log.length - i}
            className={l.actor === mySide ? "text-emerald-200" : "text-rose-200"}
          >
            {l.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

type Side2 = BattleState["sides"][number];
