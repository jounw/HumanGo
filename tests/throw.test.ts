import test from "node:test";
import assert from "node:assert/strict";
import {
  assistAim,
  ballAt,
  hitTest,
  planThrow,
  releaseVelocity,
} from "../lib/game/throw";
import type { Person } from "../lib/vision/segmenter";

const from = { x: 200, y: 700 };
const vp = { sw: 400, sh: 800, vw: 400, vh: 800, mirror: false };

function person(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  gw = 40,
  gh = 80,
): Person {
  const mask = new Uint8Array(gw * gh);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) mask[y * gw + x] = 1;
  return {
    mask,
    gw,
    gh,
    bbox: { x: x0 / gw, y: y0 / gh, w: (x1 - x0) / gw, h: (y1 - y0) / gh },
  };
}

test("약한 스와이프는 떨어진다", () => {
  const v = releaseVelocity([
    { x: 200, y: 700, t: 0 },
    { x: 200, y: 690, t: 100 },
  ]);
  assert.equal(planThrow(from, v).kind, "drop");
});

test("아래로 스와이프해도 떨어진다", () => {
  assert.equal(planThrow(from, { vx: 0, vy: 2 }).kind, "drop");
});

test("세게 위로 던지면 날아가고 더 세면 더 멀리, 더 빨리", () => {
  const slow = planThrow(from, { vx: 0, vy: -0.8 });
  const fast = planThrow(from, { vx: 0, vy: -2 });
  assert.equal(slow.kind, "fly");
  assert.equal(fast.kind, "fly");
  if (slow.kind !== "fly" || fast.kind !== "fly") return;
  assert.ok(fast.to.y < slow.to.y, "빠를수록 멀리");
  assert.ok(fast.flightMs < slow.flightMs, "빠를수록 짧게");
  assert.ok(fast.flightMs >= 600 && slow.flightMs <= 900);
});

test("방향이 궤적에 반영되고 크기가 줄어든다", () => {
  const th = planThrow(from, { vx: 1, vy: -1.5 });
  assert.equal(th.kind, "fly");
  if (th.kind !== "fly") return;
  assert.ok(th.to.x > from.x);
  assert.equal(ballAt(th, 0).scale, 1);
  assert.ok(ballAt(th, 1).scale < 0.5);
  assert.deepEqual([ballAt(th, 1).x, ballAt(th, 1).y], [th.to.x, th.to.y]);
  assert.ok(
    ballAt(th, 0.5).y < (from.y + th.to.y) / 2,
    "포물선: 중간이 직선보다 위",
  );
});

test("여러 사람 중 맞은 사람만 선택된다", () => {
  const left = person(2, 20, 12, 70);
  const right = person(28, 20, 38, 70);
  assert.equal(hitTest({ x: 70, y: 400 }, [left, right], vp), left);
  assert.equal(hitTest({ x: 330, y: 400 }, [left, right], vp), right);
  assert.equal(hitTest({ x: 200, y: 400 }, [left, right], vp), null);
});

test("박스 10% 확장 안쪽은 명중, 바깥은 빗나감", () => {
  const p = person(10, 20, 20, 60); // bbox x .25~.5, y .25~.75
  // 오른쪽으로 0.5 + 0.1*0.25 = 0.525 -> 210px
  assert.equal(hitTest({ x: 205, y: 400 }, [p], vp), p);
  assert.equal(hitTest({ x: 230, y: 400 }, [p], vp), null);
});

test("전면 카메라(거울)에서도 좌표가 맞는다", () => {
  const p = person(2, 20, 12, 70); // 비디오 기준 왼쪽
  const mvp = { ...vp, mirror: true };
  assert.equal(hitTest({ x: 330, y: 400 }, [p], mvp), p); // 화면에선 오른쪽
  assert.equal(hitTest({ x: 70, y: 400 }, [p], mvp), null);
});

test("놓기 직전에 손이 멈춰도 직전의 휙 하는 속도를 쓴다 (마우스)", () => {
  // 100ms 동안 120px 올리고, 그 뒤 150ms 멈춘 채 놓음
  const samples = [
    { x: 200, y: 700, t: 0 },
    { x: 200, y: 660, t: 40 },
    { x: 200, y: 610, t: 80 },
    { x: 200, y: 580, t: 100 },
    { x: 200, y: 580, t: 180 },
    { x: 200, y: 580, t: 250 },
  ];
  const v = releaseVelocity(samples);
  assert.ok(v.vy < -0.8, `vy=${v.vy}`);
  assert.equal(planThrow(from, v).kind, "fly");
});

test("느리게 끌어올려도 날아간다 (최소 속도 보장)", () => {
  const v = releaseVelocity([
    { x: 200, y: 700, t: 0 },
    { x: 200, y: 680, t: 100 },
    { x: 200, y: 660, t: 200 },
  ]); // 0.2px/ms
  const th = planThrow(from, v);
  assert.equal(th.kind, "fly");
  if (th.kind === "fly") assert.ok(from.y - th.to.y > 200);
});

test("조준 보정: 방향이 비슷하면 사람 몸통으로 당겨지고, 크게 빗나가면 그대로", () => {
  const p = person(18, 20, 24, 60); // 가운데 근처
  const near = assistAim(
    { kind: "fly", from, to: { x: 230, y: 300 }, flightMs: 700, arc: 40 },
    [p],
    vp,
  );
  assert.equal(near.kind, "fly");
  if (near.kind === "fly") assert.ok(hitTest(near.to, [p], vp) === p);
  const far = {
    kind: "fly" as const,
    from,
    to: { x: 20, y: 600 },
    flightMs: 700,
    arc: 40,
  };
  assert.deepEqual(assistAim(far, [p], vp), far);
});
