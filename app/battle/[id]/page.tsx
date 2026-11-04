import Link from "next/link";
import { notFound } from "next/navigation";
import BattleRoom, { type RoomBattle } from "@/components/BattleRoom";
import { UUID } from "@/lib/battle/server";
import { listCaptures, signUrls } from "@/lib/dex";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function BattlePage(props: PageProps<"/battle/[id]">) {
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: b } = await supabase
    .from("battles")
    .select(
      "id,challenger_id,opponent_id,status,challenger_team,opponent_team,state,version,turn_deadline,winner_id,challenger_rating_change,opponent_rating_change,created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!b) notFound();

  const mySide =
    b.challenger_id === user.id ? 0 : b.opponent_id === user.id ? 1 : -1;
  if (mySide === -1) notFound();

  // 나만 보기 캐릭터도 이 배틀의 참가자에게는 보여야 하므로 (참가자 확인 후) 팀 이미지는 admin 으로 읽는다.
  const reader = createAdminClient() ?? supabase;
  const teamIds = [...(b.challenger_team ?? []), ...(b.opponent_team ?? [])];
  const [{ data: profiles }, { data: caps }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,nickname")
      .in("id", [b.challenger_id, b.opponent_id]),
    teamIds.length
      ? reader.from("captures").select("id,character_path").in("id", teamIds)
      : Promise.resolve({ data: [] }),
  ]);
  const nick = (uid: string) =>
    profiles?.find((p) => p.id === uid)?.nickname ?? "알 수 없음";

  const urls = await signUrls(
    reader,
    (caps ?? []).map((c) => c.character_path),
  );
  const images: Record<string, string> = {};
  for (const c of caps ?? []) {
    const u = urls.get(c.character_path);
    if (u) images[c.id] = u;
  }

  const needsPick = b.status === "pending" && mySide === 1;
  const myItems = needsPick
    ? await listCaptures(supabase, { ownerId: user.id })
    : [];

  const battle: RoomBattle = {
    id: b.id,
    status: b.status,
    state: b.state,
    version: b.version,
    turnDeadline: b.turn_deadline,
    winnerId: b.winner_id,
    challengerChange: b.challenger_rating_change,
    opponentChange: b.opponent_rating_change,
    createdAt: b.created_at,
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-4">
      <header className="flex items-center gap-3">
        <Link
          href="/battle"
          aria-label="배틀 로비로"
          className="flex size-11 items-center justify-center rounded-full bg-white/10 text-xl"
        >
          ←
        </Link>
        <h1 className="truncate text-lg font-black">
          {nick(b.challenger_id)} vs {nick(b.opponent_id)}
        </h1>
      </header>
      <BattleRoom
        battle={battle}
        mySide={mySide as 0 | 1}
        nicknames={[nick(b.challenger_id), nick(b.opponent_id)]}
        userIds={[b.challenger_id, b.opponent_id]}
        images={images}
        myItems={myItems}
      />
    </main>
  );
}
