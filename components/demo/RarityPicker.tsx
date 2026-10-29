"use client";

import { useSyncExternalStore } from "react";
import {
  getRarityChoice,
  setRarityChoice,
  subscribeRarityChoice,
  type RarityChoice,
} from "@/lib/demo/rarityOverride";
import { RARITY_LABEL, RARITY_ORDER } from "@/lib/game/rarity";

// 데모 전용: 다음에 잡는 캐릭터의 등급을 고정한다
export default function RarityPicker() {
  const choice = useSyncExternalStore<RarityChoice>(
    subscribeRarityChoice,
    getRarityChoice,
    () => "random",
  );
  const options: RarityChoice[] = ["random", ...RARITY_ORDER];
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-white/5 p-4">
      <h2 className="text-sm font-semibold">
        다음 등급 고정 <span className="text-white/50">(데모)</span>
      </h2>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => {
              setRarityChoice(o);
            }}
            aria-pressed={choice === o}
            className={`min-h-9 rounded-full px-3 text-sm ${choice === o ? "bg-emerald-400 font-bold text-black" : "bg-white/10 text-white/80"}`}
          >
            {o === "random" ? "랜덤" : RARITY_LABEL[o]}
          </button>
        ))}
      </div>
    </section>
  );
}
