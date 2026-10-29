// 맞은 사람의 표정이 얼마나 "이상한지" 0~1 로 매긴다. 이상할수록 볼에서 탈출할 확률이 높아진다.

import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { ESCAPE_BASE, ESCAPE_MAX } from "@/lib/constants";
import { getFileset, getMp } from "./segmenter";

const LANDMARKER_URL = "/models/face_landmarker.task";
// 표정 모델 비활성화: 모델 파일을 불러오지 않고 항상 보통 표정(0)으로 본다. 다시 켜려면 true 로 바꾸고 모델 파일을 public/models 에 둔다.
const ENABLED = false;
const NOISE_FLOOR = 0.12; // 무표정/보통 미소에서 새는 잡음은 무시

type Shapes = Record<string, number>;

const avg = (s: Shapes, a: string, b: string) =>
  ((s[a] ?? 0) + (s[b] ?? 0)) / 2;
const asym = (s: Shapes, a: string, b: string) =>
  Math.abs((s[a] ?? 0) - (s[b] ?? 0));

/**
 * 블렌드셰이프(이름 -> 0~1)로 표정의 이상함을 계산한다. 순수 함수.
 * 혀 내밀기, 볼 부풀리기, 윙크, 사시, 입 오므리기/벌리기, 눈 크게 뜨기 같은 과장된 표정이 점수를 올린다.
 */
export function weirdness(s: Shapes): number {
  const wink = Math.max(
    0,
    asym(s, "eyeBlinkLeft", "eyeBlinkRight") -
      0.15 * (1 - Math.min(s.eyeBlinkLeft ?? 0, s.eyeBlinkRight ?? 0)),
  );
  const raw =
    1.2 * (s.tongueOut ?? 0) +
    1.0 * (s.cheekPuff ?? 0) +
    0.9 * wink +
    0.8 * avg(s, "eyeLookInLeft", "eyeLookInRight") + // 사시
    0.8 * (s.mouthFunnel ?? 0) +
    0.7 * (s.mouthPucker ?? 0) +
    0.6 * (s.jawOpen ?? 0) +
    0.5 * avg(s, "eyeWideLeft", "eyeWideRight") +
    0.5 * avg(s, "mouthStretchLeft", "mouthStretchRight") +
    0.4 * (s.browInnerUp ?? 0) +
    0.4 * (s.mouthShrugLower ?? 0) +
    0.4 * asym(s, "mouthSmileLeft", "mouthSmileRight") + // 삐딱한 웃음
    0.3 * avg(s, "browDownLeft", "browDownRight");
  return Math.min(1, Math.max(0, (raw - NOISE_FLOOR) / (1 - NOISE_FLOOR)));
}

/** 이상한 정도(0~1) -> 탈출 확률 */
export function escapeChance(weird: number): number {
  return (
    ESCAPE_BASE + (ESCAPE_MAX - ESCAPE_BASE) * Math.min(1, Math.max(0, weird))
  );
}

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

function getLandmarker() {
  landmarkerPromise ??= (async () => {
    const mp = await getMp();
    const fileset = await getFileset();
    const make = (delegate: "GPU" | "CPU") =>
      mp.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: LANDMARKER_URL, delegate },
        runningMode: "IMAGE",
        numFaces: 1,
        outputFaceBlendshapes: true,
      });
    try {
      return await make("GPU");
    } catch {
      return await make("CPU");
    }
  })();
  landmarkerPromise.catch(() => (landmarkerPromise = null));
  return landmarkerPromise;
}

/** 표정 모델을 미리 로딩해 둔다 (명중 직후 지연 방지) */
export function warmExpression() {
  if (!ENABLED) return Promise.resolve();
  return getLandmarker().then(() => undefined);
}

/**
 * 정지 프레임에서 사람 영역(정규화 박스)만 잘라 표정을 분석한다.
 * 얼굴을 못 찾거나 실패하면 0 (보통 표정) 으로 본다.
 */
export async function expressionWeirdness(
  still: HTMLCanvasElement,
  bbox: { x: number; y: number; w: number; h: number },
): Promise<number> {
  if (!ENABLED) return 0;
  try {
    const W = still.width;
    const H = still.height;
    const pad = 0.05;
    const rx = Math.max(0, Math.floor((bbox.x - pad) * W));
    const ry = Math.max(0, Math.floor((bbox.y - pad) * H));
    const rw = Math.min(W - rx, Math.ceil((bbox.w + pad * 2) * W));
    const rh = Math.min(H - ry, Math.ceil((bbox.h + pad * 2) * H));
    const region = document.createElement("canvas");
    region.width = rw;
    region.height = rh;
    region.getContext("2d")!.drawImage(still, rx, ry, rw, rh, 0, 0, rw, rh);

    const lm = await getLandmarker();
    const cats = lm.detect(region).faceBlendshapes[0]?.categories;
    if (!cats) return 0;
    const shapes: Shapes = {};
    for (const c of cats) shapes[c.categoryName] = c.score;
    return weirdness(shapes);
  } catch (e) {
    console.warn("표정 분석 실패, 보통 표정으로 처리", e);
    return 0;
  }
}
