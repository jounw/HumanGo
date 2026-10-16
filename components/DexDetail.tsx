"use client";

import { useState } from "react";
import Chibi3D from "@/components/Chibi3D";
import { useRouter } from "next/navigation";
import { BUCKET, CAPTURE_NAME_MAX, type Rarity } from "@/lib/constants";
import { RARITY_LABEL, RARITY_STYLE } from "@/lib/game/rarity";
import { DEMO, demoDelete, demoRename } from "@/lib/demo/store";
import { createClient } from "@/lib/supabase/client";

type Props = {
  id: string;
  name: string;
  rarity: Rarity;
  ownerNickname: string;
  isMine: boolean;
  capturedAt: string;
  characterUrl: string | null;
  faceUrl?: string | null; // 있으면 3D 로 볼 수 있다
  bodyId?: string;
  sceneUrl: string | null;
  cutoutUrl: string | null;
  paths: string[]; // 삭제 시 지울 storage 경로
};

export default function DexDetail(p: Props) {
  const router = useRouter();
  const [name, setName] = useState(p.name);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.name);
  const [original, setOriginal] = useState(false);
  const [view3d, setView3d] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const style = RARITY_STYLE[p.rarity];

  async function saveName() {
    const next = draft.trim();
    if (!next || next === name) return setEditing(false);
    setBusy(true);
    setError(null);
    if (DEMO) {
      await demoRename(p.id, next);
      setBusy(false);
      setName(next);
      setEditing(false);
      return;
    }
    const { error } = await createClient()
      .from("captures")
      .update({ name: next })
      .eq("id", p.id);
    setBusy(false);
    if (error) return setError("이름을 바꾸지 못했어요.");
    setName(next);
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    setError(null);
    if (DEMO) {
      await demoDelete(p.id);
      router.replace("/dex");
      return;
    }
    const supabase = createClient();
    // 행을 먼저 지우면 파일 경로를 잃으므로 파일 -> 행 순서
    const { error: fileError } = await supabase.storage
      .from(BUCKET)
      .remove(p.paths);
    const { error: rowError } = fileError
      ? { error: fileError }
      : await supabase.from("captures").delete().eq("id", p.id);
    if (rowError) {
      setBusy(false);
      return setError("삭제하지 못했어요. 다시 시도해 주세요.");
    }
    router.replace("/dex");
    router.refresh();
  }

  const canOriginal = p.sceneUrl && p.cutoutUrl;

  return (
    <div className="flex flex-col gap-5">
      <section
        className={`relative rounded-3xl bg-white/5 p-5 ${style.ring} ${style.glow}`}
      >
        <span
          className={`absolute top-4 left-4 rounded-full px-2.5 py-1 text-xs font-bold ${style.badge}`}
        >
          {RARITY_LABEL[p.rarity]}
        </span>
        {p.faceUrl && p.bodyId && (
          <button
            type="button"
            onClick={() => setView3d((v) => !v)}
            aria-pressed={view3d}
            className="absolute top-3 right-3 z-10 min-h-9 rounded-full bg-white/10 px-3 text-xs font-bold active:bg-white/20"
          >
            {view3d ? "3D" : "2D"}
          </button>
        )}
        {view3d && p.faceUrl && p.bodyId ? (
          <Chibi3D
            face={p.faceUrl}
            bodyId={p.bodyId}
            onUnavailable={() => setView3d(false)}
            className="mx-auto aspect-square w-full max-w-xs"
          />
        ) : p.characterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.characterUrl}
            alt={name}
            className="mx-auto aspect-square w-full max-w-xs object-contain"
          />
        ) : (
          <div className="grid aspect-square place-items-center text-white/40">
            이미지 없음
          </div>
        )}
      </section>

      <section className="flex flex-col gap-1">
        {editing ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveName();
            }}
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={CAPTURE_NAME_MAX}
              aria-label="이름"
              className="min-w-0 flex-1 rounded-xl bg-white/10 px-4 py-2.5 text-lg font-bold ring-1 ring-white/10 outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <button
              disabled={busy}
              className="rounded-xl bg-emerald-400 px-4 font-bold text-black disabled:opacity-50"
            >
              저장
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(name);
                setEditing(false);
              }}
              className="rounded-xl bg-white/10 px-3 text-sm"
            >
              취소
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 flex-1 truncate text-2xl font-black">
              {name}
            </h2>
            {p.isMine && (
              <button
                onClick={() => setEditing(true)}
                className="min-h-11 rounded-lg px-3 text-sm text-white/60 hover:text-white"
              >
                이름 수정
              </button>
            )}
          </div>
        )}
        <p className="text-sm text-white/60">
          {p.ownerNickname}님이 잡음 · {p.capturedAt}
        </p>
      </section>

      {canOriginal && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">포획 당시 장면</h3>
            <label className="flex min-h-11 items-center gap-2 text-sm text-white/70">
              <input
                type="checkbox"
                checked={original}
                onChange={(e) => setOriginal(e.target.checked)}
                className="size-4 accent-emerald-400"
              />
              원래 사진처럼 보기
            </label>
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-black">
            {/* eslint-disable @next/next/no-img-element */}
            <img
              src={p.sceneUrl!}
              alt="사람이 지워진 포획 당시 배경"
              className="w-full"
            />
            {original && (
              <img
                src={p.cutoutUrl!}
                alt={`${name}의 원래 모습`}
                className="absolute inset-0 size-full"
              />
            )}
            {/* eslint-enable @next/next/no-img-element */}
          </div>
        </section>
      )}

      {error && (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      )}

      {p.isMine && (
        <section className="mt-2">
          {confirmDelete ? (
            <div className="flex items-center gap-2 rounded-xl bg-rose-500/10 p-3">
              <p className="flex-1 text-sm">
                정말 삭제할까요? 되돌릴 수 없어요.
              </p>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={busy}
                className="rounded-lg bg-white/10 px-3 py-2 text-sm"
              >
                취소
              </button>
              <button
                onClick={remove}
                disabled={busy}
                className="rounded-lg bg-rose-500 px-3 py-2 text-sm font-bold disabled:opacity-50"
              >
                {busy ? "삭제 중…" : "삭제"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="min-h-11 text-sm text-rose-300/80 hover:text-rose-300"
            >
              도감에서 삭제
            </button>
          )}
        </section>
      )}
    </div>
  );
}
