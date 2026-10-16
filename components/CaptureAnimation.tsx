"use client";

import { useEffect, useRef } from "react";
import { playCapture, type CaptureOutcome } from "@/lib/game/captureAnimation";
import type { Target } from "@/lib/vision/capture";
import type { Viewport } from "@/lib/vision/geometry";

export type CaptureJob = {
  still: HTMLCanvasElement;
  target: Promise<Target>;
  scene: Promise<HTMLCanvasElement>;
  viewport: Viewport; // 정지 프레임 기준 (mirror=false)
  ballPoint: { x: number; y: number };
  ballStartR: number;
  escape: boolean;
};

type Props = {
  job: CaptureJob;
  ball: HTMLImageElement | null;
  onDone: (outcome: CaptureOutcome) => void;
};

export default function CaptureAnimation({ job, ball, onDone }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    const canvas = ref.current!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    let cancelled = false;
    playCapture({
      canvas,
      dpr,
      viewport: job.viewport,
      still: job.still,
      target: job.target,
      scene: job.scene,
      ball,
      ballPoint: job.ballPoint,
      ballStartR: job.ballStartR,
      escape: job.escape,
      isCancelled: () => cancelled,
    }).then((outcome) => {
      if (!cancelled) doneRef.current(outcome);
    });
    return () => {
      cancelled = true;
    };
    // job 은 한 번의 포획마다 새로 만들어지므로 마운트 시 한 번만 실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={ref} className="absolute inset-0 z-30 h-full w-full" />;
}
