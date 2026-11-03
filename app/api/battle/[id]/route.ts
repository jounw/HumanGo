// 배틀 진행: 수락/거절/취소/행동/시간초과/항복. 모든 계산은 서버가 한다.
import { NextResponse } from "next/server";
import {
  authed,
  deadline,
  fail,
  loadTeam,
  PENDING_TTL_MS,
  saveState,
  UUID,
  type BattleRow,
} from "@/lib/battle/server";
import {
  applyMove,
  initBattle,
  resign,
  validateMove,
  type Move,
} from "@/lib/game/battle";
import { secureRng } from "@/lib/game/rollPolicy";

const GRACE_MS = 1000; // 시계 오차 여유

export async function POST(
  req: Request,
  ctx: RouteContext<"/api/battle/[id]">,
) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return fail(400, "잘못된 배틀이에요.");
  const a = await authed();
  if ("error" in a) return a.error;
  const { user, admin } = a;

  let body: { action?: string; team?: unknown; move?: Move };
  try {
    body = await req.json();
  } catch {
    return fail(400, "잘못된 요청이에요.");
  }

  const { data } = await admin
    .from("battles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const battle = data as BattleRow | null;
  if (!battle || (battle.challenger_id !== user.id && battle.opponent_id !== user.id))
    return fail(404, "배틀을 찾을 수 없어요.");
  const mySide = battle.challenger_id === user.id ? 0 : 1;
  const set = async (patch: Record<string, unknown>) => {
    const { data: ok } = await admin
      .from("battles")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("version", battle.version)
      .select("id");
    return !!ok?.length;
  };
  const conflict = () => fail(409, "다른 동작과 겹쳤어요. 다시 시도해 주세요.");

  if (battle.status === "pending") {
    if (body.action === "cancel" && mySide === 0) {
      return (await set({ status: "cancelled", version: battle.version + 1 }))
        ? NextResponse.json({ ok: true })
        : conflict();
    }
    if (body.action === "decline" && mySide === 1) {
      return (await set({ status: "declined", version: battle.version + 1 }))
        ? NextResponse.json({ ok: true })
        : conflict();
    }
    if (body.action === "accept" && mySide === 1) {
      if (Date.now() - Date.parse(battle.created_at) > PENDING_TTL_MS)
        return fail(410, "신청이 만료됐어요.");
      const mine = await loadTeam(admin, user.id, body.team);
      if ("error" in mine) return fail(400, mine.error);
      const theirs = await loadTeam(
        admin,
        battle.challenger_id,
        battle.challenger_team,
      );
      if ("error" in theirs)
        return fail(409, "상대 캐릭터가 사라져서 시작할 수 없어요.");
      const state = initBattle(
        { userId: battle.challenger_id, team: theirs.team },
        { userId: user.id, team: mine.team },
      );
      const ok = await set({
        status: "active",
        opponent_team: mine.team.map((f) => f.captureId),
        state,
        version: battle.version + 1,
        turn_deadline: deadline(),
      });
      return ok ? NextResponse.json({ ok: true }) : conflict();
    }
    return fail(400, "지금은 할 수 없는 동작이에요.");
  }

  if (battle.status !== "active" || !battle.state)
    return fail(400, "진행 중인 배틀이 아니에요.");
  const state = battle.state;

  if (body.action === "move") {
    if (state.turn !== mySide) return fail(400, "내 차례가 아니에요.");
    const move = body.move;
    if (!move || typeof move !== "object") return fail(400, "행동을 골라 주세요.");
    const clean: Move =
      move.type === "switch"
        ? { type: "switch", index: Number(move.index) }
        : ({ type: move.type } as Move);
    const err = validateMove(state, clean);
    if (err) return fail(400, err);
    const next = applyMove(state, clean, secureRng());
    return (await saveState(admin, battle, next))
      ? NextResponse.json({ ok: true })
      : conflict();
  }

  if (body.action === "timeout") {
    // 어느 쪽 클라이언트가 불러도 되지만 실제로 시간이 지났을 때만 처리
    const due =
      battle.turn_deadline && Date.parse(battle.turn_deadline) + GRACE_MS < Date.now();
    if (!due) return fail(400, "아직 시간이 남았어요.");
    const next = applyMove(state, { type: "attack" }, secureRng(), { idle: true });
    return (await saveState(admin, battle, next))
      ? NextResponse.json({ ok: true })
      : conflict();
  }

  if (body.action === "resign") {
    const next = resign(state, mySide as 0 | 1);
    return (await saveState(admin, battle, next))
      ? NextResponse.json({ ok: true })
      : conflict();
  }

  return fail(400, "알 수 없는 동작이에요.");
}
