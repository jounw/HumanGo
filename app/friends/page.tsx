import Link from "next/link";
import FriendsClient, { type Person } from "@/components/FriendsClient";
import LiveRefresh from "@/components/LiveRefresh";
import { ELO_START } from "@/lib/game/elo";
import { createClient } from "@/lib/supabase/server";

export default async function FriendsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // proxy 가 이미 /login 으로 보낸다

  // RLS 때문에 내가 관련된 행만 온다
  const { data: rows } = await supabase
    .from("friendships")
    .select("id,requester_id,addressee_id,status")
    .order("created_at", { ascending: false });

  const others = new Set<string>();
  for (const r of rows ?? [])
    others.add(r.requester_id === user.id ? r.addressee_id : r.requester_id);
  const ids = [...others];

  const [{ data: profiles }, { data: ratings }] = ids.length
    ? await Promise.all([
        supabase.from("profiles").select("id,nickname").in("id", ids),
        supabase
          .from("player_ratings")
          .select("user_id,rating")
          .in("user_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const nick = new Map((profiles ?? []).map((p) => [p.id, p.nickname]));
  const rate = new Map((ratings ?? []).map((r) => [r.user_id, r.rating]));

  const friends: Person[] = [];
  const incoming: Person[] = [];
  const outgoing: Person[] = [];
  for (const r of rows ?? []) {
    const mine = r.requester_id === user.id;
    const userId = mine ? r.addressee_id : r.requester_id;
    const p: Person = {
      id: r.id,
      userId,
      nickname: nick.get(userId) ?? "알 수 없음",
      rating: rate.get(userId) ?? ELO_START,
    };
    if (r.status === "accepted") friends.push(p);
    else (mine ? outgoing : incoming).push(p);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 py-6">
      <LiveRefresh tables={["friendships"]} />
      <header className="flex items-center gap-3">
        <Link
          href="/home"
          aria-label="홈으로"
          className="flex size-11 items-center justify-center rounded-full bg-white/10 text-xl"
        >
          ←
        </Link>
        <h1 className="text-2xl font-black">친구</h1>
        <Link
          href="/battle"
          className="ml-auto rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold"
        >
          배틀 ⚔
        </Link>
      </header>
      <FriendsClient
        userId={user.id}
        friends={friends}
        incoming={incoming}
        outgoing={outgoing}
      />
    </main>
  );
}
