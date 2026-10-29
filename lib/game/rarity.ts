import { RARITY_SIGMA, type Rarity } from "../constants";

/** 낮은 등급 -> 높은 등급 */
export const RARITY_ORDER: Rarity[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
];

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "일반",
  uncommon: "고급",
  rare: "레어",
  epic: "에픽",
  legendary: "전설",
  mythic: "신화",
};

/** 0(일반) ~ 5(신화). 연출 강도를 정할 때 쓴다. */
export const rarityTier = (r: Rarity) => RARITY_ORDER.indexOf(r);

/**
 * 카드 스타일 (Tailwind + globals.css 의 클래스).
 * ring: 테두리, glow: 그림자/반짝임/펄스 효과, badge: 등급 뱃지.
 * 높은 등급일수록 효과가 겹겹이 늘어난다:
 *  고급~레어는 색 테두리+그림자, 에픽은 펄스, 전설은 빛줄기 스윕, 신화는 회전하는 무지개 테두리.
 */
export const RARITY_STYLE: Record<
  Rarity,
  { ring: string; badge: string; glow: string }
> = {
  common: {
    ring: "ring-2 ring-slate-400/50",
    badge: "bg-slate-500/30 text-slate-200",
    glow: "",
  },
  uncommon: {
    ring: "ring-2 ring-emerald-400/80",
    badge: "bg-emerald-500/25 text-emerald-200",
    glow: "shadow-[0_0_14px_rgba(52,211,153,0.32)]",
  },
  rare: {
    ring: "ring-2 ring-sky-400",
    badge: "bg-sky-500/25 text-sky-200",
    glow: "shadow-[0_0_20px_rgba(56,189,248,0.4)]",
  },
  epic: {
    ring: "ring-2 ring-violet-400",
    badge: "bg-violet-500/30 text-violet-100",
    glow: "shadow-[0_0_26px_rgba(167,139,250,0.6)] glow-pulse",
  },
  legendary: {
    ring: "ring-2 ring-amber-300",
    badge: "bg-gradient-to-r from-amber-400/40 to-yellow-200/30 text-amber-100",
    glow: "relative overflow-hidden shine shadow-[0_0_32px_rgba(252,211,77,0.7)] glow-pulse",
  },
  mythic: {
    ring: "rarity-mythic",
    badge: "rarity-mythic-badge text-white",
    glow: "relative overflow-hidden shine shadow-[0_0_38px_rgba(236,120,255,0.6)] glow-pulse",
  },
};

/** 등급 공개 연출 설정: 입자 수, 색, 크기, 배너 문구 */
export const RARITY_FX: Record<
  Rarity,
  {
    count: number;
    colors: string[] | "rainbow";
    confetti: boolean;
    banner: string | null;
    flash: number; // 화면 번쩍임 세기 0~1
    vibrate: number[];
  }
> = {
  common: {
    count: 0,
    colors: [],
    confetti: false,
    banner: null,
    flash: 0,
    vibrate: [],
  },
  uncommon: {
    count: 14,
    colors: ["#6ee7b7", "#a7f3d0"],
    confetti: false,
    banner: null,
    flash: 0,
    vibrate: [20],
  },
  rare: {
    count: 30,
    colors: ["#7dd3fc", "#bae6fd", "#ffffff"],
    confetti: false,
    banner: null,
    flash: 0.1,
    vibrate: [30],
  },
  epic: {
    count: 64,
    colors: ["#c4b5fd", "#a78bfa", "#f0abfc"],
    confetti: true,
    banner: "에픽!",
    flash: 0.2,
    vibrate: [30, 40, 50],
  },
  legendary: {
    count: 120,
    colors: ["#fde68a", "#fbbf24", "#ffffff", "#fb923c"],
    confetti: true,
    banner: "전설 등급!",
    flash: 0.4,
    vibrate: [40, 40, 40, 40, 90],
  },
  mythic: {
    count: 200,
    colors: "rainbow",
    confetti: true,
    banner: "✦ 신화 등급 ✦",
    flash: 0.65,
    vibrate: [50, 30, 50, 30, 50, 30, 140],
  },
};

export function isRarity(v: string): v is Rarity {
  return v in RARITY_SIGMA;
}

/** |z| (표준편차 단위) 가 속하는 등급. */
export function rarityFromSigma(absZ: number): Rarity {
  for (const r of RARITY_ORDER) {
    if (absZ < RARITY_SIGMA[r]) return r;
  }
  return "mythic";
}

/** Box-Muller 변환으로 N(0,1) 표본 하나를 뽑는다. */
function gaussian(rng: () => number): number {
  const u = 1 - rng(); // (0, 1] 로 만들어 log(0) 방지
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 정규분포에서 뽑은 z 의 절댓값 구간으로 희귀도를 정한다. rng 는 테스트용으로 주입 가능 (0 이상 1 미만). */
export function rollRarity(rng: () => number = Math.random): Rarity {
  return rarityFromSigma(Math.abs(gaussian(rng)));
}
