"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import CharacterCard from "@/components/CharacterCard";
import DexDetail from "@/components/DexDetail";
import { GAME_NAME } from "@/lib/constants";
import type { DexItem } from "@/lib/dex";
import {
  DEMO_NICKNAME,
  demoGet,
  demoList,
  toItem,
  type DemoRecord,
} from "@/lib/demo/store";

function useRecords() {
  const [records, setRecords] = useState<DemoRecord[] | null>(null);
  useEffect(() => {
    let dead = false;
    demoList().then((r) => !dead && setRecords(r));
    return () => {
      dead = true;
    };
  }, []);
  return records;
}

export function DemoHome() {
  const records = useRecords();
  const recent: DexItem[] = (records ?? []).slice(0, 4).map(toItem);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-8 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight">{GAME_NAME}</h1>
        <span className="rounded-full bg-amber-400/20 px-3 py-1 text-xs font-semibold text-amber-200">
          데모 모드
        </span>
      </header>
      <section>
        <p className="text-white/60">안녕하세요,</p>
        <p className="text-3xl font-bold">{DEMO_NICKNAME}님</p>
      </section>
      <Link
        href="/capture"
        className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-3xl bg-emerald-400 text-black shadow-lg shadow-emerald-400/20 active:scale-[0.98]"
      >
        <span className="text-3xl font-black">잡으러 가기</span>
        <span className="text-sm font-medium opacity-70">
          웹캠으로 친구를 찾아보세요
        </span>
      </Link>
      <Link
        href="/dex"
        className="flex items-center justify-between rounded-2xl bg-white/10 px-5 py-4 ring-1 ring-white/10 active:bg-white/15"
      >
        <span className="font-semibold">내 도감</span>
        <span className="text-white/60">{records?.length ?? 0}명 잡음 ›</span>
      </Link>
      {recent.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">최근 잡은 친구</h2>
          <ul className="grid grid-cols-2 gap-3">
            {recent.map((i) => (
              <li key={i.id}>
                <CharacterCard item={i} showOwner={false} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

export function DemoDexList() {
  const records = useRecords();
  const items = (records ?? []).map(toItem);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 py-6">
      <header className="flex items-center gap-3">
        <Link
          href="/"
          aria-label="홈으로"
          className="flex size-11 items-center justify-center rounded-full bg-white/10 text-xl"
        >
          ‹
        </Link>
        <h1 className="text-2xl font-black">도감</h1>
        <span className="ml-auto text-sm text-white/55">{items.length}명</span>
      </header>
      {records && items.length === 0 ? (
        <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-lg font-semibold">아직 잡은 친구가 없어요</p>
          <Link
            href="/capture"
            className="min-h-12 rounded-xl bg-emerald-400 px-6 py-3 font-bold text-black"
          >
            잡으러 가기
          </Link>
        </section>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {items.map((i) => (
            <li key={i.id}>
              <CharacterCard item={i} showOwner={false} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export function DemoDexDetail({ id }: { id: string }) {
  const [rec, setRec] = useState<DemoRecord | null | undefined>(undefined);
  useEffect(() => {
    let dead = false;
    demoGet(id).then((r) => !dead && setRec(r ?? null));
    return () => {
      dead = true;
    };
  }, [id]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 py-6">
      <header className="flex items-center gap-3">
        <Link
          href="/dex"
          aria-label="도감으로"
          className="flex size-11 items-center justify-center rounded-full bg-white/10 text-xl"
        >
          ‹
        </Link>
        <h1 className="text-lg font-bold">도감 상세</h1>
      </header>
      {rec === undefined ? (
        <p className="text-white/60">불러오는 중…</p>
      ) : rec === null ? (
        <p className="text-white/60">찾을 수 없는 캐릭터예요.</p>
      ) : (
        <DexDetail
          id={rec.id}
          name={rec.name}
          rarity={rec.rarity}
          ownerNickname={DEMO_NICKNAME}
          isMine
          capturedAt={new Date(rec.capturedAt).toLocaleString("ko-KR")}
          characterUrl={URL.createObjectURL(rec.character)}
          sceneUrl={URL.createObjectURL(rec.scene)}
          cutoutUrl={URL.createObjectURL(rec.cutout)}
          paths={[]}
        />
      )}
    </main>
  );
}
