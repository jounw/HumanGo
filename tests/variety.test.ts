import test from "node:test";
import assert from "node:assert/strict";
import { buildPrompt } from "../lib/game/aiPrompt";
import { BODIES } from "../lib/game/chibi";
import { hashSeed } from "../lib/game/seed";
import { RARITY_ORDER } from "../lib/game/rarity";

test("등급마다 몸통이 3종류씩 있다", () => {
  for (const r of RARITY_ORDER)
    assert.equal(BODIES.filter((b) => b.rarity === r).length, 3, r);
});

test("같은 seed 면 같은 프롬프트, 다른 seed 면 다양해진다", () => {
  assert.equal(buildPrompt("mythic", 7), buildPrompt("mythic", 7));
  const set = new Set(
    Array.from({ length: 200 }, (_, i) =>
      buildPrompt("legendary", hashSeed(`id-${i}`)),
    ),
  );
  assert.ok(set.size > 40, String(set.size));
});
