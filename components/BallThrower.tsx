"use client";

import { useEffect, useRef } from "react";
import { THROW_END_SCALE } from "@/lib/constants";
import * as sfx from "@/lib/game/sfx";
import {
  assistAim,
  ballAt,
  hitTest,
  planThrow,
  releaseVelocity,
  type Sample,
  type Throw,
} from "@/lib/game/throw";
import type { Viewport } from "@/lib/vision/geometry";
import type { Person } from "@/lib/vision/segmenter";

const BALL_R = 40;
const REST_BOTTOM = 120; // 화면 아래에서 볼 중심까지
const TRAIL_LEN = 9;
const PREVIEW_MIN_DRAG = 36; // 이만큼 끌어야 예상 궤적이 보인다

type Props = {
  disabled: boolean;
  ballImg: HTMLImageElement | null;
  getViewport: () => Viewport | null;
  getPeople: () => Person[];
  onHit: (
    person: Person,
    point: { x: number; y: number },
    ballR: number,
  ) => void;
  onMiss?: () => void;
};

type Mode = "rest" | "drag" | "fly" | "bounce" | "respawn" | "hidden";
type Fly = Extract<Throw, { kind: "fly" }>;
type Ghost = { x: number; y: number; r: number };
// 던지는 순간/명중 순간의 일회성 효과: 퍼지는 링과 튀는 불꽃
type Fx =
  | {
      kind: "ring";
      x: number;
      y: number;
      r0: number;
      r1: number;
      t0: number;
      ms: number;
    }
  | {
      kind: "spark";
      x: number;
      y: number;
      vx: number;
      vy: number;
      t0: number;
      ms: number;
    };

type State = {
  mode: Mode;
  x: number; // 화면에 그려지는 위치
  y: number;
  tx: number; // 손가락/마우스 위치 (드래그 목표)
  ty: number;
  scale: number;
  spin: number;
  spinV: number; // rad/ms
  t0: number;
  samples: Sample[];
  th: Throw | null;
  trail: Ghost[];
  // bounce 물리 (px, ms)
  vx: number;
  vy: number;
  g: number; // 중력
  ground: number;
  bounces: number;
  fadeT0: number;
  preview: Throw | null;
  previewAt: number;
  fx: Fx[];
};

const GRAVITY_MISS = 0.0016;
const GRAVITY_DROP = 0.0024;
const RESTITUTION = 0.5;

const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

