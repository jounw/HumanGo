"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import BallThrower from "@/components/BallThrower";
import CameraView, {
  type CameraError,
  type Facing,
} from "@/components/CameraView";
import CaptureAnimation, {
  type CaptureJob,
} from "@/components/CaptureAnimation";
import { ESCAPE_CHANCE, SEGMENTATION_FPS } from "@/lib/constants";
import { setCaptureSession } from "@/lib/game/session";
import type { CaptureOutcome } from "@/lib/game/captureAnimation";
import { buildScene, extractTarget, grabFrame } from "@/lib/vision/capture";
import { screenToVideo, type Viewport } from "@/lib/vision/geometry";
import { preloadOpenCV } from "@/lib/vision/inpaint";
import { warmFaceDetector } from "@/lib/vision/face";
import { drawPeople } from "@/lib/vision/overlay";
import {
  createLiveSegmenter,
  warmStillSegmenter,
  type LiveSegmenter,
  type Person,
} from "@/lib/vision/segmenter";

const CAMERA_MESSAGES: Record<CameraError, { title: string; body: string }> = {
  unsupported: {
    title: "카메라를 쓸 수 없는 브라우저예요",
    body: "https 주소로 접속했는지 확인하고, 최신 Chrome이나 Safari에서 열어 주세요.",
  },
  denied: {
    title: "카메라 권한이 필요해요",
    body: "주소창 옆 설정에서 카메라를 허용한 뒤 다시 시도해 주세요.",
  },
  failed: {
    title: "카메라를 켜지 못했어요",
    body: "다른 앱이 카메라를 쓰고 있지 않은지 확인하고 다시 시도해 주세요.",
  },
};

