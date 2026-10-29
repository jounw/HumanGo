// 포획 연출 (Canvas 2D). 정지 프레임 위에서:
// 사람이 하얗게 빛남 -> 입자가 되어 볼로 빨려 들어감(뒤엔 지워진 배경) -> 볼 3번 흔들 -> "잡았다!"
// 배경 채우기(인페인팅)가 아직이면 하얗게 빛난 상태로 기다린다.

import { BALL_SHAKE_COUNT, CAPTURE_DURATION_MS } from "@/lib/constants";
import * as sfx from "@/lib/game/sfx";
import { newCanvas } from "@/lib/vision/mask";
import { videoRectOnScreen, type Viewport } from "@/lib/vision/geometry";
import type { Target } from "@/lib/vision/capture";

export type CaptureOutcome = "caught" | "escaped" | "cancelled";

export type AnimInput = {
  canvas: HTMLCanvasElement; // 크기는 호출자가 css * dpr 로 맞춰 둔다
  dpr: number;
  viewport: Viewport; // 정지 프레임 기준 (mirror=false)
  still: HTMLCanvasElement;
  target: Promise<Target>;
  scene: Promise<HTMLCanvasElement>;
  ball: HTMLImageElement | null;
  ballPoint: { x: number; y: number }; // 화면 좌표
  ballStartR: number;
  escape: boolean;
  isCancelled: () => boolean;
};

// 전체 길이(CAPTURE_DURATION_MS)를 비율로 나눔
const T_GLOW = CAPTURE_DURATION_MS * 0.2;
const T_SUCK = CAPTURE_DURATION_MS * 0.3;
const T_SHAKE = CAPTURE_DURATION_MS * 0.5;
const T_END = 450; // "잡았다!" 후 머무는 시간
const BALL_R = 46;
const PARTICLE_MAX = 2200;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeIn = (u: number) => u * u * u;
const easeOut = (u: number) => 1 - (1 - u) ** 3;

type Particle = {
  x: number;
  y: number;
  c: string;
  delay: number;
  curve: number;
  size: number;
};

function makeParticles(
  cutout: HTMLCanvasElement,
  rect: { x: number; y: number; w: number; h: number },
) {
  const sw = 110;
  const sh = Math.max(1, Math.round((cutout.height * sw) / cutout.width));
  const small = newCanvas(sw, sh);
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(cutout, 0, 0, sw, sh);
  const d = sctx.getImageData(0, 0, sw, sh).data;
  const all: Particle[] = [];
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const o = (y * sw + x) * 4;
      if (d[o + 3] < 128) continue;
      // 원래 색에 흰색을 섞어 빛 입자 느낌으로
      const r = (d[o] + 255 * 1.2) / 2.2;
      const g = (d[o + 1] + 255 * 1.2) / 2.2;
      const b = (d[o + 2] + 255 * 1.2) / 2.2;
      all.push({
        x: rect.x + ((x + 0.5) / sw) * rect.w,
        y: rect.y + ((y + 0.5) / sh) * rect.h,
        c: `rgb(${r | 0},${g | 0},${b | 0})`,
        delay: Math.random(),
        curve: (Math.random() - 0.5) * 140,
        size: 2 + Math.random() * 2.5,
      });
    }
  }
  if (all.length <= PARTICLE_MAX) return all;
  const step = all.length / PARTICLE_MAX;
  return Array.from(
    { length: PARTICLE_MAX },
    (_, i) => all[Math.floor(i * step)],
  );
}

