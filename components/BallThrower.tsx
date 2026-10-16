"use client";

import { useEffect, useRef } from "react";
import { THROW_END_SCALE } from "@/lib/constants";
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

type Mode = "rest" | "drag" | "fly" | "drop" | "miss" | "respawn" | "hidden";

type State = {
  mode: Mode;
  x: number;
  y: number;
  scale: number;
  spin: number;
  t0: number;
  samples: Sample[];
  th: Throw | null;
  dropVy: number;
};

// 하단의 볼을 잡고 위로 스와이프하면 던진다. 궤적은 lib/game/throw.ts 의 순수 함수로 계산.
export default function BallThrower(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  const st = useRef<State>({
    mode: "rest",
    x: 0,
    y: 0,
    scale: 1,
    spin: 0,
    t0: 0,
    samples: [],
    th: null,
    dropVy: 0,
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
      s.mode = "drag";
      s.samples = [{ ...p, t: e.timeStamp }];
      s.x = p.x;
      s.y = p.y;
    };
    const onMove = (e: PointerEvent) => {
      if (s.mode !== "drag") return;
      const p = local(e);
      s.x = p.x;
      s.y = p.y;
      s.samples.push({ ...p, t: e.timeStamp });
      if (s.samples.length > 24) s.samples.shift();
    };
    const onUp = (e: PointerEvent) => {
      if (s.mode !== "drag") return;
      s.samples.push({ ...local(e), t: e.timeStamp });
      const vp = propsRef.current.getViewport();
      const planned = planThrow({ x: s.x, y: s.y }, releaseVelocity(s.samples));
      const th = vp
        ? assistAim(planned, propsRef.current.getPeople(), vp)
        : planned;
      s.th = th;
      s.t0 = performance.now();
      s.mode = th.kind === "fly" ? "fly" : "drop";
      s.dropVy = 0;
    };
    wrap.addEventListener("pointerdown", onDown);
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerup", onUp);
    wrap.addEventListener("pointercancel", onUp);

    const respawnLater = () => {
      s.mode = "respawn";
      s.t0 = performance.now() + 350; // 잠깐 쉬었다가 등장
    };

    const frame = (now: number) => {
      const p = propsRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      let drawX = s.x;
      let drawY = s.y;
      let scale = s.scale;
      let alpha = 1;

      switch (s.mode) {
        case "rest": {
          const r = rest();
          drawX = r.x;
          drawY = r.y + Math.sin(now / 420) * 3; // 살짝 둥실
          scale = 1;
          s.x = r.x;
          s.y = r.y;
          break;
        }
        case "drag":
          scale = 1.08;
          break;
        case "fly": {
          const th = s.th as Extract<Throw, { kind: "fly" }>;
          const u = Math.min(1, (now - s.t0) / th.flightMs);
          const b = ballAt(th, u);
          drawX = b.x;
          drawY = b.y;
          scale = b.scale;
          s.spin += 0.25;
          if (u >= 1) {
            const vp = p.getViewport();
            const person = vp ? hitTest(th.to, p.getPeople(), vp) : null;
            if (person) {
              s.mode = "hidden";
              navigator.vibrate?.(40);
              p.onHit(person, th.to, BALL_R * THROW_END_SCALE);
              return void (raf = requestAnimationFrame(frame));
            }
            // 빗나감: 볼이 앞으로 더 날아가며 사라진다
            s.mode = "miss";
            s.t0 = now;
            p.onMiss?.();
          }
          break;
        }
        case "miss": {
          const th = s.th as Extract<Throw, { kind: "fly" }>;
          const u = Math.min(1, (now - s.t0) / 300);
          drawX = th.to.x;
          drawY = th.to.y - u * 40;
          scale = 0.35 * (1 - u * 0.5);
          alpha = 1 - u;
          if (u >= 1) respawnLater();
          break;
        }
        case "drop": {
          s.dropVy += 0.0022 * 16;
          s.y += s.dropVy * 16 * 0.2;
          drawY = s.y;
          if (s.y > h + BALL_R * 2) respawnLater();
          break;
        }
        case "respawn": {
          const u = (now - s.t0) / 250;
          if (u < 0) {
            alpha = 0;
          } else {
            const r = rest();
            drawX = r.x;
            drawY = r.y;
            scale = Math.min(1, u);
            alpha = Math.min(1, u);
            if (u >= 1) {
              s.mode = "rest";
              s.x = r.x;
              s.y = r.y;
              s.samples = [];
            }
          }
          break;
        }
        case "hidden":
          alpha = 0;
          break;
      }

      if (alpha > 0) {
        const r = BALL_R * scale;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(drawX, drawY);
        ctx.rotate(s.mode === "fly" ? s.spin : 0);
        // 바닥 그림자
        if (s.mode === "rest" || s.mode === "drag") {
          ctx.save();
          ctx.rotate(0);
          ctx.fillStyle = "rgba(0,0,0,0.25)";
          ctx.beginPath();
          ctx.ellipse(0, r + 8, r * 0.8, r * 0.18, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        if (p.ballImg) ctx.drawImage(p.ballImg, -r, -r, r * 2, r * 2);
        else {
          ctx.fillStyle = "#4338ca";
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();
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
