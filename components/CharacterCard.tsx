import Link from "next/link";
import type { DexItem } from "@/lib/dex";
import { RARITY_LABEL, RARITY_STYLE } from "@/lib/game/rarity";

export default function CharacterCard({
  item,
  showOwner = true,
}: {
  item: DexItem;
  showOwner?: boolean;
}) {
  const style = RARITY_STYLE[item.rarity];
  return (
    <Link
      href={`/dex/${item.id}`}
      className={`flex flex-col gap-2 rounded-2xl bg-white/5 p-3 active:scale-[0.98] ${style.ring} ${style.glow}`}
    >
      <div className="relative aspect-square">
        {item.characterUrl ? (
          // 서명된 URL 이라 next/image 최적화 대상이 아님
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.characterUrl}
            alt={item.name}
            loading="lazy"
            className="size-full object-contain"
          />
        ) : (
          <div className="grid size-full place-items-center text-xs text-white/40">
            이미지 없음
          </div>
        )}
        <span
          className={`absolute top-0 left-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${style.badge}`}
        >
          {RARITY_LABEL[item.rarity]}
        </span>
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold">{item.name}</p>
        {showOwner && (
          <p className="truncate text-xs text-white/55">
            {item.ownerNickname}님이 잡음
          </p>
        )}
      </div>
    </Link>
  );
}
