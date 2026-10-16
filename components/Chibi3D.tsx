"use client";

import { useEffect, useRef } from "react";
import type { Chibi3D as Api } from "@/lib/game/chibi3d";

type Props = {
  /** 얼굴 PNG. 캔버스(결과 화면) 또는 이미지 주소(도감 상세) */
  face: HTMLCanvasElement | string | null;
  bodyId: string;
  className?: string;
  /** WebGL 을 못 쓰거나 이미지를 못 불러왔을 때 (부모가 2D 로 되돌린다) */
  onUnavailable?: () => void;
};

/** 주소의 이미지를 캔버스로 옮긴다. 텍스처로 쓰려면 CORS 허용 이미지여야 한다. */
function loadFaceCanvas(src: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d")!.drawImage(img, 0, 0);
      resolve(c);
    };
    img.onerror = () => reject(new Error("얼굴 이미지를 불러오지 못했어요"));
    img.src = src;
  });
}

export default function Chibi3D({
  face,
  bodyId,
  className,
  onUnavailable,
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const latest = useRef({ bodyId, face: null as HTMLCanvasElement | null });
  const failRef = useRef(onUnavailable);
  useEffect(() => {
    failRef.current = onUnavailable;
  });

  // 장면은 한 번만 만든다
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let dead = false;
    let api: Api | null = null;
    import("@/lib/game/chibi3d")
      .then((m) => m.createChibi3D(box))
      .then((a) => {
        if (dead) return a.dispose();
        api = a;
        apiRef.current = a;
        a.setBody(latest.current.bodyId);
        if (latest.current.face) a.setFace(latest.current.face);
      })
      .catch((e) => {
        console.warn("3D 를 시작하지 못했어요", e);
        if (!dead) failRef.current?.();
      });
    return () => {
      dead = true;
      apiRef.current = null;
      api?.dispose();
    };
  }, []);

  useEffect(() => {
    latest.current.bodyId = bodyId;
    apiRef.current?.setBody(bodyId);
  }, [bodyId]);

  useEffect(() => {
    let dead = false;
    const apply = (c: HTMLCanvasElement) => {
      if (dead) return;
      latest.current.face = c;
      apiRef.current?.setFace(c);
    };
    if (!face) return;
    if (typeof face === "string") {
      loadFaceCanvas(face)
        .then(apply)
        .catch((e) => {
          console.warn(e);
          if (!dead) failRef.current?.();
        });
    } else {
      apply(face);
    }
    return () => {
      dead = true;
    };
  }, [face]);

  return (
    <div
      ref={boxRef}
      className={className}
      role="img"
      aria-label="3D 캐릭터. 드래그해서 돌려볼 수 있어요"
    />
  );
}
