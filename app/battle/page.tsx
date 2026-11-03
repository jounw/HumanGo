import Link from "next/link";
import LiveRefresh from "@/components/LiveRefresh";
import { ELO_START } from "@/lib/game/elo";
import { createClient } from "@/lib/supabase/server";

const nowMs = () => Date.now();

export default async function BattleLobbyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: battles }, { data: fr }, { data: myRating }] =
    await Promise.all([
      supabase
        .from("battles")
        .select(
          "id,challenger_id,opponent_id,status,winner_id,challenger_rating_change,opponent_rating_change,updated_at",
        )
        .in("status", ["pending", "active", "finished"])
        .order("updated_at", { ascending: false })
        .limit(30),
      supabase
        .from("friendships")
        .select("requester_id,addressee_id")
        .eq("status", "accepted"),
      supabase
        .from("player_ratings")
        .select("rating,wins,losses")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  const friendIds = (fr ?? []).map((r) =>
    r.requester_id === user.id ? r.addressee_id : r.requester_id,
  );
  const allIds = [
    ...new Set([
      user.id,
      ...friendIds,
      ...(battles ?? []).flatMap((b) => [b.challenger_id, b.opponent_id]),
    ]),
  ];
  const [{ data: profiles }, { data: ratings }] = await Promise.all([
    supabase.from("profiles").select("id,nickname").in("id", allIds),
    supabase
      .from("player_ratings")
      .select("user_id,rating,wins,losses")
      .in("user_id", allIds),
  ]);
  const nick = new Map((profiles ?? []).map((p) => [p.id, p.nickname]));
  const rate = new Map((ratings ?? []).map((r) => [r.user_id, r]));

  const now = nowMs();
  const FRESH = 10 * 60_000;
  const live = (battles ?? []).filter(
    (b) =>
      b.status === "active" ||
      (b.status === "pending" && now - Date.parse(b.updated_at) < FRESH),
  );
  const incoming = live.filter(
    (b) => b.status === "pending" && b.opponent_id === user.id,
  );
  const others = live.filter((b) => !incoming.includes(b));
  const recent = (battles ?? [])
    .filter((b) => b.status === "finished")
    .slice(0, 5);

  const board = [user.id, ...friendIds]
    .map((id) => ({
      id,
      nickname: nick.get(id) ?? "알 수 없음",
      rating: rate.get(id)?.rating ?? ELO_START,
      wins: rate.get(id)?.wins ?? 0,
      losses: rate.get(id)?.losses ?? 0,
    }))
    .sort((a, b) => b.rating - a.rating);

  const vs = (b: { challenger_id: string; opponent_id: string }) =>
    `${nick.get(b.challenger_id) ?? "?"} vs ${nick.get(b.opponent_id) ?? "?"}`;
  const card = "flex items-center justify-between rounded-xl bg-white/5 px-4 py-3";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 py-6">
      <LiveRefresh tables={["battles"]} />
      <header className="flex items-center gap-3">
        <Link
          href="/home"
          aria-label="홈으로"
          className="flex size-11 items-center justify-center rounded-full bg-white/10 text-xl"
        >
          ←
        </Link>
        <h1 className="text-2xl font-black">배틀</h1>
        <Link
          href="/friends"
          className="ml-auto rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold"
        >
          친구
        </Link>
      </header>

      <section className="rounded-2xl bg-white/5 p-5">
        <p className="text-sm text-white/60">내 레이팅</p>
        <p className="text-4xl font-black">{myRating?.rating ?? ELO_START}</p>
        <p className="text-sm text-white/60">
          {myRating?.wins ?? 0}승 {myRating?.losses ?? 0}패
        </p>
      </section>

      {incoming.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold text-amber-200">
            도착한 배틀 신청 ({incoming.length})
          </h2>
          {incoming.map((b) => (
            <Link
              key={b.id}
              href={`/battle/${b.id}`}
              className={`${card} ring-2 ring-amber-300`}
            >
              <span className="font-semibold">
                {nick.get(b.challenger_id) ?? "?"}님의 도전!
              </span>
              <span className="text-sm">확인 →</span>
            </Link>
          ))}
        </section>
      )}

      {others.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">진행 중</h2>
          {others.map((b) => (
            <Link key={b.id} href={`/battle/${b.id}`} className={card}>
              <span>{vs(b)}</span>
              <span className="text-sm text-white/60">
                {b.status === "pending" ? "수락 대기" : "전투 중"} →
              </span>
            </Link>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">친구 랭킹</h2>
        <ul className="flex flex-col gap-2">
          {board.map((p, i) => (
            <li key={p.id} className={card}>
              <span className="w-6 text-white/50">{i + 1}</span>
              <div className="mr-auto min-w-0">
                <p className="truncate font-semibold">
                  {p.nickname}
                  {p.id === user.id && " (나)"}
                </p>
                <p className="text-xs text-white/50">
                  {p.rating} · {p.wins}승 {p.losses}패
                </p>
              </div>
              {p.id !== user.id && (
                <Link
                  href={`/battle/new?friend=${p.id}`}
                  className="min-h-10 rounded-lg bg-amber-300 px-3 py-2 text-sm font-bold text-black"
                >
                  도전
                </Link>
              )}
            </li>
          ))}
        </ul>
        {friendIds.length === 0 && (
          <p className="text-sm text-white/60">
            배틀은 친구끼리만 할 수 있어요.{" "}
            <Link href="/friends" className="underline">
              친구 추가하기
            </Link>
          </p>
        )}
      </section>

      {recent.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">최근 결과</h2>
          {recent.map((b) => {
            const won = b.winner_id === user.id;
            const delta =
              b.challenger_id === user.id
                ? b.challenger_rating_change
                : b.opponent_rating_change;
            return (
              <Link key={b.id} href={`/battle/${b.id}`} className={card}>
                <span>{vs(b)}</span>
                <span
                  className={`text-sm font-bold ${won ? "text-emerald-300" : "text-rose-300"}`}
                >
                  {won ? "승" : "패"}
                  {delta != null && ` ${delta > 0 ? "+" : ""}${delta}`}
                </span>
              </Link>
            );
          })}
        </section>
      )}
    </main>
  );
}
