import test from "node:test";
import assert from "node:assert/strict";
import { binarize, dilate, erode, feather } from "../lib/vision/mask";

const W = 20;
const H = 12;

function square(x0: number, y0: number, x1: number, y1: number) {
  const m = new Uint8Array(W * H);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * W + x] = 1;
  return m;
}
const sum = (m: Uint8Array) => m.reduce((a, b) => a + b, 0);

test("binarize 는 임계값 초과만 1", () => {
  assert.deepEqual(
    [...binarize(new Float32Array([0, 0.5, 0.51, 1]))],
    [0, 0, 1, 1],
  );
});

test("dilate 는 사각형을 r 만큼 키운다", () => {
  const out = dilate(square(8, 5, 10, 7), W, H, 2); // 2x2 -> 6x6
  assert.equal(sum(out), 36);
  assert.equal(out[3 * W + 6], 1);
  assert.equal(out[3 * W + 5], 0);
});

test("dilate 는 경계를 넘지 않고 r=0 이면 그대로", () => {
  const edge = dilate(square(0, 0, 1, 1), W, H, 3);
  assert.equal(sum(edge), 16);
  const same = square(2, 2, 5, 5);
  assert.deepEqual(dilate(same, W, H, 0), same);
});

test("feather 는 안쪽 255, 바깥 0, 경계는 중간값", () => {
  const out = feather(square(4, 3, 16, 9), W, H, 1);
  assert.equal(out[6 * W + 10], 255);
  assert.equal(out[0], 0);
  const edge = out[6 * W + 4];
  assert.ok(edge > 0 && edge < 255, `edge=${edge}`);
});

test("erode 는 사각형을 r 만큼 줄인다 (경계 밖은 배경으로 취급하지 않음)", () => {
  const out = erode(square(4, 3, 16, 9), W, H, 2); // 12x6 -> 8x2
  assert.equal(sum(out), 16);
  assert.equal(out[5 * W + 8], 1); // 남는 행은 5~6
  assert.equal(out[4 * W + 8], 0);
});
