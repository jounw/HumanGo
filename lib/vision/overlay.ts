import type { Person } from "./segmenter";
import { videoRectOnScreen, type Viewport } from "./geometry";

const COLORS = ["#5eead4", "#fde047", "#f9a8d4"];

// 격자 해상도 오프스크린 캔버스를 재사용
let edgeCanvas: HTMLCanvasElement | null = null;

function edgeImage(p: Person, rgb: [number, number, number]) {
  if (!edgeCanvas) edgeCanvas = document.createElement("canvas");
  edgeCanvas.width = p.gw;
  edgeCanvas.height = p.gh;
  const ctx = edgeCanvas.getContext("2d")!;
  const img = ctx.createImageData(p.gw, p.gh);
  const d = img.data;
  const { mask, gw, gh } = p;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      if (!mask[i]) continue;
      const edge =
        x === 0 ||
        y === 0 ||
        x === gw - 1 ||
        y === gh - 1 ||
        !mask[i - 1] ||
        !mask[i + 1] ||
        !mask[i - gw] ||
        !mask[i + gw];
      const o = i * 4;
      d[o] = rgb[0];
      d[o + 1] = rgb[1];
      d[o + 2] = rgb[2];
      d[o + 3] = edge ? 255 : 38; // 내부는 옅게, 외곽선은 진하게
    }
  }
  ctx.putImageData(img, 0, 0);
  return edgeCanvas;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function drawPeople(
  ctx: CanvasRenderingContext2D,
  people: Person[],
  vp: Viewport,
) {
  const rect = videoRectOnScreen(vp);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  people.forEach((p, i) => {
    const color = COLORS[i % COLORS.length];
    const img = edgeImage(p, hexToRgb(color));
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    if (vp.mirror) {
      ctx.save();
      ctx.translate(rect.x + rect.w, rect.y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, rect.w, rect.h);
      ctx.restore();
    } else {
      ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
    }
  });
  ctx.restore();
}
