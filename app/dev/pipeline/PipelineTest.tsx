"use client";

import { useEffect, useRef, useState } from "react";
import { BODIES, composeChibi } from "@/lib/game/chibi";
import { buildScene, extractTarget } from "@/lib/vision/capture";
import { extractFace } from "@/lib/vision/face";
import { preloadOpenCV } from "@/lib/vision/inpaint";
import {
  createLiveSegmenter,
  segmentStill,
  type Person,
} from "@/lib/vision/segmenter";

export default function PipelineTest() {
  const [log, setLog] = useState<string[]>([]);
  const cutoutRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const chibiRef = useRef<HTMLDivElement>(null);
  const add = (m: string) => setLog((l) => [...l, m]);

  useEffect(() => {
    (globalThis as { __cpu?: boolean }).__cpu = new URLSearchParams(
      location.search,
    ).has("cpu");
    (async () => {
      try {
        const img = new Image();
        img.src = "/dev-test/people.jpg";
        await img.decode();
        const still = document.createElement("canvas");
        still.width = img.naturalWidth;
        still.height = img.naturalHeight;
        still.getContext("2d")!.drawImage(img, 0, 0);
        add(`still ${still.width}x${still.height}`);

        // 실시간 감지 벤치마크: 정지 이미지를 40번 감지
        const liveSeg = await createLiveSegmenter();
        let n = 0;
        const lt = performance.now();
        for (let i = 0; i < 40; i++) {
          n = liveSeg.detect(img).length;
          await new Promise((r) => setTimeout(r, 0));
        }
        const per = (performance.now() - lt) / 40;
        add(
          `liveSeg(${liveSeg.delegate}) ${per.toFixed(1)}ms/frame (~${(1000 / per).toFixed(0)}fps) → ${n}명, 마지막 delegate=${liveSeg.delegate}`,
        );
        liveSeg.close();

        let t = performance.now();
        await preloadOpenCV();
        add(`opencv ready ${Math.round(performance.now() - t)}ms`);

        t = performance.now();
        const people = await segmentStill(still);
        add(
          `segmentStill(첫 호출, 모델 로딩 포함) ${Math.round(performance.now() - t)}ms → ${people.length}명`,
        );
        t = performance.now();
        await segmentStill(still);
        add(`segmentStill(재호출) ${Math.round(performance.now() - t)}ms`);
        people.forEach((p, i) =>
          add(
            `  #${i} mask ${p.w}x${p.h} bbox ${[p.bbox.x, p.bbox.y, p.bbox.w, p.bbox.h].map((v) => v.toFixed(2)).join(",")}`,
          ),
        );
        if (!people.length) return add("사람을 못 찾음");

        // 감지된 사람 중 하나(#1)를 맞힌 것으로 가정: 박스 중심이 명중 지점
        const pick =
          people[Number(new URLSearchParams(location.search).get("p") ?? 1)] ??
          people[0];
        const hit = {
          x: pick.bbox.x + pick.bbox.w / 2,
          y: pick.bbox.y + pick.bbox.h * 0.45,
        };
        const live: Person = {
          mask: new Uint8Array(1),
          gw: 1,
          gh: 1,
          bbox: pick.bbox,
        };
        t = performance.now();
        const target = await extractTarget(still, hit, live, false);
        add(
          `extractTarget ${Math.round(performance.now() - t)}ms (bbox ${[target.bbox.x, target.bbox.y, target.bbox.w, target.bbox.h].map((v) => v.toFixed(2)).join(",")})`,
        );
        t = performance.now();
        const scene = await buildScene(still, target);
        add(`buildScene ${Math.round(performance.now() - t)}ms`);

        for (const [c, el] of [
          [target.cutout, cutoutRef.current],
          [scene, sceneRef.current],
        ] as const) {
          c.style.width = "100%";
          c.style.height = "auto";
          el?.appendChild(c);
        }
        t = performance.now();
        const { face, found } = await extractFace(still, target);
        add(
          `extractFace ${Math.round(performance.now() - t)}ms found=${found}`,
        );
        face.style.width = "256px";
        face.style.background = "#2a2f4a";
        chibiRef.current?.appendChild(face);
        t = performance.now();
        for (const body of BODIES) {
          const c = await composeChibi(face, body);
          c.style.width = "160px";
          c.style.background = "#2a2f4a";
          chibiRef.current?.appendChild(c);
        }
        add(
          `composeChibi x${BODIES.length} ${Math.round(performance.now() - t)}ms`,
        );
        add("DONE");
      } catch (e) {
        add("ERROR " + (e instanceof Error ? e.stack : String(e)));
      }
    })();
  }, []);

  return (
    <main className="space-y-4 p-4">
      <pre id="log" className="text-xs whitespace-pre-wrap">
        {log.join("\n")}
      </pre>
      <div ref={chibiRef} className="flex flex-wrap gap-2" />
      <div className="grid grid-cols-2 gap-2">
        <div
          ref={cutoutRef}
          className="bg-[repeating-conic-gradient(#444_0_25%,#222_0_50%)] bg-[length:20px_20px]"
        />
        <div ref={sceneRef} />
      </div>
    </main>
  );
}
