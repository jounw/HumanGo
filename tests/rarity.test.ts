import test from "node:test";
import assert from "node:assert/strict";
import {
  RARITY_FX,
  RARITY_LABEL,
  RARITY_ORDER,
  RARITY_STYLE,
  isRarity,
  rarityTier,
  rarityFromSigma,
  rollRarity,
} from "../lib/game/rarity";
import { RARITY_SIGMA } from "../lib/constants";

test("σ 경계값에서 올바른 희귀도", () => {
  const cases: [number, string][] = [
    [0, "common"],
    [0.59, "common"],
    [0.6, "uncommon"],
    [1.49, "rare"],
    [1.5, "epic"],
    [1.99, "epic"],
    [2.0, "legendary"],
    [2.49, "legendary"],
    [2.5, "mythic"],
    [6, "mythic"],
  ];
  for (const [z, want] of cases) {
    assert.equal(rarityFromSigma(z), want, `z=${z}`);
  }
});

test("rng 가 평균(u=0.5, v=0)이면 z≈1.18 이라 레어", () => {
  const seq = [0.5, 0];
  let i = 0;
  assert.equal(
    rollRarity(() => seq[i++ % 2]),
    "rare",
  );
});

test("분포가 정규분포 구간 확률과 비슷하다", () => {
  const expected: Record<string, number> = {
    common: 0.4515,
    uncommon: 0.2312,
    rare: 0.1837,
    epic: 0.0881,
    legendary: 0.0331,
    mythic: 0.0124,
  };
  const n = 100000;
  const c: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const r = rollRarity();
    c[r] = (c[r] ?? 0) + 1;
  }
  for (const r of RARITY_ORDER) {
    assert.ok(
      Math.abs((c[r] ?? 0) / n - expected[r]) < 0.01,
      `${r} ${(c[r] ?? 0) / n}`,
    );
  }
});

test("모든 등급에 라벨/스타일/연출이 있고 높을수록 연출이 커진다", () => {
  let prev = -1;
  for (const r of RARITY_ORDER) {
    assert.ok(
      isRarity(r) && RARITY_LABEL[r] && r in RARITY_STYLE && r in RARITY_FX,
    );
    assert.ok(RARITY_FX[r].count >= prev, `${r} 입자 수가 줄어듦`);
    prev = RARITY_FX[r].count;
  }
  assert.equal(rarityTier("common"), 0);
  assert.equal(rarityTier("mythic"), 5);
  assert.equal(isRarity("bogus"), false);
});
