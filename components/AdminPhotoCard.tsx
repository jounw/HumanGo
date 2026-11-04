"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Rarity } from "@/lib/constants";
import { RARITY_LABEL, RARITY_STYLE } from "@/lib/game/rarity";

type Img = { label: string; url: string | null };

export default function AdminPhotoCard(p: {
  id: string;
  name: string;
  rarity: Rarity;
  isPrivate: boolean;
  owner: string;
  capturedAt: string;
  images: Img[];
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const style = RARITY_STYLE[p.rarity];

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/captures/${p.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setError("삭제하지 못했어요.");
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl bg-white/5 p-3 ${style.ring}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${style.badge}`}
        >
          {RARITY_LABEL[p.rarity]}
        </span>
        {p.isPrivate && <span title="나만 보기">🔒</span>}
        <p className="min-w-0 flex-1 truncate font-semibold">{p.name}</p>
      </div>
      <p className="-mt-2 text-xs text-white/55">
        {p.owner} · {p.capturedAt}
      </p>

      <div className="grid grid-cols-2 gap-2">
        {p.images.map((i) => (
          <figure key={i.label} className="flex flex-col gap-1">
            {i.url ? (
              // 서명된 URL 이라 next/image 최적화 대상이 아님. 눌러서 원본 크기로 본다.
              <a href={i.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={i.url}
                  alt={`${p.name} ${i.label}`}
                  loading="lazy"
                  className="aspect-square w-full rounded-lg bg-black/40 object-contain"
                />
              </a>
            ) : (
              <div className="grid aspect-square place-items-center rounded-lg bg-black/40 text-xs text-white/40">
                없음
              </div>
            )}
            <figcaption className="text-center text-[11px] text-white/50">
              {i.label}
            </figcaption>
          </figure>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      )}
      {confirming ? (
        <div className="flex gap-2">
          <button
            onClick={remove}
            disabled={busy}
            className="min-h-11 flex-1 rounded-xl bg-rose-500 font-bold text-white disabled:opacity-50"
          >
            {busy ? "삭제 중…" : "정말 삭제 (되돌릴 수 없어요)"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="min-h-11 rounded-xl bg-white/10 px-4 text-sm"
          >
            취소
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="min-h-11 rounded-xl bg-white/10 text-sm text-rose-300"
        >
          삭제
        </button>
      )}
    </div>
  );
}