// 하단의 볼을 잡고 위로 끌었다 놓으면 던진다. 궤적/명중은 lib/game/throw.ts 의 순수 함수로 계산.
// 실감 요소: 끌 때 살짝 늦게 따라오는 묵직함, 예상 궤적, 꼬리 잔상, 바닥 그림자, 원근, 회전, 튕김, 효과음/진동.
export default function BallThrower(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  const st = useRef<State>({
    mode: "rest",
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
    scale: 1,
    spin: 0,
    spinV: 0,
    t0: 0,
    samples: [],
    th: null,
    trail: [],
    vx: 0,
    vy: 0,
    g: GRAVITY_MISS,
    ground: 0,
    bounces: 0,
    fadeT0: 0,
    preview: null,
    previewAt: 0,
    fx: [],
  });

  useEffect(() => {
    propsRef.current = props;
  });

  // disabled 가 바뀔 때: 숨기거나 다시 등장시킨다
  useEffect(() => {
    const s = st.current;
    if (props.disabled) s.mode = "hidden";
    else if (s.mode === "hidden") {
      s.mode = "respawn";
      s.t0 = performance.now();
    }
  }, [props.disabled]);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let dpr = 1;
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = performance.now();
    const s = st.current;

    const rest = () => ({ x: w / 2, y: h - REST_BOTTOM });

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = wrap.clientWidth;
      h = wrap.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      if (s.mode === "rest") Object.assign(s, rest());
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    Object.assign(s, rest());

    const local = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onDown = (e: PointerEvent) => {
      if (s.mode !== "rest") return;
      const p = local(e);
      const r = rest();
      if (Math.hypot(p.x - r.x, p.y - r.y) > BALL_R * 2.4) return;
      try {
        wrap.setPointerCapture(e.pointerId);
      } catch {
        // 포인터 캡처 실패해도 던지기는 계속 동작한다
      }
      sfx.unlockAudio();
      sfx.tick(0.8);
      navigator.vibrate?.(8);
      s.mode = "drag";
      s.samples = [{ ...p, t: e.timeStamp }];
      s.x = r.x;
      s.y = r.y;
      s.tx = p.x;
      s.ty = p.y;
      s.preview = null;
    };
    const onMove = (e: PointerEvent) => {
      if (s.mode !== "drag") return;
      const p = local(e);
      s.tx = p.x;
      s.ty = p.y;
      s.samples.push({ ...p, t: e.timeStamp });
      if (s.samples.length > 24) s.samples.shift();
    };
    const onUp = (e: PointerEvent) => {
      if (s.mode !== "drag") return;
      s.samples.push({ ...local(e), t: e.timeStamp });
      const v = releaseVelocity(s.samples);
      const th = plan({ x: s.x, y: s.y }, v);
      s.th = th;
      s.t0 = performance.now();
      s.preview = null;
      s.trail = [];
      const speed = Math.hypot(v.vx, v.vy);
      if (th.kind === "fly") {
        s.mode = "fly";
        s.spinV = 0.006 + Math.min(0.02, speed * 0.01);
        burst(s.x, s.y, Math.min(1, speed / 2));
        sfx.whoosh(Math.min(1, speed / 2));
        navigator.vibrate?.(12);
      } else {
        // 힘이 부족하면 손에서 툭 떨어져 바닥에서 튄다
        startBounce(
          0,
          v.vx * 0.25,
          Math.max(s.y + 24, h - 64),
          GRAVITY_DROP,
          1,
        );
      }
    };
    wrap.addEventListener("pointerdown", onDown);
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerup", onUp);
    wrap.addEventListener("pointercancel", onUp);

    // 손을 떠나는 순간: 충격 링 + 진행 반대 방향으로 튀는 불꽃
    function burst(x: number, y: number, power: number) {
      const now = performance.now();
      s.fx.push({
        kind: "ring",
        x,
        y,
        r0: BALL_R * 0.8,
        r1: BALL_R * (2 + power),
        t0: now,
        ms: 320,
      });
      for (let i = 0; i < 8 + power * 8; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 0.1 + Math.random() * 0.25 * (1 + power);
        s.fx.push({
          kind: "spark",
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          t0: now,
          ms: 280 + Math.random() * 200,
        });
      }
    }

    function plan(
      from: { x: number; y: number },
      v: { vx: number; vy: number },
    ) {
      const vp = propsRef.current.getViewport();
      const planned = planThrow(from, v);
      return vp
        ? assistAim(planned, propsRef.current.getPeople(), vp)
        : planned;
    }

    function startBounce(
      vy: number,
      vx: number,
      ground: number,
      g: number,
      scale: number,
    ) {
      s.mode = "bounce";
      s.vx = vx;
      s.vy = vy;
      s.ground = ground;
      s.bounces = 0;
      s.fadeT0 = 0;
      s.scale = scale;
      s.preview = null;
      s.g = g;
    }

    // 공을 처음 상태로 완전히 되돌린다 (위치, 물리, 잔상, 입력 기록 전부)
    const resetBall = () => {
      const r = rest();
      s.mode = "rest";
      s.x = r.x;
      s.y = r.y;
      s.tx = r.x;
      s.ty = r.y;
      s.scale = 1;
      s.spin = 0;
      s.spinV = 0;
      s.samples = [];
      s.th = null;
      s.trail = [];
      s.vx = 0;
      s.vy = 0;
      s.bounces = 0;
      s.fadeT0 = 0;
      s.preview = null;
    };

    // 떨어진 공은 짧게 사라진 뒤 바로 제자리에서 다시 나타난다
    const respawnLater = () => {
      s.mode = "respawn";
      s.t0 = performance.now() + 150;
      s.trail = [];
      s.th = null;
    };

    let lastMode: Mode = s.mode;
    let modeSince = performance.now();

    const drawBall = (
      x: number,
      y: number,
      r: number,
      rot: number,
      alpha: number,
    ) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.rotate(rot);
      if (propsRef.current.ballImg)
        ctx.drawImage(propsRef.current.ballImg, -r, -r, r * 2, r * 2);
      else {
        ctx.fillStyle = "#4338ca";
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    const drawShadow = (x: number, y: number, r: number, alpha: number) => {
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.85, r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    // 놓았을 때 날아갈 경로를 점선으로 미리 보여 준다 (조준 보정까지 반영)
    const drawPreview = (th: Fly) => {
      ctx.save();
      for (let i = 1; i <= 12; i++) {
        const b = ballAt(th, i / 13);
        ctx.globalAlpha = 0.55 * (1 - i / 16);
        ctx.fillStyle = "#99f6e4";
        ctx.beginPath();
        ctx.arc(b.x, b.y, Math.max(1.8, 4.5 * b.scale), 0, Math.PI * 2);
        ctx.fill();
      }
      const e = ballAt(th, 1);
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = "#5eead4";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(e.x, e.y, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    };

    const frame = (now: number) => {
      const p = propsRef.current;
      const dt = Math.min(50, now - last);
      last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // 안전장치: 날아가거나 튕기는 상태가 비정상적으로 길어지면 강제로 초기화
      if (s.mode !== lastMode) {
        lastMode = s.mode;
        modeSince = now;
      }
      if ((s.mode === "fly" || s.mode === "bounce") && now - modeSince > 4000) {
        resetBall();
        lastMode = s.mode;
        modeSince = now;
      }

      let alpha = 1;
      let rot = 0;
      let shadow: { x: number; y: number; r: number; a: number } | null = null;

      switch (s.mode) {
        case "rest": {
          const r = rest();
          s.x = r.x;
          s.y = r.y + Math.sin(now / 420) * 3; // 살짝 둥실
          s.scale = 1;
          shadow = { x: r.x, y: r.y + BALL_R + 8, r: BALL_R, a: 0.25 };
          break;
        }
        case "drag": {
          // 손가락을 약간 늦게 따라오는 묵직함 + 이동 방향으로 기울어짐
          const k = 1 - Math.exp(-dt / 55);
          const dx = s.tx - s.x;
          s.x += dx * k;
          s.y += (s.ty - s.y) * k;
          rot = Math.max(-0.5, Math.min(0.5, dx * 0.012));
          s.scale = 1.14; // 들어 올리면 살짝 커 보인다
          const r = rest();
          shadow = { x: s.x, y: r.y + BALL_R + 16, r: BALL_R * 1.1, a: 0.18 };

          if (Math.hypot(s.x - r.x, s.y - r.y) > PREVIEW_MIN_DRAG) {
            if (now - s.previewAt > 50) {
              s.previewAt = now;
              const th = plan({ x: s.x, y: s.y }, releaseVelocity(s.samples));
              s.preview = th.kind === "fly" ? th : null;
            }
            if (s.preview?.kind === "fly") drawPreview(s.preview);
          }
          break;
        }
        case "fly": {
          const th = s.th as Fly;
          const lin = Math.min(1, (now - s.t0) / th.flightMs);
          // 쏘아 올리듯 빠르게 출발해 목표 앞에서 살짝 감속
          const u = lin >= 1 ? 1 : 1 - (1 - lin) ** 1.45;
          const b = ballAt(th, u);
          s.x = b.x;
          s.y = b.y;
          s.scale = b.scale;
          s.spin += s.spinV * dt;
          rot = s.spin;

          // 땅(경로의 직선 위치)에 비친 그림자: 공이 높이 떠 있을수록 멀고 옅다
          const gx = th.from.x + (th.to.x - th.from.x) * u;
          const gy =
            th.from.y + (th.to.y - th.from.y) * u + BALL_R * b.scale * 1.2;
          const lift = Math.min(1, Math.abs(gy - b.y) / 160);
          shadow = {
            x: gx,
            y: gy,
            r: BALL_R * b.scale,
            a: 0.28 * (1 - lift * 0.5),
          };

          s.trail.push({ x: b.x, y: b.y, r: BALL_R * b.scale });
          if (s.trail.length > TRAIL_LEN) s.trail.shift();

          if (lin >= 1) {
            const vp = p.getViewport();
            const person = vp ? hitTest(th.to, p.getPeople(), vp) : null;
            if (person) {
              s.mode = "hidden";
              sfx.thud();
              burst(th.to.x, th.to.y, 1);
              s.fx.push({
                kind: "ring",
                x: th.to.x,
                y: th.to.y,
                r0: 8,
                r1: BALL_R * 3.4,
                t0: now,
                ms: 420,
              });
              navigator.vibrate?.([30, 40, 60]);
              p.onHit(person, th.to, BALL_R * THROW_END_SCALE);
              raf = requestAnimationFrame(frame);
              return;
            }
            // 빗나감: 앞쪽 바닥에 떨어져 통통 튀며 굴러간다
            const dir =
              Math.hypot(th.to.x - th.from.x, th.to.y - th.from.y) || 1;
            const ux = (th.to.x - th.from.x) / dir;
            startBounce(-0.34, ux * 0.1, th.to.y + 6, GRAVITY_MISS, b.scale);
            s.x = th.to.x;
            s.y = th.to.y;
            sfx.bounce(0.7);
            p.onMiss?.();
          }
          break;
        }
        case "bounce": {
          s.vy += s.g * dt;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.spin += s.spinV * dt;
          rot = s.spin;
          if (s.scale < 0.8) s.scale = Math.max(0.2, s.scale - 0.00003 * dt); // 멀어지며 조금씩 작아짐
          if (s.y >= s.ground && s.vy > 0) {
            s.y = s.ground;
            s.vy = -s.vy * RESTITUTION;
            s.vx *= 0.75;
            s.spinV *= 0.7;
            s.bounces++;
            sfx.bounce(0.9 / (1 + s.bounces));
            navigator.vibrate?.(6);
            if (s.bounces >= 2 || Math.abs(s.vy) < 0.07) {
              s.vy = 0;
              s.vx *= 0.4;
              s.fadeT0 = now;
            }
          }
          if (s.fadeT0) {
            const f = (now - s.fadeT0) / 280;
            alpha = Math.max(0, 1 - f);
            if (f >= 1) respawnLater();
          }
          const air = Math.max(0, s.ground - s.y);
          shadow = {
            x: s.x,
            y: s.ground + BALL_R * s.scale * 1.05,
            r: BALL_R * s.scale,
            a: 0.25 * (1 - Math.min(1, air / 80) * 0.6) * alpha,
          };
          break;
        }
        case "respawn": {
          const u = (now - s.t0) / 320;
          if (u < 0) {
            alpha = 0;
          } else {
            const r = rest();
            s.x = r.x;
            s.y = r.y;
            s.scale = Math.min(1.2, easeOutBack(Math.min(1, u))); // 통 튀어 오르듯 등장
            alpha = Math.min(1, u * 3);
            if (u >= 1) resetBall();
          }
          break;
        }
        case "hidden":
          alpha = 0;
          break;
      }

      if (alpha > 0) {
        if (shadow) drawShadow(shadow.x, shadow.y, shadow.r, shadow.a);

        // 꼬리 잔상 (오래된 것일수록 작고 옅게)
        if (s.mode === "fly") {
          // 혜성 꼬리: 끝으로 갈수록 가늘고 투명한 빛줄기 + 잔상 공
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.lineCap = "round";
          for (let i = 1; i < s.trail.length; i++) {
            const a = s.trail[i - 1];
            const b = s.trail[i];
            const f = i / s.trail.length;
            ctx.strokeStyle = `rgba(94,234,212,${0.5 * f * f})`;
            ctx.lineWidth = b.r * 1.5 * f;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
          ctx.restore();
          s.trail.forEach((g, i) => {
            const f = (i + 1) / (s.trail.length + 1);
            drawBall(g.x, g.y, g.r * (0.55 + 0.4 * f), s.spin, 0.2 * f * f);
          });
        }

        // 공 주변 광채: 날아갈 때와 팽팽히 당길 때 강해진다
        if (s.mode === "fly" || s.mode === "drag") {
          const pull =
            s.mode === "drag"
              ? Math.min(1, Math.hypot(s.x - rest().x, s.y - rest().y) / 180)
              : 1;
          const gr = BALL_R * s.scale * (1.5 + pull * 0.6);
          const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, gr);
          g.addColorStop(0, `rgba(94,234,212,${0.1 + pull * 0.3})`);
          g.addColorStop(1, "rgba(94,234,212,0)");
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(s.x, s.y, gr, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // 빠를수록 진행 방향으로 살짝 늘어나는 스트레치
        ctx.save();
        const r = BALL_R * s.scale;
        if (s.mode === "fly" && s.th?.kind === "fly") {
          const ang = Math.atan2(
            s.th.to.y - s.th.from.y,
            s.th.to.x - s.th.from.x,
          );
          ctx.translate(s.x, s.y);
          ctx.rotate(ang);
          ctx.scale(1.12, 0.94);
          ctx.rotate(-ang);
          ctx.translate(-s.x, -s.y);
        }
        drawBall(s.x, s.y, r, rot, alpha);
        ctx.restore();
      }

      // 일회성 효과 (링, 불꽃)
      if (s.fx.length) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        s.fx = s.fx.filter((f) => now - f.t0 < f.ms);
        for (const f of s.fx) {
          const k = (now - f.t0) / f.ms;
          if (f.kind === "ring") {
            const e = 1 - (1 - k) ** 3;
            ctx.strokeStyle = `rgba(153,246,228,${0.8 * (1 - k)})`;
            ctx.lineWidth = 3 * (1 - k) + 1;
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * e, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            const x = f.x + f.vx * (now - f.t0);
            const y = f.y + f.vy * (now - f.t0) + 0.0004 * (now - f.t0) ** 2;
            ctx.fillStyle = `rgba(204,251,241,${1 - k})`;
            ctx.beginPath();
            ctx.arc(x, y, 2.6 * (1 - k) + 0.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      wrap.removeEventListener("pointerdown", onDown);
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerup", onUp);
      wrap.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return (
    <div ref={wrapRef} className="absolute inset-0 touch-none select-none">
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
