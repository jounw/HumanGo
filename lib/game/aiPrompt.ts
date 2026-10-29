// 전설/신화 캐릭터를 이미지 생성 AI 로 다시 그릴 때 쓰는 프롬프트.
// 몬스터 수집 RPG 의 크리처처럼, 사람의 얼굴 특징을 가진 오리지널 크리처로 그린다.
// 속성과 모티프는 포획 id 로 정해져서 같은 등급 안에서도 서로 다른 모습이 나온다.

import type { Rarity } from "../constants";

export type AiRarity = Extract<Rarity, "legendary" | "mythic">;

export const isAiRarity = (r: string): r is AiRarity =>
  r === "legendary" || r === "mythic";

const ELEMENTS = [
  "fire (flames, ember-orange and red)",
  "water (flowing water, deep blue and aqua)",
  "grass (leaves and vines, fresh green)",
  "electric (lightning bolts, bright yellow)",
  "ice (frost crystals, pale cyan)",
  "psychic (floating orbs, pink and purple glow)",
  "dragon (scales, horns and a tail, teal and indigo)",
  "ghost (wispy spectral flames, violet and dark teal)",
  "steel (polished metal plates, silver and blue-grey)",
  "fairy (sparkles and ribbons, soft pink and mint)",
  "rock (crystal gems and stone, warm brown and amber)",
  "wind (swirling air currents, white and sky blue)",
];

const MOTIFS = [
  "a fox-like body with multiple tails",
  "a lion-like body with a flowing mane",
  "a wolf-like body with sleek fur",
  "a bird-like body with a long crest and tail feathers",
  "a dragon-like body with small wings and a tail",
  "a deer-like body with crystal antlers",
  "a cat-like body with a ribbon-like tail",
  "a turtle-like body with a gem-studded shell",
];

const COMMON =
  "Design an original, cute-but-powerful collectible creature in the style of a Japanese monster-collecting " +
  "RPG (bright anime game art, bold clean outline, vivid cel shading, big expressive eyes, rounded friendly " +
  "proportions, small compact full-body figure). It must be a completely original creature, not any existing " +
  "character or franchise. The creature takes on the recognizable features of the person in the reference " +
  "photo: their face shape, hairstyle and hair color shown as the creature's head fur / mane / crest, " +
  "their eye shape, glasses if any, and their expression, so the person can be recognized. " +
  "Full body visible with margin on all sides, centered, three-quarter front view. " +
  "Transparent background, no text, no logo, no frame, no watermark.";

const TIER: Record<AiRarity, string> = {
  legendary:
    "Legendary-tier creature: majestic and heroic, golden armor-like markings, a glowing gem on the forehead, " +
    "and a bright energy aura.",
  mythic:
    "Mythic-tier creature: the most spectacular and awe-inspiring design, a divine presence with luminous " +
    "wings or a floating halo, a radiant rainbow aura, drifting star dust and a floating crystal.",
};

/** seed 로 속성과 모티프를 고른다. 같은 seed 면 항상 같은 조합. */
export function buildPrompt(rarity: AiRarity, seed = 0): string {
  const element = ELEMENTS[seed % ELEMENTS.length];
  const motif = MOTIFS[Math.floor(seed / ELEMENTS.length) % MOTIFS.length];
  return `${COMMON} ${TIER[rarity]} Element theme: ${element}. Body: ${motif}.`;
}
