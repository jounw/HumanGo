"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NICKNAME_MAX } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";

export type Person = {
  id: string; // friendships.id
  userId: string;
  nickname: string;
  rating: number;
};

type Found = { id: string; nickname: string };

async function call(body: object) {
  const res = await fetch("/api/friends", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "실패했어요.");
  return json;
}

export default function FriendsClient({
  userId,
  friends,
  incoming,
  outgoing,
}: {
  userId: string;
  friends: Person[];
  incoming: Person[];
  outgoing: Person[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (!term) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const safe = term.replace(/[\\%_]/g, (c) => `\\${c}`);
      const { data } = await createClient()
        .from("profiles")
        .select("id,nickname")
        .ilike("nickname", `%${safe}%`)
        .neq("id", userId)
        .limit(10);
      if (!cancelled) setResults(data ?? []);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, userId]);

  const known = new Set(
    [...friends, ...incoming, ...outgoing].map((p) => p.userId),
  );

  async function run(key: string, body: object, ok?: string) {
    setBusy(key);
    setMsg(null);
    try {
      await call(body);
      if (ok) setMsg(ok);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "실패했어요.");
    } finally {
      setBusy(null);
    }
  }

  const btn =
    "min-h-10 rounded-lg px-3 text-sm font-semibold disabled:opacity-40";

  return (
    <>
      <section className="flex flex-col gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={NICKNAME_MAX}
          placeholder="닉네임으로 트레이너 검색"
          aria-label="닉네임 검색"
          className="min-h-12 rounded-xl bg-white/10 px-4 outline-none ring-1 ring-white/10 focus:ring-emerald-300"
        />
        {msg && <p className="text-sm text-emerald-200">{msg}</p>}
        {q.trim() && (
          <ul className="flex flex-col gap-2">
            {results.length === 0 && (
              <li className="text-sm text-white/50">검색 결과가 없어요.</li>
            )}
            {results.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-2"
              >
                <span className="font-semibold">{r.nickname}</span>
                {known.has(r.id) ? (
                  <span className="text-xs text-white/50">
                    이미 친구이거나 요청 중
                  </span>
                ) : (
                  <button
                    disabled={busy === r.id}
                    onClick={() =>
                      run(
                        r.id,
                        { action: "request", userId: r.id },
                        `${r.nickname}님에게 친구 요청을 보냈어요.`,
                      )
                    }
                    className={`${btn} bg-emerald-400 text-black`}
                  >
                    친구 요청
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {incoming.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">받은 요청 ({incoming.length})</h2>
          <ul className="flex flex-col gap-2">
            {incoming.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2"
              >
                <span className="mr-auto font-semibold">{p.nickname}</span>
                <button
                  disabled={busy === p.id}
                  onClick={() => run(p.id, { action: "accept", id: p.id })}
                  className={`${btn} bg-emerald-400 text-black`}
                >
                  수락
                </button>
                <button
                  disabled={busy === p.id}
                  onClick={() => run(p.id, { action: "decline", id: p.id })}
                  className={`${btn} bg-white/10`}
                >
                  거절
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {outgoing.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">보낸 요청</h2>
          <ul className="flex flex-col gap-2">
            {outgoing.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2"
              >
                <span className="mr-auto">{p.nickname}</span>
                <button
                  disabled={busy === p.id}
                  onClick={() => run(p.id, { action: "remove", id: p.id })}
                  className={`${btn} bg-white/10`}
                >
                  취소
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">내 친구 ({friends.length})</h2>
        {friends.length === 0 ? (
          <p className="rounded-2xl bg-white/5 p-5 text-center text-sm text-white/60">
            아직 친구가 없어요. 위에서 닉네임으로 검색해 보세요.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {friends.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2"
              >
                <div className="mr-auto min-w-0">
                  <p className="truncate font-semibold">{p.nickname}</p>
                  <p className="text-xs text-white/50">레이팅 {p.rating}</p>
                </div>
                <Link
                  href={`/battle/new?friend=${p.userId}`}
                  className={`${btn} grid place-items-center bg-amber-300 text-black`}
                >
                  배틀
                </Link>
                <button
                  disabled={busy === p.id}
                  onClick={() => {
                    if (confirm(`${p.nickname}님을 친구에서 삭제할까요?`))
                      void run(p.id, { action: "remove", id: p.id });
                  }}
                  className={`${btn} bg-white/10 text-white/70`}
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
