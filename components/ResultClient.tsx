"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Chibi3D from "@/components/Chibi3D";
import { BODIES, composeChibi } from "@/lib/game/chibi";
import { RARITY_LABEL, RARITY_STYLE, rollRarity } from "@/lib/game/rarity";
import { getCaptureSession, setCaptureSession } from "@/lib/game/session";
import { DEMO } from "@/lib/demo/store";
import { demoRegister, registerCapture } from "@/lib/game/upload";
import { CAPTURE_NAME_MAX } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { extractFace } from "@/lib/vision/face";

const noopSubscribe = () => () => {};

export default function ResultClient() {
  const router = useRouter();
  // 서버에서는 null, 클라이언트에서는 캡처 화면이 남긴 세션 (하이드레이션 안전)
  const session = useSyncExternalStore(
    noopSubscribe,
    getCaptureSession,
    () => null,
  );

  const [face, setFace] = useState<HTMLCanvasElement | null>(null);
  const [faceFound, setFaceFound] = useState(true);
  const [faceError, setFaceError] = useState(false);
  const [view3d, setView3d] = useState(true);
  const [bodyIdx, setBodyIdx] = useState(0);
  const [character, setCharacter] = useState<HTMLCanvasElement | null>(null);
  const [rarity] = useState(() => rollRarity());
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const swipeStart = useRef<number | null>(null);

  // 세션이 없으면(새로고침 등) 캡처 화면으로
  useEffect(() => {
    if (!session) router.replace("/capture");
  }, [session, router]);

  // 얼굴 추출 (1회)
  useEffect(() => {
    if (!session) return;
    let dead = false;
    extractFace(session.still, session.target)
      .then((r) => {
        if (dead) return;
        setFace(r.face);
        setFaceFound(r.found);
      })
      .catch((e) => {
        console.error("얼굴 추출 실패", e);
        if (!dead) setFaceError(true);
      });
    return () => {
      dead = true;
    };
  }, [session]);

  // 몸통이 바뀔 때마다 캐릭터 다시 합성
  useEffect(() => {
    if (!face) return;
    let dead = false;
    composeChibi(face, BODIES[bodyIdx]).then((c) => !dead && setCharacter(c));
    return () => {
      dead = true;
    };
  }, [face, bodyIdx]);

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !character) return;
    canvas.width = character.width;
    canvas.height = character.height;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(character, 0, 0);
  }, [character]);

  const step = (d: number) =>
    setBodyIdx((i) => (i + d + BODIES.length) % BODIES.length);

  async function register() {
    if (!session || !face || !character || saving) return;
    setSaving(true);
    setError(null);
    try {
      const id = await (
        DEMO
          ? demoRegister
          : (i: Parameters<typeof registerCapture>[1]) =>
              registerCapture(createClient(), i)
      )({
        name,
        bodyId: BODIES[bodyIdx].id,
        rarity,
        character,
        face,
        scene: session.scene,
        cutout: session.target.cutout,
      });
      setCaptureSession(null);
      router.replace(`/dex/${id}`);
    } catch (e) {
      console.error("등록 실패", e);
      setError(e instanceof Error ? e.message : "등록에 실패했어요.");
      setSaving(false);
    }
  }

  if (!session) {
    return (
      <main className="grid min-h-dvh place-items-center text-white/60">
        불러오는 중…
      </main>
    );
  }

  const style = RARITY_STYLE[rarity];
  const ready = !!character;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 py-6">
      <header className="text-center">
        <p className="text-sm font-semibold text-emerald-300">잡았다!</p>
        <h1 className="text-2xl font-black">새 친구가 도감에 들어와요</h1>
      </header>

      <section
        aria-label="캐릭터 미리보기"
        className={`relative mx-auto w-full max-w-xs touch-pan-y rounded-3xl bg-white/5 p-4 ${style.ring} ${style.glow}`}
        // 2D 일 때만 좌우 스와이프로 몸통 변경 (3D 에서는 드래그가 회전)
        onPointerDown={(e) => (swipeStart.current = view3d ? null : e.clientX)}
        onPointerUp={(e) => {
          const s = swipeStart.current;
          swipeStart.current = null;
          if (s !== null && Math.abs(e.clientX - s) > 40)
            step(e.clientX < s ? 1 : -1);
        }}
      >
        <span
          className={`absolute top-3 left-3 rounded-full px-2.5 py-1 text-xs font-bold ${style.badge}`}
        >
          {RARITY_LABEL[rarity]}
        </span>
        <button
          type="button"
          onClick={() => setView3d((v) => !v)}
          aria-pressed={view3d}
          className="absolute top-2 right-2 z-10 min-h-9 rounded-full bg-white/10 px-3 text-xs font-bold active:bg-white/20"
        >
          {view3d ? "3D" : "2D"}
        </button>
        {view3d && face && (
          <Chibi3D
            face={face}
            bodyId={BODIES[bodyIdx].id}
            onUnavailable={() => setView3d(false)}
            className="aspect-square w-full"
          />
        )}
        <canvas
          ref={previewRef}
          className={`aspect-square w-full transition-opacity ${ready ? "opacity-100" : "opacity-0"} ${view3d && face ? "hidden" : ""}`}
        />
        {!ready && (
          <div className="absolute inset-0 grid place-items-center text-sm text-white/60">
            {faceError ? "캐릭터를 만들지 못했어요" : "캐릭터 만드는 중…"}
          </div>
        )}
      </section>

      <div className="flex items-center justify-center gap-4">
        <button
          aria-label="이전 몸통"
          onClick={() => step(-1)}
          className="size-11 rounded-full bg-white/10 text-xl active:bg-white/20"
        >
          ‹
        </button>
        <div className="min-w-24 text-center">
          <p className="font-semibold">{BODIES[bodyIdx].name}</p>
          <div className="mt-1 flex justify-center gap-1.5" aria-hidden>
            {BODIES.map((b, i) => (
              <span
                key={b.id}
                className={`size-1.5 rounded-full ${i === bodyIdx ? "bg-emerald-300" : "bg-white/25"}`}
              />
            ))}
          </div>
        </div>
        <button
          aria-label="다음 몸통"
          onClick={() => step(1)}
          className="size-11 rounded-full bg-white/10 text-xl active:bg-white/20"
        >
          ›
        </button>
      </div>

      {ready && !faceFound && (
        <p
          role="status"
          className="rounded-xl bg-amber-400/15 px-4 py-3 text-center text-sm text-amber-200"
        >
          얼굴이 잘 안 보여요. 그래도 등록할 수 있어요.
        </p>
      )}

      <form
        className="mt-auto flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          register();
        }}
      >
        <label className="flex flex-col gap-2">
          <span className="text-sm text-white/70">이름을 지어 주세요</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={CAPTURE_NAME_MAX}
            placeholder="예: 야생의 민수"
            required
            className="w-full rounded-xl bg-white/10 px-4 py-3 text-base text-white ring-1 ring-white/10 outline-none placeholder:text-white/40 focus:ring-2 focus:ring-emerald-400"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={!ready || saving || name.trim().length === 0}
          className="min-h-12 rounded-xl bg-emerald-400 px-4 font-bold text-black active:scale-[0.98] disabled:opacity-40"
        >
          {saving ? "등록 중…" : error ? "다시 시도" : "도감에 등록"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            setCaptureSession(null);
            router.replace("/capture");
          }}
          className="min-h-11 text-sm text-white/55 underline-offset-4 hover:underline disabled:opacity-40"
        >
          등록하지 않고 계속 잡기
        </button>
      </form>
    </main>
  );
}
