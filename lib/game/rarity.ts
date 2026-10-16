import { RARITY_WEIGHTS, type Rarity } from "../constants";

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "일반",
  rare: "레어",
  epic: "에픽",
  legendary: "전설",
};

export const RARITY_ORDER: Rarity[] = ["common", "rare", "epic", "legendary"];

/** 카드 테두리/글로우 스타일 (Tailwind 클래스). legendary 는 반짝임 애니메이션 포함. */
export const RARITY_STYLE: Record<
  Rarity,
  { ring: string; badge: string; glow: string }
> = {
  common: {
    ring: "ring-2 ring-slate-400/50",
    badge: "bg-slate-500/30 text-slate-200",
    glow: "",
  },
  rare: {
    ring: "ring-2 ring-sky-400",
    badge: "bg-sky-500/25 text-sky-200",
    glow: "shadow-[0_0_18px_rgba(56,189,248,0.35)]",
  },
  epic: {
    ring: "ring-2 ring-violet-400",
    badge: "bg-violet-500/25 text-violet-200",
    glow: "shadow-[0_0_22px_rgba(167,139,250,0.5)]",
  },
  legendary: {
    ring: "ring-2 ring-amber-300",
    badge: "bg-amber-400/25 text-amber-200",
    glow: "shadow-[0_0_28px_rgba(252,211,77,0.6)] legendary-shine",
  },
};

export function isRarity(v: string): v is Rarity {
  return v in RARITY_WEIGHTS;
}

/** 가중치대로 희귀도를 뽑는다. rng 는 테스트용으로 주입 가능 (0 이상 1 미만). */
export function rollRarity(rng: () => number = Math.random): Rarity {
  const total = RARITY_ORDER.reduce((s, r) => s + RARITY_WEIGHTS[r], 0);
  let x = rng() * total;
  for (const r of RARITY_ORDER) {
    x -= RARITY_WEIGHTS[r];
    if (x < 0) return r;
  }
  return "common";
}
