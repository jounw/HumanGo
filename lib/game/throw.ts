// 스와이프 -> 투척 궤적 -> 명중 판정. DOM 에 의존하지 않는 순수 함수들.

import {
  HIT_BOX_EXPAND,
  THROW_END_SCALE,
  THROW_FLIGHT_MS_MAX,
  THROW_FLIGHT_MS_MIN,
  THROW_MIN_SPEED,
  THROW_SOFT_SPEED,
} from "../constants";
import {
  screenToVideo,
  videoToScreen,
  type Viewport,
} from "../vision/geometry";
import type { Person } from "../vision/segmenter";

export type Sample = { x: number; y: number; t: number };

export type Throw =
  | { kind: "drop"; from: Pt; flightMs: number } // 약해서 툭 떨어짐
  | { kind: "fly"; from: Pt; to: Pt; flightMs: number; arc: number };

type Pt = { x: number; y: number };

const RANGE_FACTOR = 0.55; // 속도(px/ms) x 비행시간(ms) 중 실제 이동 비율
const FAST_SPEED = 2.5; // 이 속도 이상이면 최소 비행시간

const PEAK_WINDOW_MS = 220; // 놓기 직전 이 시간 안에서
const PEAK_SPAN_MS = 80; // 이 간격으로 잰 속도 중 가장 빠른 것을 쓴다

/**
 * 놓는 순간의 속도 벡터 (px/ms). 놓기 직전에 손이 멈춰도(마우스에서 흔함) 직전의 휙 하는 동작을 반영하도록
 * 최근 구간에서 가장 빠른 구간 속도를 고른다.
 */
export function releaseVelocity(samples: Sample[]) {
  if (samples.length < 2) return { vx: 0, vy: 0 };
  const last = samples[samples.length - 1];
  let best = { vx: 0, vy: 0 };
  let bestSpeed = 0;
  for (let j = samples.length - 1; j > 0; j--) {
    if (last.t - samples[j].t > PEAK_WINDOW_MS) break;
    // j 보다 PEAK_SPAN_MS 이내로 앞선 가장 오래된 샘플
    let i = j - 1;
    while (i > 0 && samples[j].t - samples[i - 1].t <= PEAK_SPAN_MS) i--;
    const dt = samples[j].t - samples[i].t;
    if (dt < 8) continue;
    const vx = (samples[j].x - samples[i].x) / dt;
    const vy = (samples[j].y - samples[i].y) / dt;
    const sp = Math.hypot(vx, vy);
    if (sp > bestSpeed) {
      bestSpeed = sp;
      best = { vx, vy };
    }
  }
  return best;
}

export function planThrow(from: Pt, v: { vx: number; vy: number }): Throw {
  const raw = Math.hypot(v.vx, v.vy);
  // 위로 향하지 않거나 거의 안 움직였으면 툭 떨어진다
  if (v.vy >= 0 || raw < THROW_MIN_SPEED) {
    return { kind: "drop", from, flightMs: 450 };
  }
  // 느리게 끌어올렸어도 던진 것으로 쳐서 최소한의 속도는 보장한다 (마우스/트랙패드)
  const speed = Math.max(raw, THROW_SOFT_SPEED);
  const t = Math.min(
    1,
    Math.max(0, (speed - THROW_MIN_SPEED) / (FAST_SPEED - THROW_MIN_SPEED)),
  );
  const flightMs =
    THROW_FLIGHT_MS_MAX - t * (THROW_FLIGHT_MS_MAX - THROW_FLIGHT_MS_MIN);
  const range = speed * flightMs * RANGE_FACTOR;
  const to = {
    x: from.x + (v.vx / raw) * range,
    y: from.y + (v.vy / raw) * range,
  };
  return { kind: "fly", from, to, flightMs, arc: range * 0.12 };
}

/** 비행 진행도 u(0~1)에서의 볼 위치와 크기 배율 */
export function ballAt(th: Extract<Throw, { kind: "fly" }>, u: number) {
  const x = th.from.x + (th.to.x - th.from.x) * u;
  const y = th.from.y + (th.to.y - th.from.y) * u - th.arc * 4 * u * (1 - u);
  const scale = 1 + (THROW_END_SCALE - 1) * u;
  return { x, y, scale };
}

/** 화면 좌표 pt 가 사람에게 맞았는지. 마스크 위면 정확 명중, 아니면 확장된 박스로 판정. */
export function hitTest(pt: Pt, people: Person[], vp: Viewport): Person | null {
  const v = screenToVideo(pt.x, pt.y, vp);
  if (v.x < 0 || v.x > 1 || v.y < 0 || v.y > 1) return null;

  let best: Person | null = null;
  let bestDist = Infinity;
  for (const p of people) {
    const gx = Math.min(p.gw - 1, Math.floor(v.x * p.gw));
    const gy = Math.min(p.gh - 1, Math.floor(v.y * p.gh));
    if (p.mask[gy * p.gw + gx]) return p; // 정확 명중

    const b = p.bbox;
    const ex = b.w * HIT_BOX_EXPAND;
    const ey = b.h * HIT_BOX_EXPAND;
    if (
      v.x >= b.x - ex &&
      v.x <= b.x + b.w + ex &&
      v.y >= b.y - ey &&
      v.y <= b.y + b.h + ey
    ) {
      const d = Math.hypot(v.x - (b.x + b.w / 2), v.y - (b.y + b.h / 2));
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
  }
  return best;
}

const ASSIST_MAX_ANGLE = (28 * Math.PI) / 180;

/** 사람 마스크의 무게중심 (화면 좌표). 마스크가 비면 null. */
function personCenter(p: Person, vp: Viewport): Pt | null {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < p.gh; y += 2) {
    for (let x = 0; x < p.gw; x += 2) {
      if (p.mask[y * p.gw + x]) {
        sx += x;
        sy += y;
        n++;
      }
    }
  }
  if (!n) return null;
  return videoToScreen(sx / n / p.gw, sy / n / p.gh, vp);
}

/**
 * 조준 보정: 던진 방향 28° 안에 사람이 있으면 가장 방향이 가까운 사람의 몸통 쪽으로 착지점을 당긴다.
 * 노트북 마우스처럼 정밀하게 조준하기 어려운 입력을 위한 것. 방향이 크게 빗나가면 그대로 빗나간다.
 */
export function assistAim(th: Throw, people: Person[], vp: Viewport): Throw {
  if (th.kind !== "fly") return th;
  const ax = th.to.x - th.from.x;
  const ay = th.to.y - th.from.y;
  const aim = Math.atan2(ay, ax);

  let best: { pt: Pt; diff: number } | null = null;
  for (const p of people) {
    const c = personCenter(p, vp);
    if (!c) continue;
    const ang = Math.atan2(c.y - th.from.y, c.x - th.from.x);
    let diff = Math.abs(ang - aim);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    if (diff <= ASSIST_MAX_ANGLE && (!best || diff < best.diff))
      best = { pt: c, diff };
  }
  if (!best) return th;
  const dist = Math.hypot(best.pt.x - th.from.x, best.pt.y - th.from.y);
  return { ...th, to: best.pt, arc: dist * 0.12 };
}
