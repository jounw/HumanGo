// 등급 뽑기: 서버가 난수로 등급을 정해 rarity_rolls 에 기록하고 돌려준다.
// 캡처 결과를 등록할 때 DB 트리거가 이 기록과 일치하는지 확인하므로 클라이언트는 등급을 마음대로 정할 수 없다.

import { NextResponse } from "next/server";
import { rollRarity } from "@/lib/game/rarity";
import { decideRoll, secureRng } from "@/lib/game/rollPolicy";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const HOUR = 3_600_000;
const fail = (status: number, error: string) =>
  NextResponse.json({ error }, { status });

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "로그인이 필요해요.");
  const admin = createAdminClient();
  if (!admin) return fail(503, "등급 서버가 설정되지 않았어요.");

  const now = Date.now();
  const { data: recent, error: readError } = await admin
    .from("rarity_rolls")
    .select("id,rarity,used,created_at")
    .eq("user_id", user.id)
    .gte("created_at", new Date(now - HOUR).toISOString());
  if (readError) {
    console.error("rarity_rolls 조회 실패", readError);
    return fail(500, "등급을 정하지 못했어요.");
  }

  const decision = decideRoll(recent ?? [], now);
  if (decision.action === "reuse")
    return NextResponse.json({
      id: decision.roll.id,
      rarity: decision.roll.rarity,
    });

  const roll = { id: crypto.randomUUID(), rarity: rollRarity(secureRng()) };
  const { error } = await admin
    .from("rarity_rolls")
    .insert({ ...roll, user_id: user.id });
  if (error) {
    console.error("rarity_rolls 저장 실패", error);
    return fail(500, "등급을 정하지 못했어요.");
  }
  // 하루 지난 뽑기 기록은 정리한다 (실패해도 무시)
  void admin
    .from("rarity_rolls")
    .delete()
    .eq("user_id", user.id)
    .lt("created_at", new Date(now - 24 * HOUR).toISOString());
  return NextResponse.json(roll);
}
