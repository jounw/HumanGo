// 데모 전용: 다음에 잡는 캐릭터의 등급을 고정한다 (AI 변신 등을 바로 확인하려는 용도).
import type { Rarity } from "@/lib/constants";
import { isRarity, rollRarity } from "@/lib/game/rarity";

const KEY = "humango-demo-rarity";

export type RarityChoice = Rarity | "random";

export function getRarityChoice(): RarityChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v && isRarity(v) ? v : "random";
  } catch {
    return "random";
  }
}

const listeners = new Set<() => void>();
export function subscribeRarityChoice(cb: () => void) {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

export function setRarityChoice(v: RarityChoice) {
  try {
    if (v === "random") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, v);
  } catch {
    // 저장 못 해도 이번 선택만 무시된다
  }
  listeners.forEach((cb) => cb());
}

/** 데모에서 고정한 등급이 있으면 그걸, 없으면 정규분포 확률로 뽑는다. */
export function pickRarity(demo: boolean): Rarity {
  if (demo) {
    const c = getRarityChoice();
    if (c !== "random") return c;
  }
  return rollRarity();
}
