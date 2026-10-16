"use client";

import { useEffect, useState } from "react";
import Chibi3D from "@/components/Chibi3D";
import { BODIES } from "@/lib/game/chibi";
import { cropFace, headSquare } from "@/lib/vision/face";

export default function Gallery() {
  const [face, setFace] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = "/dev-test/people.jpg";
    img.decode().then(() => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d")!.drawImage(img, 0, 0);
      // 테스트 사진 속 한 사람의 얼굴 박스(픽셀)
      setFace(cropFace(c, headSquare({ x: 242, y: 253, w: 96, h: 96 })));
    });
  }, []);

  return (
    <main className="grid grid-cols-3 gap-2 p-3">
      {BODIES.map((b) => (
        <div key={b.id} className="rounded-2xl bg-white/5 p-2">
          <Chibi3D face={face} bodyId={b.id} className="aspect-square w-full" />
          <p className="text-center text-sm">{b.name}</p>
        </div>
      ))}
    </main>
  );
}
