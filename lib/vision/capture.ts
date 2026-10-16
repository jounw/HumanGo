// 명중 순간의 정지 프레임 한 장으로 하는 모든 이미지 처리:
// 맞은 사람 찾기 -> 윤곽 잘라내기(cutout) -> 배경 채우기(scene)

import {
  INPAINT_DILATE_PX,
  INPAINT_WIDTH,
  MASK_DILATE_PX,
  MASK_FEATHER_PX,
} from "@/lib/constants";
import { inpaintImage } from "./inpaint";
import {
  alphaToCanvas,
  applyAlpha,
  binarize,
  dilate,
  feather,
  newCanvas,
} from "./mask";
import {
  pickHitPerson,
  segmentStill,
  type Box,
  type Person,
  type StillPerson,
} from "./segmenter";

/** 현재 비디오 프레임을 풀해상도 캔버스로 복사한다. 전면 카메라는 화면에 보이는 대로 좌우 반전. */
export function grabFrame(
  video: HTMLVideoElement,
  mirror: boolean,
): HTMLCanvasElement {
  const c = newCanvas(video.videoWidth, video.videoHeight);
  const ctx = c.getContext("2d")!;
  if (mirror) {
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0);
  return c;
}

export type Target = {
  /** 마스크가 계산된 해상도 */
  w: number;
  h: number;
  /** 맞은 사람의 원본 확률 마스크 */
  mask: Float32Array;
  bbox: Box;
  /** 컷아웃용: 팽창 + 페더링된 알파 캔버스 (마스크 해상도) */
  softAlpha: HTMLCanvasElement;
  /** 배경 지우기용: 더 크게 팽창된 이진 마스크 (0/1) */
  sceneMask: Uint8Array;
  /** 배경 지우기용: 더 크게 팽창 + 페더링된 알파 캔버스 */
  sceneAlpha: HTMLCanvasElement;
  /** 투명 배경 PNG 용 사람 컷아웃 (정지 프레임 해상도) */
  cutout: HTMLCanvasElement;
};

/** 실시간 감지 결과(비디오 좌표)를 정지 프레임 좌표로. 전면 카메라는 정지 프레임이 좌우 반전되어 있다. */
function liveToStill(p: Person, mirror: boolean): StillPerson {
  const { gw, gh } = p;
  const mask = new Float32Array(p.mask.length);
  for (let y = 0; y < gh; y++)
    for (let x = 0; x < gw; x++)
      mask[y * gw + x] = p.mask[y * gw + (mirror ? gw - 1 - x : x)];
  return { mask, w: gw, h: gh, bbox: mirrorBox(p.bbox, mirror) };
}

export function mirrorBox(b: Box, mirror: boolean): Box {
  return mirror ? { ...b, x: 1 - b.x - b.w } : b;
}

/**
 * 정지 프레임에서 맞은 사람을 찾아 컷아웃을 만든다.
 * @param hit 명중 지점 (정지 프레임 정규화 좌표)
 * @param live 명중 판정에 쓰인 실시간 감지 결과 (정지 프레임 재감지가 실패했을 때의 대체 마스크)
 * @param mirror 정지 프레임이 좌우 반전되어 있는지 (전면 카메라)
 */