export default function CaptureClient() {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const peopleRef = useRef<Person[]>([]);
  const vpRef = useRef<Viewport | null>(null);

  const [facing, setFacing] = useState<Facing>("environment");
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [cameraError, setCameraError] = useState<CameraError | null>(null);
  const [segmenter, setSegmenter] = useState<LiveSegmenter | null>(null);
  const [modelError, setModelError] = useState(false);
  const [ballImg, setBallImg] = useState<HTMLImageElement | null>(null);
  const [job, setJob] = useState<CaptureJob | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // 개발 모드이거나 주소에 ?debug 가 있으면 FPS 표시 (배포본으로 실기기 테스트할 때 사용)
  const debug = useSyncExternalStore(
    () => () => {},
    () =>
      process.env.NODE_ENV !== "production" ||
      new URLSearchParams(window.location.search).has("debug"),
    () => false,
  );
  const jobRef = useRef<{ job: CaptureJob; mirror: boolean } | null>(null);

  const mirror = facing === "user";

  // 무거운 리소스를 화면 진입 시 미리 로딩 (분할 모델, 정지 분할 모델, OpenCV.js, 볼 이미지)
  useEffect(() => {
    let dead = false;
    let seg: LiveSegmenter | null = null;
    createLiveSegmenter()
      .then((s) => {
        if (dead) return s.close();
        seg = s;
        setSegmenter(s);
      })
      .catch((e) => {
        console.error("분할 모델 로딩 실패", e);
        if (!dead) setModelError(true);
      });
    warmStillSegmenter().catch(() => {});
    warmFaceDetector().catch(() => {});
    preloadOpenCV().catch(() => {});
    const img = new Image();
    img.src = "/ball/capture-ball.svg";
    img.onload = () => !dead && setBallImg(img);
    return () => {
      dead = true;
      seg?.close();
    };
  }, []);

  // 화면 크기/비디오 크기가 바뀔 때 좌표 변환 정보와 오버레이 캔버스를 갱신
  const syncViewport = useCallback(() => {
    const wrap = wrapRef.current;
    const overlay = overlayRef.current;
    if (!wrap || !overlay) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    overlay.width = Math.round(wrap.clientWidth * dpr);
    overlay.height = Math.round(wrap.clientHeight * dpr);
    vpRef.current =
      video && video.videoWidth
        ? {
            sw: wrap.clientWidth,
            sh: wrap.clientHeight,
            vw: video.videoWidth,
            vh: video.videoHeight,
            mirror,
          }
        : null;
  }, [video, mirror]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    syncViewport();
    const ro = new ResizeObserver(syncViewport);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [syncViewport]);

  // 실시간 감지 루프 (SEGMENTATION_FPS 로 제한)
  const capturing = job !== null;
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!video || !segmenter || capturing || !overlay) return;
    const ctx = overlay.getContext("2d")!;
    const interval = 1000 / SEGMENTATION_FPS;
    let stopped = false;
    let last = 0;
    let handle = 0;
    let frames = 0;
    let fpsT = performance.now();
    let fps = 0;

    const schedule = () => {
      if ("requestVideoFrameCallback" in video) {
        handle = video.requestVideoFrameCallback(tick);
      } else {
        handle = requestAnimationFrame(tick);
      }
    };
    const tick = () => {
      if (stopped) return;
      const now = performance.now();
      if (now - last >= interval && video.readyState >= 2 && video.videoWidth) {
        last = now;
        if (!vpRef.current) syncViewport();
        try {
          peopleRef.current = segmenter.detect(video);
        } catch (e) {
          console.error("감지 실패", e);
          peopleRef.current = [];
        }
        const vp = vpRef.current;
        const dpr = overlay.width / (vp?.sw || overlay.width);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        if (vp) drawPeople(ctx, peopleRef.current, vp);

        frames++;
        if (now - fpsT >= 1000) {
          fps = (frames * 1000) / (now - fpsT);
          frames = 0;
          fpsT = now;
          if (hudRef.current)
            hudRef.current.textContent = `${fps.toFixed(1)} fps · ${peopleRef.current.length}명 · ${segmenter.delegate} · ${video.videoWidth}x${video.videoHeight}`;
        }
      }
      schedule();
    };
    schedule();
    return () => {
      stopped = true;
      if ("cancelVideoFrameCallback" in video)
        video.cancelVideoFrameCallback(handle);
      else cancelAnimationFrame(handle);
      ctx.clearRect(0, 0, overlay.width, overlay.height);
    };
  }, [video, segmenter, capturing, syncViewport]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  const handleVideo = useCallback((v: HTMLVideoElement | null) => {
    setVideo(v);
    if (v) setCameraError(null);
  }, []);

  // 명중: 그 순간의 프레임을 고정하고 처리를 시작한다 (모든 무거운 처리는 이 한 장에 대해서만)
  const handleHit = useCallback(
    (person: Person, point: { x: number; y: number }, ballR: number) => {
      const vp = vpRef.current;
      if (!video || !vp) return;
      const still = grabFrame(video, vp.mirror);
      const stillVp: Viewport = { ...vp, mirror: false }; // 정지 프레임은 이미 화면 방향으로 반전됨
      const hit = screenToVideo(point.x, point.y, stillVp);

      const target = extractTarget(still, hit, person, vp.mirror);
      const scene = target.then((t) => buildScene(still, t));
      const next: CaptureJob = {
        still,
        target,
        scene,
        viewport: stillVp,
        ballPoint: point,
        ballStartR: ballR,
        escape: Math.random() < ESCAPE_CHANCE,
      };
      jobRef.current = { job: next, mirror: vp.mirror };
      setJob(next);
    },
    [video],
  );

  const handleDone = useCallback(
    async (outcome: CaptureOutcome) => {
      const cur = jobRef.current;
      jobRef.current = null;
      if (!cur) return;
      if (outcome === "caught") {
        const [target, scene] = await Promise.all([
          cur.job.target,
          cur.job.scene,
        ]);
        setCaptureSession({ still: cur.job.still, scene, target });
        router.push("/capture/result");
        return;
      }
      setJob(null);
      flash(
        outcome === "escaped"
          ? "앗, 도망갔어요! 다시 던져 보세요"
          : "처리에 실패했어요. 다시 시도해 주세요",
      );
    },
    [router, flash],
  );

  const err = cameraError ? CAMERA_MESSAGES[cameraError] : null;

  return (
    <div ref={wrapRef} className="fixed inset-0 overflow-hidden bg-black">
      {!err && (
        <CameraView
          facing={facing}
          onVideo={handleVideo}
          onError={setCameraError}
        />
      )}
      <canvas
        ref={overlayRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />

      {video && segmenter && (
        <BallThrower
          disabled={capturing}
          ballImg={ballImg}
          getViewport={() => vpRef.current}
          getPeople={() => peopleRef.current}
          onHit={handleHit}
        />
      )}

      {job && <CaptureAnimation job={job} ball={ballImg} onDone={handleDone} />}

      {/* 상단 바 */}
      <div className="absolute inset-x-0 top-0 z-40 flex items-center justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          href="/"
          aria-label="홈으로"
          className="flex size-11 items-center justify-center rounded-full bg-black/45 text-xl backdrop-blur"
        >
          ‹
        </Link>
        <button
          aria-label="카메라 전환"
          onClick={() =>
            setFacing((f) => (f === "environment" ? "user" : "environment"))
          }
          className="flex size-11 items-center justify-center rounded-full bg-black/45 text-lg backdrop-blur"
        >
          ⟲
        </button>
      </div>

      {/* 안내 */}
      {!err && !capturing && (
        <p className="pointer-events-none absolute inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-10 text-center text-sm font-medium text-white/85 [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">
          {!video || !segmenter
            ? modelError
              ? "모델을 불러오지 못했어요. 새로고침해 주세요"
              : "준비 중…"
            : "볼을 위로 스와이프해서 던지세요"}
        </p>
      )}

      {toast && (
        <div
          role="status"
          className="absolute inset-x-6 top-24 z-40 rounded-2xl bg-black/70 px-4 py-3 text-center text-sm font-semibold backdrop-blur"
        >
          {toast}
        </div>
      )}

      {debug && (
        <div
          ref={hudRef}
          className="pointer-events-none absolute top-[max(4.5rem,calc(env(safe-area-inset-top)+3.75rem))] left-3 z-40 rounded bg-black/60 px-2 py-1 font-mono text-[11px] text-emerald-300"
        >
          debug
        </div>
      )}

      {err && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#0b1020] px-8 text-center">
          <h1 className="text-xl font-bold">{err.title}</h1>
          <p className="text-white/65">{err.body}</p>
          <button
            onClick={() => {
              window.location.reload(); // 권한 재요청은 새로고침이 가장 확실하다
            }}
            className="min-h-12 rounded-xl bg-emerald-400 px-6 font-bold text-black"
          >
            다시 시도
          </button>
          <Link
            href="/"
            className="text-sm text-white/60 underline underline-offset-4"
          >
            홈으로
          </Link>
        </div>
      )}
    </div>
  );
}
