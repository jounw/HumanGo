// 맞은 사람의 컷아웃에서 얼굴(머리카락 포함)을 정사각 PNG 로 따낸다.

import type { FaceDetector } from "@mediapipe/tasks-vision";
import { FACE_SIZE } from "@/lib/constants";
import type { Target } from "./capture";
import {
  alphaToCanvas,
  applyAlpha,
  binarize,
  erode,
  feather,
  newCanvas,
} from "./mask";
import { getFileset, getMp } from "./segmenter";

const FACE_MODEL_URL = "/models/blaze_face_short_range.tflite";

let detectorPromise: Promise<FaceDetector> | null = null;

function getDetector() {
  detectorPromise ??= (async () => {
    const mp = await getMp();
    const fileset = await getFileset();
    const make = (delegate: "GPU" | "CPU") =>
      mp.FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.4,
      });
    try {
      return await make("GPU");
    } catch {
      return await make("CPU");
    }
  })();
  detectorPromise.catch(() => (detectorPromise = null));
  return detectorPromise;
}

export type Square = { cx: number; cy: number; size: number }; // 픽셀

/**
 * 얼굴 박스(눈썹~턱)를 머리카락까지 포함하는 정사각형으로 넓힌다.
 * 위로 38% 만큼 머리카락을 더 넣고, 아래는 턱 + 12% 까지만 잡아 목/어깨를 최소화한다.
 */
export function headSquare(box: {
  x: number;
  y: number;
  w: number;
  h: number;
}): Square {
  const size = Math.max(box.h * 1.5, box.w * 1.55);
  const top = box.y - box.h * 0.38;
  return { cx: box.x + box.w / 2, cy: top + size / 2, size };
}

/** 얼굴을 못 찾았을 때: 사람 마스크 상단 1/5 을 머리로 간주 */
export function fallbackHeadSquare(
  bbox: { x: number; y: number; w: number; h: number }, // 정규화
  imgW: number,
  imgH: number,
): Square {
  const headH = (bbox.h * imgH) / 5;
  const size = headH * 1.2;
  return {
    cx: (bbox.x + bbox.w / 2) * imgW,
    cy: bbox.y * imgH + headH / 2 + size * 0.04,
    size,
  };
}

/** target.mask(마스크 해상도) 에서 정규화 좌표 (nx, ny) 가 사람 위인지 */
function insideMask(target: Target, nx: number, ny: number) {
  const x = Math.min(target.w - 1, Math.max(0, Math.floor(nx * target.w)));
  const y = Math.min(target.h - 1, Math.max(0, Math.floor(ny * target.h)));
  return target.mask[y * target.w + x] > 0.5;
}

export type FaceResult = { face: HTMLCanvasElement; found: boolean };

export async function extractFace(
  still: HTMLCanvasElement,
  target: Target,
): Promise<FaceResult> {
  const W = still.width;
  const H = still.height;
  let square: Square | null = null;

  try {
    // 맞은 사람 영역(여유 포함)만 잘라서 검출 -> 다른 사람의 얼굴이 섞이지 않게 한다
    const pad = 0.08;
    const rx = Math.max(0, Math.floor((target.bbox.x - pad) * W));
    const ry = Math.max(0, Math.floor((target.bbox.y - pad) * H));
    const rw = Math.min(W - rx, Math.ceil((target.bbox.w + pad * 2) * W));
    const rh = Math.min(H - ry, Math.ceil((target.bbox.h + pad * 2) * H));
    const region = newCanvas(rw, rh);
    region.getContext("2d")!.drawImage(still, rx, ry, rw, rh, 0, 0, rw, rh);

    const detector = await getDetector();
    const { detections } = detector.detect(region);
    let best: {
      score: number;
      box: { x: number; y: number; w: number; h: number };
    } | null = null;
    for (const d of detections) {
      const b = d.boundingBox;
      if (!b) continue;
      const box = {
        x: b.originX + rx,
        y: b.originY + ry,
        w: b.width,
        h: b.height,
      };
      // 얼굴 중심이 맞은 사람의 마스크 위에 있어야 한다
      if (!insideMask(target, (box.x + box.w / 2) / W, (box.y + box.h / 2) / H))
        continue;
      const score = d.categories[0]?.score ?? 0;
      if (!best || score > best.score) best = { score, box };
    }
    if (best) {
      square = headSquare(best.box);
    }
  } catch (e) {
    console.warn("얼굴 검출 실패, 머리 위치 추정으로 대체", e);
  }

  const found = square !== null;
  const sq = square ?? fallbackHeadSquare(target.bbox, W, H);
  // 얼굴용 컷아웃: 포즈 마스크는 머리카락 주변 배경을 약간 포함하므로 살짝 깎아서 어두운 테두리를 없앤다
  const r = Math.max(2, Math.round((target.w / still.width) * 4));
  const eroded = erode(binarize(target.mask), target.w, target.h, r);
  const faceCutout = applyAlpha(
    still,
    alphaToCanvas(feather(eroded, target.w, target.h, 2), target.w, target.h),
  );
  return { face: cropFace(faceCutout, sq), found };
}

/** 컷아웃(투명 배경 사람)에서 square 영역을 FACE_SIZE 로 잘라 타원형으로 부드럽게 마감 */
export function cropFace(
  cutout: HTMLCanvasElement,
  sq: Square,
): HTMLCanvasElement {
  const out = newCanvas(FACE_SIZE, FACE_SIZE);
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  // 소스가 이미지 밖으로 나가는 부분은 투명으로 남도록 교차 영역만 그린다
  const sx0 = sq.cx - sq.size / 2;
  const sy0 = sq.cy - sq.size / 2;
  const ix0 = Math.max(0, sx0);
  const iy0 = Math.max(0, sy0);
  const ix1 = Math.min(cutout.width, sx0 + sq.size);
  const iy1 = Math.min(cutout.height, sy0 + sq.size);
  if (ix1 > ix0 && iy1 > iy0) {
    const k = FACE_SIZE / sq.size;
    ctx.drawImage(
      cutout,
      ix0,
      iy0,
      ix1 - ix0,
      iy1 - iy0,
      (ix0 - sx0) * k,
      (iy0 - sy0) * k,
      (ix1 - ix0) * k,
      (iy1 - iy0) * k,
    );
  }

  // 원형 페더링: 턱(약 92%)까지는 불투명, 모서리의 어깨는 투명하게
  ctx.globalCompositeOperation = "destination-in";
  const cx = FACE_SIZE / 2;
  const cy = FACE_SIZE * 0.5;
  const g = ctx.createRadialGradient(
    cx,
    cy,
    FACE_SIZE * 0.44,
    cx,
    cy,
    FACE_SIZE * 0.5,
  );
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FACE_SIZE, FACE_SIZE);
  return out;
}

/** 얼굴 검출 모델을 미리 로딩해 둔다 (결과 화면 진입 지연 방지) */
export function warmFaceDetector() {
  return getDetector().then(() => undefined);
}
