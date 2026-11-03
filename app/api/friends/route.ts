// 친구 요청/수락/거절/삭제. 모든 변경은 서버에서 검증한 뒤 수행한다.
import { NextResponse } from "next/server";
import { authed, fail, UUID } from "@/lib/battle/server";

export async function POST(req: Request) {
  const a = await authed();
  if ("error" in a) return a.error;
  const { user, admin } = a;

  let body: { action?: string; userId?: string; id?: string };
  try {
    body = await req.json();
  } catch {
    return fail(400, "잘못된 요청이에요.");
  }

  if (body.action === "request") {
    const target = body.userId;
    if (!target || !UUID.test(target)) return fail(400, "잘못된 대상이에요.");
    if (target === user.id) return fail(400, "나 자신은 친구로 추가할 수 없어요.");
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("id", target)
      .maybeSingle();
    if (!profile) return fail(404, "그런 트레이너가 없어요.");

    const { data: existing } = await admin
      .from("friendships")
      .select("id,requester_id,status")
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${target}),and(requester_id.eq.${target},addressee_id.eq.${user.id})`,
      )
      .maybeSingle();
    if (existing) {
      if (existing.status === "accepted") return fail(409, "이미 친구예요.");
      if (existing.requester_id === user.id)
        return fail(409, "이미 요청을 보냈어요.");
      // 상대가 먼저 보낸 요청이 있으면 바로 친구가 된다
      await admin
        .from("friendships")
        .update({ status: "accepted" })
        .eq("id", existing.id);
      return NextResponse.json({ ok: true, accepted: true });
    }
    const { error } = await admin
      .from("friendships")
      .insert({ requester_id: user.id, addressee_id: target });
    if (error) return fail(500, "요청을 보내지 못했어요.");
    return NextResponse.json({ ok: true });
  }

  const id = body.id;
  if (!id || !UUID.test(id)) return fail(400, "잘못된 요청이에요.");
  const { data: row } = await admin
    .from("friendships")
    .select("id,requester_id,addressee_id,status")
    .eq("id", id)
    .maybeSingle();
  if (!row || (row.requester_id !== user.id && row.addressee_id !== user.id))
    return fail(404, "찾을 수 없어요.");

  if (body.action === "accept") {
    if (row.addressee_id !== user.id || row.status !== "pending")
      return fail(400, "수락할 수 없는 요청이에요.");
    await admin.from("friendships").update({ status: "accepted" }).eq("id", id);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "decline" || body.action === "remove") {
    // 거절/요청 취소/친구 삭제 모두 행 삭제
    await admin.from("friendships").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  }
  return fail(400, "알 수 없는 동작이에요.");
}
