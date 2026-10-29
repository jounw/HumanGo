import test from "node:test";
import assert from "node:assert/strict";
import { escapeChance, weirdness } from "../lib/vision/expression";
import { ESCAPE_BASE, ESCAPE_MAX } from "../lib/constants";

test("무표정/보통 미소는 이상하지 않다", () => {
  assert.equal(weirdness({}), 0);
  assert.equal(
    weirdness({ mouthSmileLeft: 0.6, mouthSmileRight: 0.6, jawOpen: 0.05 }),
    0,
  );
});

test("혀 내밀고 윙크하면 매우 이상하다", () => {
  const w = weirdness({
    tongueOut: 0.9,
    eyeBlinkLeft: 0.95,
    eyeBlinkRight: 0.05,
  });
  assert.ok(w > 0.8, String(w));
});

test("양쪽 눈을 다 감는 건 윙크가 아니다", () => {
  assert.ok(weirdness({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.9 }) < 0.05);
});

test("탈출 확률은 기본~최대 사이에서 선형이고 범위를 벗어나지 않는다", () => {
  assert.equal(escapeChance(0), ESCAPE_BASE);
  assert.equal(escapeChance(1), ESCAPE_MAX);
  assert.equal(escapeChance(5), ESCAPE_MAX);
  assert.equal(escapeChance(-1), ESCAPE_BASE);
  assert.ok(escapeChance(0.5) > ESCAPE_BASE && escapeChance(0.5) < ESCAPE_MAX);
});
