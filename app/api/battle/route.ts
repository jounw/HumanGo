// 배틀 신청: 친구에게만, 팀(캐릭터 1~3마리)을 골라서.
import { NextResponse } from "next/server";
import {
  areFriends,
  authed,
  fail,
  loadTeam,
  PENDING_TTL_MS,
  UUID,
} from "@/lib/battle/server";

export async function POST(req: Request) {
  const a = await authed();
  if ("error" in a) return a.error;
  const { user, admin } = a;

  let body: { friendId?: string; team?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "잘못된 요청이에요.");
  }
  const friendId = body.friendId;
  if (!friendId || !UUID.test(friendId)) return fail(400, "잘못된 대상이에요.");
  if (!(await areFriends(admin, user.id, friendId)))
    return fail(403, "친구에게만 배틀을 신청할 수 있어요.");

  const loaded = await loadTeam(admin, user.id, body.team);
  if ("error" in loaded) return fail(400, loaded.error);

  // 오래된 대기 중 신청은 정리한 뒤, 이 둘 사이에 진행 중인 배틀이 있으면 막는다
  const pair = `and(challenger_id.eq.${user.id},opponent_id.eq.${friendId}),and(challenger_id.eq.${friendId},opponent_id.eq.${user.id})`;
  await admin
    .from("battles")
    .update({ status: "cancelled" })
    .eq("status", "pending")
    .lt("created_at", new Date(Date.now() - PENDING_TTL_MS).toISOString())
    .or(pair);
  // 아무도 접속하지 않아 방치된 진행 중 배틀도 정리 (마지막 변경 후 30분)
  await admin
    .from("battles")
    .update({ status: "cancelled" })
    .eq("status", "active")
    .lt("updated_at", new Date(Date.now() - 30 * 60_000).toISOString())
    .or(pair);
  const { data: open } = await admin
    .from("battles")
    .select("id")
    .in("status", ["pending", "active"])
    .or(pair)
    .limit(1);
  if (open?.length) return fail(409, "이미 진행 중인 배틀이 있어요.");

  const { data, error } = await admin
    .from("battles")
    .insert({
      challenger_id: user.id,
      opponent_id: friendId,
      challenger_team: loaded.team.map((f) => f.captureId),
    })
    .select("id")
    .single();
  if (error || !data) return fail(500, "배틀을 신청하지 못했어요.");
  return NextResponse.json({ id: data.id });
}
