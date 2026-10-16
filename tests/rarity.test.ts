import test from "node:test";
import assert from "node:assert/strict";
import { rollRarity } from "../lib/game/rarity";

test("경계값에서 올바른 희귀도", () => {
  assert.equal(
    rollRarity(() => 0),
    "common",
  );
  assert.equal(
    rollRarity(() => 0.59),
    "common",
  );
  assert.equal(
    rollRarity(() => 0.61),
    "rare",
  );
  assert.equal(
    rollRarity(() => 0.86),
    "epic",
  );
  assert.equal(
    rollRarity(() => 0.98),
    "legendary",
  );
  assert.equal(
    rollRarity(() => 0.9999),
    "legendary",
  );
});

test("분포가 가중치(60/25/12/3)와 비슷하다", () => {
  const n = 40000;
  const c: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const r = rollRarity();
    c[r] = (c[r] ?? 0) + 1;
  }
  const near = (k: string, p: number) =>
    assert.ok(Math.abs(c[k] / n - p) < 0.015, `${k} ${c[k] / n}`);
  near("common", 0.6);
  near("rare", 0.25);
  near("epic", 0.12);
  near("legendary", 0.03);
});
