"use client";

import { useEffect, useRef } from "react";
import type { Rarity } from "@/lib/constants";
import { RARITY_FX, RARITY_LABEL, rarityTier } from "@/lib/game/rarity";
import * as sfx from "@/lib/game/sfx";

type P = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
  life: number; // 0~1 로 줄어듦
  decay: number;
  confetti: boolean;
};

const DURATION = 2200;

/**
 * 등급 공개 연출: 카드 중앙에서 입자가 터지고, 높은 등급일수록 입자가 많아지고
 * 색종이/무지개/화면 번쩍임/배너/효과음/진동이 더해진다. active 가 true 가 되는 순간 한 번 재생된다.
 */
export default function RarityBurst({
  rarity,
  active,
}: {
  rarity: Rarity;
  active: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const played = useRef(false);

  useEffect(() => {
    if (!active || played.current) return;
    played.current = true;
    const canvas = ref.current;
    if (!canvas) return;
    const fx = RARITY_FX[rarity];
    const tier = rarityTier(rarity);
    sfx.rarityReveal(tier);
    if (fx.vibrate.length) navigator.vibrate?.(fx.vibrate);
    if (fx.count === 0) return;
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d")!;

    const color = (i: number) =>
      fx.colors === "rainbow"
        ? `hsl(${(i * 47) % 360} 95% 65%)`
        : fx.colors[i % fx.colors.length];

    const ps: P[] = Array.from(
      { length: reduce ? Math.min(fx.count, 20) : fx.count },
      (_, i) => {
        const a = Math.random() * Math.PI * 2;
        const sp = (0.18 + Math.random() * 0.5) * (1 + tier * 0.12); // px/ms
        return {
          x: w / 2,
          y: h * 0.46,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 0.12,
          size: (fx.confetti ? 4 : 2.5) + Math.random() * (fx.confetti ? 5 : 3),
          color: color(i),
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.02,
          life: 1,
          decay: 0.0004 + Math.random() * 0.0005,
          confetti: fx.confetti && i % 3 !== 0,
        };
      },
    );

    let raf = 0;
    let last = performance.now();
    const t0 = last;
    const frame = (now: number) => {
      const dt = Math.min(40, now - last);
      last = now;
      const el = now - t0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // 화면 번쩍임 + 중앙에서 퍼지는 후광
      const f = Math.max(0, 1 - el / 420);
      if (fx.flash && f > 0) {
        ctx.fillStyle = `rgba(255,255,255,${f * fx.flash})`;
        ctx.fillRect(0, 0, w, h);
      }
      if (tier >= 3) {
        const gr = ctx.createRadialGradient(
          w / 2,
          h * 0.46,
          0,
          w / 2,
          h * 0.46,
          w * 0.6,
        );
        const a = Math.max(0, 1 - el / 1200) * 0.35;
        gr.addColorStop(
          0,
          fx.colors === "rainbow"
            ? `rgba(255,200,255,${a})`
            : `${fx.colors[0]}${Math.round(a * 255)
                .toString(16)
                .padStart(2, "0")}`,
        );
        gr.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gr;
        ctx.fillRect(0, 0, w, h);
      }

      for (const p of ps) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 0.0006 * dt; // 중력
        p.vx *= 0.995;
        p.rot += p.vr * dt;
        p.life -= p.decay * dt;
        if (p.life <= 0) continue;
        ctx.save();
        ctx.globalAlpha = Math.min(1, p.life * 1.5);
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.confetti)
          ctx.fillRect(-p.size, -p.size / 2.2, p.size * 2, p.size / 1.1);
        else {
          // 네 갈래 반짝이
          ctx.beginPath();
          ctx.moveTo(0, -p.size * 1.6);
          ctx.lineTo(p.size * 0.4, 0);
          ctx.lineTo(0, p.size * 1.6);
          ctx.lineTo(-p.size * 0.4, 0);
          ctx.closePath();
          ctx.fill();
          ctx.rotate(Math.PI / 2);
          ctx.beginPath();
          ctx.moveTo(0, -p.size * 1.6);
          ctx.lineTo(p.size * 0.4, 0);
          ctx.lineTo(0, p.size * 1.6);
          ctx.lineTo(-p.size * 0.4, 0);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      // 에픽 이상: 등급 배너
      if (fx.banner && el < 1900) {
        const p = Math.min(1, el / 260);
        const pop =
          0.6 +
          0.4 * (1 - (1 - p) ** 3) +
          (el < 260 ? 0.12 * Math.sin(p * Math.PI) : 0);
        const fade = el > 1500 ? 1 - (el - 1500) / 400 : 1;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(w / 2, h * 0.12 + 14);
        ctx.scale(pop, pop);
        ctx.font = `900 ${tier >= 5 ? 30 : 26}px -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 7;
        ctx.strokeStyle = "#0b1020";
        ctx.strokeText(fx.banner, 0, 0);
        if (fx.colors === "rainbow") {
          const g = ctx.createLinearGradient(-90, 0, 90, 0);
          ["#ff5f6d", "#ffc371", "#6fffb0", "#5ec8ff", "#b388ff"].forEach(
            (c, i, a) => g.addColorStop(i / (a.length - 1), c),
          );
          ctx.fillStyle = g;
        } else ctx.fillStyle = fx.colors[0];
        ctx.fillText(fx.banner, 0, 0);
        ctx.restore();
      }

      if (el < DURATION) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [active, rarity]);

  return (
    <canvas
      ref={ref}
      role="presentation"
      aria-label={`${RARITY_LABEL[rarity]} 등급`}
      className="pointer-events-none absolute inset-0 z-20 size-full"
    />
  );
}
