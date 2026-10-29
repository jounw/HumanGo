"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BUCKET } from "@/lib/constants";
import { DEMO, demoClear } from "@/lib/demo/store";
import { createClient } from "@/lib/supabase/client";

// 내 도감을 전부 비운다 (되돌릴 수 없으므로 두 번 눌러야 실행)
export default function ResetDexButton({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      if (DEMO) {
        await demoClear();
      } else {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("로그인이 필요해요.");
        const { data, error: qe } = await supabase
          .from("captures")
          .select("character_path,face_path,scene_path,cutout_path")
          .eq("owner_id", user.id);
        if (qe) throw qe;
        const paths = (data ?? []).flatMap((r) =>
          [r.character_path, r.face_path, r.scene_path, r.cutout_path].filter(
            Boolean,
          ),
        ) as string[];
        for (let i = 0; i < paths.length; i += 100) {
          const { error: se } = await supabase.storage
            .from(BUCKET)
            .remove(paths.slice(i, i + 100));
          if (se) throw se;
        }
        const { error: de } = await supabase
          .from("captures")
          .delete()
          .eq("owner_id", user.id);
        if (de) throw de;
      }
      setConfirming(false);
      onDone?.();
      router.refresh();
    } catch (e) {
      console.error("도감 리셋 실패", e);
      setError("도감을 비우지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={() => setConfirming(true)}
          className="min-h-11 px-3 text-sm text-rose-300/80 hover:text-rose-300"
        >
          도감 초기화
        </button>
        {error && (
          <p role="alert" className="text-xs text-rose-300">
            {error}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-xl bg-rose-500/10 p-3">
      <p className="flex-1 text-sm">
        내 도감을 모두 지울까요? 되돌릴 수 없어요.
      </p>
      <button
        onClick={() => setConfirming(false)}
        disabled={busy}
        className="rounded-lg bg-white/10 px-3 py-2 text-sm"
      >
        취소
      </button>
      <button
        onClick={reset}
        disabled={busy}
        className="rounded-lg bg-rose-500 px-3 py-2 text-sm font-bold disabled:opacity-50"
      >
        {busy ? "지우는 중…" : "모두 삭제"}
      </button>
    </div>
  );
}
