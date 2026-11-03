"use client";

import { useState } from "react";
import type { DexItem } from "@/lib/dex";
import { MAX_TEAM } from "@/lib/game/battle";
import { RARITY_LABEL, RARITY_STYLE } from "@/lib/game/rarity";
import { statsFor } from "@/lib/game/stats";

export default function TeamPicker({
  items,
  confirmLabel,
  busy,
  error,
  onConfirm,
}: {
  items: DexItem[];
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: (ids: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) =>
    setPicked((p) =>
      p.includes(id)
        ? p.filter((x) => x !== id)
        : p.length >= MAX_TEAM
          ? p
          : [...p, id],
    );

  if (items.length === 0)
    return (
      <p className="rounded-2xl bg-white/5 p-5 text-center text-sm text-white/60">
        배틀에 내보낼 캐릭터가 없어요. 먼저 친구를 잡아 도감을 채워 보세요.
      </p>
    );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-white/60">
        캐릭터를 최대 {MAX_TEAM}마리 골라 주세요. 먼저 고른 순서대로 출전해요.
      </p>
      <ul className="grid grid-cols-2 gap-3">
        {items.map((it) => {
          const idx = picked.indexOf(it.id);
          const st = statsFor(it.id, it.rarity);
          const style = RARITY_STYLE[it.rarity];
          return (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => toggle(it.id)}
                aria-pressed={idx >= 0}
                className={`relative flex w-full flex-col gap-2 rounded-2xl p-3 text-left active:scale-[0.98] ${
                  idx >= 0 ? "bg-emerald-400/20 ring-2 ring-emerald-300" : `bg-white/5 ${style.ring}`
                }`}
              >
                {idx >= 0 && (
                  <span className="absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-emerald-300 text-sm font-black text-black">
                    {idx + 1}
                  </span>
                )}
                <div className="aspect-square">
                  {it.characterUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.characterUrl}
                      alt={it.name}
                      className="size-full object-contain"
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{it.name}</p>
                  <p className="text-[11px] text-white/55">
                    {RARITY_LABEL[it.rarity]} · HP {st.hp} · 공 {st.atk} · 방{" "}
                    {st.def} · 속 {st.spd}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-sm text-rose-300">{error}</p>}
      <button
        type="button"
        disabled={picked.length === 0 || busy}
        onClick={() => onConfirm(picked)}
        className="sticky bottom-4 min-h-12 rounded-xl bg-emerald-400 px-6 py-3 font-bold text-black shadow-lg disabled:opacity-40"
      >
        {busy ? "처리 중…" : `${confirmLabel} (${picked.length}/${MAX_TEAM})`}
      </button>
    </div>
  );
}
