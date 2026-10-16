// 얼굴 + 몸통 템플릿 -> 치비 캐릭터 (512x512 투명 PNG 용 캔버스)

import { CHARACTER_SIZE } from "@/lib/constants";
import { newCanvas } from "@/lib/vision/mask";
import bodiesJson from "./bodies.json";

export type BodyTemplate = {
  id: string;
  name: string;
  file: string;
  headCenter: { x: number; y: number }; // 512 기준
  headSize: number;
};

export const BODIES = bodiesJson as BodyTemplate[];

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadBody(t: BodyTemplate): Promise<HTMLImageElement> {
  let p = imageCache.get(t.file);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`몸통 이미지 로딩 실패: ${t.file}`));
      img.src = t.file;
    });
    imageCache.set(t.file, p);
    p.catch(() => imageCache.delete(t.file));
  }
  return p;
}

/** 윤곽(알파)을 흰색으로 칠하고 radius 만큼 사방으로 번지게 그려 스티커 테두리를 만든다. */
function stickerOutline(
  src: HTMLCanvasElement,
  radius: number,
): HTMLCanvasElement {
  const white = newCanvas(src.width, src.height);
  const wctx = white.getContext("2d")!;
  wctx.drawImage(src, 0, 0);
  wctx.globalCompositeOperation = "source-in";
  wctx.fillStyle = "#fff";
  wctx.fillRect(0, 0, white.width, white.height);

  const out = newCanvas(src.width, src.height);
  const ctx = out.getContext("2d")!;
  const steps = 24;
  for (let ring = 1; ring <= 2; ring++) {
    const r = (radius * ring) / 2;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      ctx.drawImage(white, Math.cos(a) * r, Math.sin(a) * r);
    }
  }
  return out;
}

export async function composeChibi(
  face: HTMLCanvasElement,
  template: BodyTemplate,
): Promise<HTMLCanvasElement> {
  const body = await loadBody(template);
  const S = CHARACTER_SIZE;
  const k = S / 512;

  // 1) 몸통 + 얼굴 (얼굴 아래 살짝 그림자)
  const base = newCanvas(S, S);
  const bctx = base.getContext("2d")!;
  bctx.drawImage(body, 0, 0, S, S);
  const hs = template.headSize * k;
  const hx = template.headCenter.x * k - hs / 2;
  const hy = template.headCenter.y * k - hs / 2;
  bctx.save();
  bctx.shadowColor = "rgba(30,20,50,0.35)";
  bctx.shadowBlur = 14 * k;
  bctx.shadowOffsetY = 6 * k;
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(face, hx, hy, hs, hs);
  bctx.restore();

  // 2) 흰색 스티커 테두리 + 얇은 외곽 그림자
  const outline = stickerOutline(base, 10 * k);
  const out = newCanvas(S, S);
  const ctx = out.getContext("2d")!;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 8 * k;
  ctx.shadowOffsetY = 3 * k;
  ctx.drawImage(outline, 0, 0);
  ctx.restore();
  ctx.drawImage(base, 0, 0);
  return out;
}