export async function extractTarget(
  still: HTMLCanvasElement,
  hit: { x: number; y: number },
  live: Person,
  mirror: boolean,
): Promise<Target> {
  let person: StillPerson | null = null;
  try {
    person = pickHitPerson(
      await segmentStill(still),
      hit,
      mirrorBox(live.bbox, mirror),
    );
  } catch (e) {
    console.warn("정지 프레임 분할 실패, 실시간 마스크로 대체", e);
  }
  person ??= liveToStill(live, mirror);

  const { w, h } = person;
  // 마스크 해상도가 낮을수록 같은 화면 크기에서 반경이 커져야 하므로 해상도에 비례시킨다
  const k = w / still.width;
  const dilateR = Math.max(1, Math.round(MASK_DILATE_PX * k));
  const featherR = Math.max(1, Math.round(MASK_FEATHER_PX * k));

  const binary = binarize(person.mask);
  const dilated = dilate(binary, w, h, dilateR);
  const softAlpha = alphaToCanvas(feather(dilated, w, h, featherR), w, h);
  const cutout = applyAlpha(still, softAlpha);

  const sceneMask = dilate(
    binary,
    w,
    h,
    Math.max(2, Math.round(INPAINT_DILATE_PX * k)),
  );
  const sceneAlpha = alphaToCanvas(
    feather(sceneMask, w, h, featherR * 2),
    w,
    h,
  );
  return {
    w,
    h,
    mask: person.mask,
    bbox: person.bbox,
    softAlpha,
    cutout,
    sceneMask,
    sceneAlpha,
  };
}

/** 맞은 사람이 지워지고 배경으로 채워진 장면을 만든다. 정지 프레임과 같은 크기. */
export async function buildScene(
  still: HTMLCanvasElement,
  target: Target,
): Promise<HTMLCanvasElement> {
  // 한 프레임 양보해서 연출이 먼저 그려지게 한다
  await new Promise((r) => setTimeout(r, 0));

  const sw = Math.min(INPAINT_WIDTH, still.width);
  const sh = Math.round((still.height * sw) / still.width);

  const small = newCanvas(sw, sh);
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(still, 0, 0, sw, sh);

  // 인페인팅용 이진 마스크: 팽창 마스크를 축소해서 0.5 초과만 사용 (+1px 여유)
  const maskCanvas = newCanvas(sw, sh);
  const mctx = maskCanvas.getContext("2d", { willReadFrequently: true })!;
  const hard = alphaToCanvas(
    Uint8Array.from(target.sceneMask, (v) => (v ? 255 : 0)),
    target.w,
    target.h,
  );
  mctx.drawImage(hard, 0, 0, sw, sh);
  const md = mctx.getImageData(0, 0, sw, sh).data;
  const mask = new Uint8Array(sw * sh);
  for (let i = 0; i < mask.length; i++) mask[i] = md[i * 4 + 3] > 40 ? 255 : 0;
  const grown = dilate(
    Uint8Array.from(mask, (v) => (v ? 1 : 0)),
    sw,
    sh,
    1,
  );
  for (let i = 0; i < mask.length; i++) mask[i] = grown[i] ? 255 : 0;

  const filledCanvas = newCanvas(sw, sh);
  try {
    const filled = await inpaintImage(sctx.getImageData(0, 0, sw, sh), mask);
    filledCanvas.getContext("2d")!.putImageData(filled, 0, 0);
  } catch (e) {
    // OpenCV 로딩/실행 실패: 주변 색을 크게 번지게 한 흐린 배경으로 대체
    console.warn("인페인팅 실패, 흐린 배경으로 대체", e);
    const tiny = newCanvas(12, Math.max(2, Math.round((12 * sh) / sw)));
    tiny.getContext("2d")!.drawImage(still, 0, 0, tiny.width, tiny.height);
    const fctx = filledCanvas.getContext("2d")!;
    fctx.imageSmoothingEnabled = true;
    fctx.drawImage(tiny, 0, 0, sw, sh);
  }

  // 원본 크기로 되돌린 뒤, 마스크 영역(페더링)에만 합성해서 나머지 배경은 원본 화질 유지
  const patch = applyAlpha(
    (() => {
      const up = newCanvas(still.width, still.height);
      const uctx = up.getContext("2d")!;
      uctx.imageSmoothingQuality = "high";
      uctx.drawImage(filledCanvas, 0, 0, up.width, up.height);
      return up;
    })(),
    target.sceneAlpha,
  );

  const scene = newCanvas(still.width, still.height);
  const ctx = scene.getContext("2d")!;
  ctx.drawImage(still, 0, 0);
  ctx.drawImage(patch, 0, 0);
  return scene;
}
