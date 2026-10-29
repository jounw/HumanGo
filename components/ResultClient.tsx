"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import RarityBurst from "@/components/RarityBurst";
import { isAiRarity } from "@/lib/game/aiPrompt";
import { upgradeCharacter } from "@/lib/game/aiUpgrade";
import { bodyForRarity, composeChibi } from "@/lib/game/chibi";
import { hashSeed } from "@/lib/game/seed";
import { RARITY_LABEL, RARITY_STYLE } from "@/lib/game/rarity";
import { pickRarity } from "@/lib/demo/rarityOverride";
import { getCaptureSession, setCaptureSession } from "@/lib/game/session";
import { DEMO } from "@/lib/demo/store";
import { demoRegister, registerCapture } from "@/lib/game/upload";
import { CAPTURE_NAME_MAX, type Rarity } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { extractFace } from "@/lib/vision/face";

const noopSubscribe = () => () => {};

function ResultBody({
  rarity,
  captureId,
}: {
  rarity: Rarity;
  captureId: string;
}) {
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
  const [character, setCharacter] = useState<HTMLCanvasElement | null>(null);
  // 전설/신화는 이미지 생성 AI 가 다시 그린다. 실패하면 기본 몸통 합성 결과를 그대로 쓴다.
  const body = bodyForRarity(rarity, hashSeed(captureId)); // 같은 등급 안에서도 id 마다 다른 몸통
  const useAi = isAiRarity(rarity);
  const [aiResult, setAiResult] = useState<HTMLCanvasElement | null>(null);
  const [aiStatus, setAiStatus] = useState<"working" | "done" | "failed">(
    "working",
  );
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

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

  // 등급에 정해진 몸통에 얼굴을 합성 (몸통은 고를 수 없다)
  useEffect(() => {
    if (!face) return;
    let dead = false;
    composeChibi(face, body).then((c) => !dead && setCharacter(c));
    return () => {
      dead = true;
    };
  }, [face, body]);

  // 전설/신화: 얼굴 크롭을 AI 로 보내 더 멋진 모습으로 다시 그린다
  useEffect(() => {
    if (!face || !isAiRarity(rarity)) return;
    const ctrl = new AbortController();
    upgradeCharacter(face, rarity, captureId, ctrl.signal).then((c) => {
      if (ctrl.signal.aborted) return;
      setAiResult(c);
      setAiStatus(c ? "done" : "failed");
    });
    return () => ctrl.abort();
  }, [face, rarity, captureId]);

  const shown = aiResult ?? character;

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !shown) return;
    canvas.width = shown.width;
    canvas.height = shown.height;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(shown, 0, 0);
  }, [shown]);

  async function register() {
    if (!session || !face || !shown || saving || aiBusy) return;
    setSaving(true);
    setError(null);
    try {
      const id = await (
        DEMO
          ? demoRegister
          : (i: Parameters<typeof registerCapture>[1]) =>
              registerCapture(createClient(), i)
      )({
        id: captureId,
        name,
        bodyId: body.id,
        rarity,
        character: shown,
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
  const ready = !!shown;
  const aiBusy = useAi && aiStatus === "working";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 py-6">
      <header className="text-center">
        <p className="text-sm font-semibold text-emerald-300">잡았다!</p>
        <h1 className="text-2xl font-black">새 친구가 도감에 들어와요</h1>
      </header>

      <section
        aria-label="캐릭터 미리보기"
        className={`relative mx-auto w-full max-w-xs rounded-3xl bg-white/5 p-4 ${style.ring} ${style.glow}`}
      >
        <span
          className={`absolute top-3 left-3 rounded-full px-2.5 py-1 text-xs font-bold ${style.badge}`}
        >
          {RARITY_LABEL[rarity]}
        </span>
        <RarityBurst rarity={rarity} active={ready} />
        <canvas
          ref={previewRef}
          className={`aspect-square w-full transition-opacity ${ready ? "opacity-100" : "opacity-0"}`}
        />
        {!ready && (
          <div className="absolute inset-0 grid place-items-center text-sm text-white/60">
            {faceError ? "캐릭터를 만들지 못했어요" : "캐릭터 만드는 중…"}
          </div>
        )}
      </section>

      {useAi && (
        <p
          role="status"
          className="rounded-xl bg-white/5 px-4 py-3 text-center text-sm text-white/70"
        >
          {aiStatus === "working" &&
            `${RARITY_LABEL[rarity]} 등급의 모습으로 변신 중… (최대 1~2분)`}
          {aiStatus === "done" &&
            `${RARITY_LABEL[rarity]} 등급의 모습으로 변신했어요!`}
          {aiStatus === "failed" &&
            "AI 변신에 실패해서 기본 모습으로 등록해요."}
        </p>
      )}


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
          disabled={!ready || aiBusy || saving || name.trim().length === 0}
          className="min-h-12 rounded-xl bg-emerald-400 px-4 font-bold text-black active:scale-[0.98] disabled:opacity-40"
        >
          {saving
            ? "등록 중…"
            : aiBusy
              ? "변신 중…"
              : error
                ? "다시 시도"
                : "도감에 등록"}
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

type Roll = { id: string; rarity: Rarity };

/** 등급 뽑기: 일반 모드는 서버가 뽑고(조작 방지), 데모는 이 브라우저에서 뽑는다. */
async function fetchRoll(): Promise<Roll> {
  if (DEMO) return { id: crypto.randomUUID(), rarity: pickRarity(true) };
  const res = await fetch("/api/roll", { method: "POST" });
  const body = (await res.json().catch(() => ({}))) as {
    id?: string;
    rarity?: Rarity;
    error?: string;
  };
  if (!res.ok || !body.id || !body.rarity)
    throw new Error(body.error ?? "등급을 정하지 못했어요.");
  return { id: body.id, rarity: body.rarity };
}

export default function ResultClient() {
  const router = useRouter();
  const session = useSyncExternalStore(
    noopSubscribe,
    getCaptureSession,
    () => null,
  );
  const [roll, setRoll] = useState<Roll | null>(null);
  const [rollError, setRollError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const hasSession = !!session;

  // 세션이 있을 때만(= 방금 잡았을 때만) 등급을 뽑는다. 새로고침으로 다시 뽑을 수 없다.
  useEffect(() => {
    if (!hasSession) {
      router.replace("/capture");
      return;
    }
    let dead = false;
    fetchRoll()
      .then((r) => !dead && setRoll(r))
      .catch(
        (e) =>
          !dead &&
          setRollError(
            e instanceof Error ? e.message : "등급을 정하지 못했어요.",
          ),
      );
    return () => {
      dead = true;
    };
  }, [hasSession, attempt, router]);

  if (rollError) {
    return (
      <main className="grid min-h-dvh place-items-center px-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-lg font-semibold">{rollError}</p>
          <button
            onClick={() => {
              setRollError(null);
              setAttempt((n) => n + 1);
            }}
            className="min-h-12 rounded-xl bg-emerald-400 px-6 font-bold text-black"
          >
            다시 시도
          </button>
          <button
            onClick={() => {
              setCaptureSession(null);
              router.replace("/capture");
            }}
            className="min-h-11 text-sm text-white/55"
          >
            등록하지 않고 계속 잡기
          </button>
        </div>
      </main>
    );
  }
  if (!roll) {
    return (
      <main className="grid min-h-dvh place-items-center text-white/60">
        {hasSession ? "등급을 정하는 중…" : "불러오는 중…"}
      </main>
    );
  }
  return <ResultBody key={roll.id} rarity={roll.rarity} captureId={roll.id} />;
}
