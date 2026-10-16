"use client";

import { useEffect, useRef, useState } from "react";
import { CAMERA_HEIGHT, CAMERA_WIDTH } from "@/lib/constants";

export type Facing = "environment" | "user";
export type CameraError = "unsupported" | "denied" | "failed";

type Props = {
  facing: Facing;
  onVideo: (video: HTMLVideoElement | null) => void;
  onError: (e: CameraError) => void;
};

// 카메라 스트림을 <video> 에 연결한다. 전면 카메라는 거울처럼 좌우 반전해서 보여준다.
export default function CameraView({ facing, onVideo, onError }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    setReady(false);
    onVideo(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      onError("unsupported");
      return;
    }

    const open = async () => {
      if (
        process.env.NODE_ENV !== "production" &&
        new URLSearchParams(window.location.search).has("fake")
      ) {
        return (await import("@/lib/dev/fakeCamera")).fakeStream();
      }
      return navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: CAMERA_WIDTH },
          height: { ideal: CAMERA_HEIGHT },
        },
        audio: false,
      });
    };

    open()
      .then(async (s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        video.srcObject = s;
        await video.play();
        if (cancelled) return;
        setReady(true);
        onVideo(video);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const name = (e as { name?: string })?.name;
        onError(
          name === "NotAllowedError" || name === "SecurityError"
            ? "denied"
            : "failed",
        );
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };
    // onVideo/onError 는 안정적인 콜백으로 전달된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  return (
    <video
      ref={ref}
      playsInline
      muted
      autoPlay
      className={`absolute inset-0 h-full w-full object-cover transition-opacity ${
        ready ? "opacity-100" : "opacity-0"
      } ${facing === "user" ? "-scale-x-100" : ""}`}
    />
  );
}