export async function playCapture(inp: AnimInput): Promise<CaptureOutcome> {
  const { canvas, dpr, viewport, still, ball, ballPoint } = inp;
  const ctx = canvas.getContext("2d")!;
  const cssW = canvas.width / dpr;
  const cssH = canvas.height / dpr;
  const rect = videoRectOnScreen(viewport);

  const drawCover = (img: HTMLCanvasElement, alpha = 1) => {
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
    ctx.globalAlpha = 1;
  };

  let target: Target | null = null;
  let scene: HTMLCanvasElement | null = null;
  let white: HTMLCanvasElement | null = null;
  let particles: Particle[] = [];
  inp.target.then((t) => {
    target = t;
    white = newCanvas(t.cutout.width, t.cutout.height);
    const wctx = white.getContext("2d")!;
    wctx.drawImage(t.cutout, 0, 0);
    wctx.globalCompositeOperation = "source-in";
    wctx.fillStyle = "#fff";
    wctx.fillRect(0, 0, white.width, white.height);
    particles = makeParticles(t.cutout, rect);
  });
  inp.scene.then((s) => (scene = s));
  // 처리에 실패하면 연출을 멈추고 호출자가 안내한다
  let failed = false;
  inp.target.catch(() => (failed = true));
  inp.scene.catch(() => (failed = true));

  const drawBall = (
    cx: number,
    cy: number,
    r: number,
    angle: number,
    glow: number,
  ) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.shadowColor = "#5eead4";
    ctx.shadowBlur = 10 + glow * 30;
    if (ball) ctx.drawImage(ball, -r, -r, r * 2, r * 2);
    else {
      ctx.fillStyle = "#4338ca";
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  return new Promise<CaptureOutcome>((resolve) => {
    const t0 = performance.now();
    let tSuck = 0; // 흡수 시작 시각 (target + scene 준비 후)
    let tShake = 0;
    let tEnd = 0;
    let stage: "glow" | "wait" | "suck" | "shake" | "end" = "glow";
    let lastK = -1;
    // 명중 순간의 불꽃 (px/ms)
    const sparks = Array.from({ length: 16 }, (_, i) => ({
      a: (i / 16) * Math.PI * 2 + Math.random() * 0.4,
      v: 0.12 + Math.random() * 0.26,
      size: 2 + Math.random() * 3,
    }));

    const frame = (now: number) => {
      if (inp.isCancelled() || failed) return resolve("cancelled");

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, cssW, cssH);

      const el = now - t0;
      const ready = target && scene;

      // 명중 직후 0.26초 동안 화면이 흔들린다
      const shake = Math.max(0, 1 - el / 260) * 7;
      if (shake > 0) {
        ctx.translate(
          (Math.random() - 0.5) * 2 * shake,
          (Math.random() - 0.5) * 2 * shake,
        );
      }

      // 단계 전환
      if (stage === "glow" && el >= T_GLOW) stage = "wait";
      if (stage === "wait" && ready) {
        stage = "suck";
        tSuck = now;
      }
      if (stage === "suck" && now - tSuck >= T_SUCK) {
        stage = "shake";
        tShake = now;
      }
      if (stage === "shake" && now - tShake >= T_SHAKE) {
        stage = "end";
        tEnd = now;
        if (inp.escape) sfx.boing();
        else sfx.chime();
      }

      // 배경: 흡수가 시작되기 전엔 사람이 있는 정지 프레임, 이후엔 지워진 장면
      const showScene =
        stage === "suck" ||
        stage === "shake" ||
        (stage === "end" && !inp.escape);
      drawCover(showScene && scene ? scene : still);

      // 1) 사람이 하얗게 빛남
      if (stage === "glow" || stage === "wait") {
        if (white) drawCover(white, easeOut(clamp01(el / T_GLOW)));
        // 명중 순간의 섬광
        const flash = clamp01(1 - el / 220);
        if (flash > 0) {
          ctx.fillStyle = `rgba(255,255,255,${flash * 0.5})`;
          ctx.fillRect(0, 0, cssW, cssH);
        }
      }

      // 볼: 명중 지점에서 서서히 커지며 입자를 빨아들인다
      const grow =
        stage === "glow" || stage === "wait"
          ? easeOut(clamp01(el / T_GLOW))
          : 1;
      const r = inp.ballStartR + (BALL_R - inp.ballStartR) * grow;
      let angle = 0;
      let glow = grow * 0.4;

      // 2) 입자가 볼로 빨려 들어감
      if (stage === "suck") {
        const p = clamp01((now - tSuck) / T_SUCK);
        if (white) drawCover(white, 1 - clamp01(p / 0.35));
        for (const pt of particles) {
          const u = clamp01((p - pt.delay * 0.45) / 0.55);
          if (u >= 1) continue;
          const e = easeIn(u);
          const dx = ballPoint.x - pt.x;
          const dy = ballPoint.y - pt.y;
          const len = Math.hypot(dx, dy) || 1;
          // 직선 경로에 수직인 방향으로 휘어지는 곡선
          const bend = Math.sin(Math.PI * e) * pt.curve;
          const x = pt.x + dx * e + (-dy / len) * bend;
          const y = pt.y + dy * e + (dx / len) * bend;
          ctx.fillStyle = pt.c;
          const s = pt.size * (1 - e * 0.6);
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
        }
        glow = 0.4 + p * 0.6;
      }

      // 3) 볼 흔들림 (감쇠하며 N번)
      if (stage === "shake" || stage === "end") {
        const p = stage === "shake" ? clamp01((now - tShake) / T_SHAKE) : 1;
        const cycle = p * BALL_SHAKE_COUNT;
        const k = Math.floor(Math.min(cycle, BALL_SHAKE_COUNT - 1e-6));
        const within = cycle - k;
        if (stage === "shake" && k !== lastK) {
          lastK = k;
          sfx.tick(1 + k * 0.18);
          navigator.vibrate?.(10);
        }
        // 한 번의 흔들림은 앞 75%에서 좌우로 흔들고 나머지는 멈춤
        angle =
          within < 0.75 ? Math.sin((within / 0.75) * Math.PI * 2) * 0.5 : 0;
        if (stage === "end") angle = 0;
        glow = 1;
      }

      drawBall(ballPoint.x, ballPoint.y, r, angle, glow);

      // 충돌 직후의 충격파 고리와 불꽃
      if (el < 520) {
        const f = clamp01(el / 520);
        ctx.save();
        ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - f)})`;
        ctx.lineWidth = 5 * (1 - f) + 1;
        ctx.beginPath();
        ctx.arc(
          ballPoint.x,
          ballPoint.y,
          14 + easeOut(f) * 110,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        for (const sp of sparks) {
          const d = easeOut(f) * sp.v * 520;
          ctx.fillStyle = `rgba(153,246,228,${1 - f})`;
          const sz = sp.size * (1 - f * 0.6);
          ctx.fillRect(
            ballPoint.x + Math.cos(sp.a) * d - sz / 2,
            ballPoint.y + Math.sin(sp.a) * d - sz / 2,
            sz,
            sz,
          );
        }
        ctx.restore();
      }

      // 4) 결과 연출
      if (stage === "end") {
        const p = clamp01((now - tEnd) / T_END);
        if (!inp.escape) {
          // 퍼지는 고리 + "잡았다!"
          ctx.save();
          ctx.strokeStyle = `rgba(94,234,212,${1 - p})`;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(ballPoint.x, ballPoint.y, r + p * 120, 0, Math.PI * 2);
          ctx.stroke();
          const pop = 0.6 + 0.4 * easeOut(clamp01(p * 3));
          const ty = Math.max(90, ballPoint.y - 100);
          ctx.translate(cssW / 2, ty);
          ctx.scale(pop, pop);
          ctx.font =
            "900 52px -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.lineWidth = 8;
          ctx.strokeStyle = "#0b1020";
          ctx.strokeText("잡았다!", 0, 0);
          ctx.fillStyle = "#5eead4";
          ctx.fillText("잡았다!", 0, 0);
          ctx.restore();
        } else {
          // 탈출: 볼이 열리며 하얗게 번쩍, 사람이 다시 나타남
          ctx.fillStyle = `rgba(255,255,255,${(1 - p) * 0.7})`;
          ctx.fillRect(0, 0, cssW, cssH);
          ctx.save();
          ctx.font =
            "900 44px -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.lineWidth = 7;
          ctx.strokeStyle = "#0b1020";
          ctx.strokeText(
            "앗, 도망갔다!",
            cssW / 2,
            Math.max(90, ballPoint.y - 100),
          );
          ctx.fillStyle = "#fde047";
          ctx.fillText(
            "앗, 도망갔다!",
            cssW / 2,
            Math.max(90, ballPoint.y - 100),
          );
          ctx.restore();
        }
        if (p >= 1) return resolve(inp.escape ? "escaped" : "caught");
      }

      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
