// 서버 전용: 친구/배틀 API 가 공유하는 헬퍼. service_role 클라이언트로 DB 를 다룬다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isRarity } from "@/lib/game/rarity";
import {
  MAX_TEAM,
  TURN_SECONDS,
  type BattleState,
  type FighterInput,
} from "@/lib/game/battle";
import { ELO_START, eloResult } from "@/lib/game/elo";
import { statsFor } from "@/lib/game/stats";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const fail = (status: number, error: string) =>
  NextResponse.json({ error }, { status });

export type BattleRow = {
  id: string;
  challenger_id: string;
  opponent_id: string;
  status: "pending" | "active" | "finished" | "declined" | "cancelled";
  challenger_team: string[];
  opponent_team: string[] | null;
  state: BattleState | null;
  version: number;
  turn_deadline: string | null;
  winner_id: string | null;
  challenger_rating_change: number | null;
  opponent_rating_change: number | null;
  created_at: string;
  updated_at: string;
};

export const PENDING_TTL_MS = 10 * 60_000;

/** 로그인 사용자 + admin 클라이언트. 실패하면 응답(Response)을 돌려준다. */
export async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: fail(401, "로그인이 필요해요.") } as const;
  const admin = createAdminClient();
  if (!admin) return { error: fail(503, "서버 설정이 끝나지 않았어요.") } as const;
  return { user, admin } as const;
}

export async function areFriends(admin: SupabaseClient, a: string, b: string) {
  const { data } = await admin
    .from("friendships")
    .select("id")
    .eq("status", "accepted")
    .or(
      `and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`,
    )
    .maybeSingle();
  return !!data;
}

/** 팀(캡처 id 1~3개)이 본인 소유인지 확인하고 전투용 데이터로 바꾼다. */
export async function loadTeam(
  admin: SupabaseClient,
  userId: string,
  ids: unknown,
): Promise<{ team: FighterInput[] } | { error: string }> {
  if (
    !Array.isArray(ids) ||
    ids.length < 1 ||
    ids.length > MAX_TEAM ||
    !ids.every((i) => typeof i === "string" && UUID.test(i)) ||
    new Set(ids).size !== ids.length
  )
    return { error: `캐릭터를 1~${MAX_TEAM}마리 골라 주세요.` };
  const { data } = await admin
    .from("captures")
    .select("id,name,rarity")
    .eq("owner_id", userId)
    .in("id", ids as string[]);
  if (!data || data.length !== ids.length)
    return { error: "내 캐릭터가 아닌 항목이 있어요." };
  const byId = new Map(data.map((r) => [r.id as string, r]));
  return {
    team: (ids as string[]).map((id) => {
      const r = byId.get(id)!;
      const rarity = isRarity(r.rarity) ? r.rarity : "common";
      return {
        captureId: id,
        name: r.name as string,
        rarity,
        stats: statsFor(id, rarity),
      };
    }),
  };
}

export const deadline = () =>
  new Date(Date.now() + TURN_SECONDS * 1000).toISOString();

/**
 * 상태 저장(낙관적 락). version 이 같을 때만 갱신한다. 승자가 정해졌으면 종료 처리와 ELO 정산도 한다.
 * 동시에 두 요청이 오면 한쪽은 false 를 돌려받는다.
 */
export async function saveState(
  admin: SupabaseClient,
  battle: BattleRow,
  state: BattleState,
): Promise<boolean> {
  const finished = state.winner !== null;
  const patch: Record<string, unknown> = {
    state,
    version: battle.version + 1,
    updated_at: new Date().toISOString(),
    turn_deadline: finished ? null : deadline(),
  };
  let result: { winnerId: string; loserId: string; w: number; l: number } | null =
    null;
  if (finished) {
    const winnerId = state.sides[state.winner!].userId;
    const loserId = state.sides[1 - state.winner!].userId;
    patch.status = "finished";
    patch.winner_id = winnerId;
    const { data: rows } = await admin
      .from("player_ratings")
      .select("user_id,rating")
      .in("user_id", [winnerId, loserId]);
    const get = (id: string) =>
      rows?.find((r) => r.user_id === id)?.rating ?? ELO_START;
    const elo = eloResult(get(winnerId), get(loserId));
    result = { winnerId, loserId, w: elo.winner, l: elo.loser };
    const wc = elo.delta;
    const lc = -elo.loserDelta;
    const challengerWon = winnerId === battle.challenger_id;
    patch.challenger_rating_change = challengerWon ? wc : lc;
    patch.opponent_rating_change = challengerWon ? lc : wc;
  }
  const { data, error } = await admin
    .from("battles")
    .update(patch)
    .eq("id", battle.id)
    .eq("version", battle.version)
    .select("id");
  if (error) throw error;
  if (!data?.length) return false;

  if (result) {
    // 위 낙관적 락을 통과한 요청만 여기 오므로 정산은 배틀당 한 번만 일어난다.
    for (const [id, rating, won] of [
      [result.winnerId, result.w, true],
      [result.loserId, result.l, false],
    ] as const) {
      const { data: cur } = await admin
        .from("player_ratings")
        .select("wins,losses")
        .eq("user_id", id)
        .maybeSingle();
      await admin.from("player_ratings").upsert({
        user_id: id,
        rating,
        wins: (cur?.wins ?? 0) + (won ? 1 : 0),
        losses: (cur?.losses ?? 0) + (won ? 0 : 1),
        updated_at: new Date().toISOString(),
      });
    }
  }
  return true;
}
