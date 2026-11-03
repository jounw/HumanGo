// 캡처 id(시드) + 희귀도로 능력치를 결정한다. 같은 캐릭터는 항상 같은 능력치를 가진다.
import type { Rarity } from "@/lib/constants";
import { rarityTier } from "./rarity";
import { hashSeed } from "./seed";

export type Stats = { hp: number; atk: number; def: number; spd: number };

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function statsFor(id: string, rarity: Rarity): Stats {
  const t = rarityTier(rarity);
  const rng = mulberry32(hashSeed(id));
  const roll = () => 0.75 + rng() * 0.5; // 0.75 ~ 1.25
  return {
    hp: Math.round((100 + t * 40) * roll()),
    atk: Math.round((20 + t * 8) * roll()),
    def: Math.round((15 + t * 6) * roll()),
    spd: Math.round((10 + t * 4) * roll()),
  };
}
export const __broken: number = 'not a number';
