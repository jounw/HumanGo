import test from "node:test";
import assert from "node:assert/strict";
import {
  decideRoll,
  secureRng,
  type RollRow,
} from "../lib/game/rollPolicy";
import { rollRarity } from "../lib/game/rarity";

const NOW = Date.parse("2026-10-20T12:00:00Z");
const roll = (agoSec: number, used = false, id = String(agoSec)): RollRow => ({
  id,
  rarity: "common",
  used,
  created_at: new Date(NOW - agoSec * 1000).toISOString(),
});

test("첫 뽑기는 새로 뽑는다", () => {
  assert.deepEqual(decideRoll([], NOW), { action: "new" });
});

test("방금 뽑고 아직 안 쓴 뽑기는 그대로 돌려준다 (새로고침/중복 호출 방지)", () => {
  const r = roll(5);
  assert.deepEqual(decideRoll([r], NOW), { action: "reuse", roll: r });
});

test("20초가 지났거나 이미 등록에 쓴 뽑기면 새로 뽑을 수 있다", () => {
  assert.deepEqual(decideRoll([roll(25)], NOW), { action: "new" });
  assert.deepEqual(decideRoll([roll(5, true)], NOW), { action: "new" });
});

test("많이 잡아도 횟수 제한 없이 계속 새로 뽑는다", () => {
  const many = Array.from({ length: 500 }, (_, i) =>
    roll(100 + i, true, `r${i}`),
  );
  assert.deepEqual(decideRoll(many, NOW), { action: "new" });
});

test("서버 난수로 뽑아도 등급 분포가 정규분포 구간 확률과 비슷하다", () => {
  const rng = secureRng();
  const n = 40000;
  let common = 0;
  for (let i = 0; i < n; i++) if (rollRarity(rng) === "common") common++;
  assert.ok(Math.abs(common / n - 0.4515) < 0.015, String(common / n));
});
