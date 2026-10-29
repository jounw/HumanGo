// MediaPipe PoseLandmarker 로 사람별 분할 마스크를 얻는다.
// - 실시간(VIDEO): 저해상도 이진 마스크 + 바운딩 박스 (윤곽 하이라이트, 명중 판정용)
// - 정지 이미지(IMAGE): 풀해상도 확률 마스크 (잘라내기, 배경 지우기용)

import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { LIVE_INPUT_WIDTH, MAX_POSES } from "@/lib/constants";

const MODEL_URL = "/models/pose_landmarker_lite.task";
const WASM_URL = "/models/wasm";

export type Box = { x: number; y: number; w: number; h: number }; // 정규화 0~1

/** 실시간 감지된 사람 한 명 (저해상도 격자) */
export type Person = {
  mask: Uint8Array; // 0 또는 1, gw*gh
  gw: number;
  gh: number;
  bbox: Box;
};

/** 정지 이미지에서 감지된 사람 한 명 (풀해상도) */
export type StillPerson = {
  mask: Float32Array; // 0~1 확률, w*h
  w: number;
  h: number;
  bbox: Box;
};

// GPU 델리게이트가 빈 마스크를 돌려주는 기기가 있어, 감지되면 CPU 로 고정한다
let forceCpu = false;

let visionPromise: Promise<typeof import("@mediapipe/tasks-vision")> | null =
  null;
let filesetPromise: Promise<unknown> | null = null;

export async function getMp() {
  visionPromise ??= import("@mediapipe/tasks-vision");
  return visionPromise;
}

export async function getFileset() {
  const mp = await getMp();
  filesetPromise ??= mp.FilesetResolver.forVisionTasks(WASM_URL);
  return filesetPromise as ReturnType<typeof mp.FilesetResolver.forVisionTasks>;
}

async function createPose(
  mode: "VIDEO" | "IMAGE",
): Promise<{ landmarker: PoseLandmarker; delegate: "GPU" | "CPU" }> {
  const mp = await getMp();
  const fileset = await getFileset();
  const make = (delegate: "GPU" | "CPU") =>
    mp.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: mode,
      numPoses: MAX_POSES,
      outputSegmentationMasks: true,
    });
  try {
    if (forceCpu || (globalThis as { __cpu?: boolean }).__cpu)
      throw new Error("forced cpu");
    return { landmarker: await make("GPU"), delegate: "GPU" };
  } catch (e) {
    console.warn("GPU delegate 실패, CPU 로 폴백", e);
    return { landmarker: await make("CPU"), delegate: "CPU" };
  }
}

function boxFromGrid(mask: Uint8Array, gw: number, gh: number): Box | null {
  let minX = gw,
    minY = gh,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < gh; y++) {
    const row = y * gw;
    for (let x = 0; x < gw; x++) {
      if (mask[row + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return {
    x: minX / gw,
    y: minY / gh,
    w: (maxX - minX + 1) / gw,
    h: (maxY - minY + 1) / gh,
  };
}

// 마스크가 비어 있는데 포즈는 감지되는 상태가 이 프레임 수만큼 이어지면 CPU 로 전환
const DEGRADED_FRAMES = 12;

export class LiveSegmenter {
  private lastTs = 0;
  private bad = 0;
  private switching = false;
  private canvas = document.createElement("canvas");
  constructor(
    private landmarker: PoseLandmarker,
    public delegate: "GPU" | "CPU",
  ) {}

  /** 비디오 프레임을 작은 캔버스로 줄여서 분할한다. 마스크 크기 = 입력 크기이므로 작을수록 빠르다. */
  detect(video: HTMLVideoElement | HTMLImageElement): Person[] {
    if (this.switching) return [];
    const [vw, vh] =
      "videoWidth" in video
        ? [video.videoWidth, video.videoHeight]
        : [video.naturalWidth, video.naturalHeight];
    const gw = LIVE_INPUT_WIDTH;
    const gh = Math.max(1, Math.round((gw * vh) / vw));
    if (this.canvas.width !== gw || this.canvas.height !== gh) {
      this.canvas.width = gw;
      this.canvas.height = gh;
    }
    this.canvas.getContext("2d")!.drawImage(video, 0, 0, gw, gh);

    // 타임스탬프는 단조 증가해야 한다
    const ts = Math.max(performance.now(), this.lastTs + 1);
    this.lastTs = ts;

    let poses = 0;
    const people: Person[] = [];
    this.landmarker.detectForVideo(this.canvas, ts, (result) => {
      poses = result.landmarks?.length ?? 0;
      for (const m of result.segmentationMasks ?? []) {
        const data = m.getAsFloat32Array(); // 마스크는 콜백 안에서만 유효
        const mask = new Uint8Array(m.width * m.height);
        for (let i = 0; i < mask.length; i++) if (data[i] > 0.5) mask[i] = 1;
        const bbox = boxFromGrid(mask, m.width, m.height);
        // 너무 작은 잡음은 사람으로 치지 않음
        if (bbox && bbox.w * bbox.h > 0.01)
          people.push({ mask, gw: m.width, gh: m.height, bbox });
      }
    });

    this.bad = poses > 0 && people.length === 0 ? this.bad + 1 : 0;
    if (this.bad >= DEGRADED_FRAMES && this.delegate === "GPU")
      void this.fallbackToCpu();
    return people;
  }

  private async fallbackToCpu() {
    console.warn("GPU 마스크가 비어 있어 CPU 로 전환합니다");
    this.switching = true;
    forceCpu = true;
    try {
      const next = await createPose("VIDEO");
      this.landmarker.close();
      this.landmarker = next.landmarker;
      this.delegate = next.delegate;
      this.lastTs = 0;
    } finally {
      this.bad = 0;
      this.switching = false;
    }
  }

  close() {
    this.landmarker.close();
  }
}

function makeLiveSegmenter() {
  return createPose("VIDEO").then(
    ({ landmarker, delegate }) => new LiveSegmenter(landmarker, delegate),
  );
}

// 카메라 화면 전에 미리 만들어 둔 실시간 분할기 (한 번 꺼내 쓰면 비워진다)
let livePool: Promise<LiveSegmenter> | null = null;

/** 실시간 분할기를 미리 만들어 둔다. 카메라 화면이 열릴 때 createLiveSegmenter 가 이걸 가져다 쓴다. */
export function warmLiveSegmenter() {
  livePool ??= makeLiveSegmenter();
  livePool.catch(() => (livePool = null));
  return livePool.then(() => undefined);
}

export function createLiveSegmenter() {
  const pooled = livePool;
  livePool = null;
  return pooled ?? makeLiveSegmenter();
}

let stillPromise: Promise<PoseLandmarker> | null = null;

/** 정지 이미지 한 장에서 사람별 풀해상도 마스크를 얻는다. */
export async function segmentStill(
  image: HTMLCanvasElement,
): Promise<StillPerson[]> {
  stillPromise ??= createPose("IMAGE").then((r) => r.landmarker);
  const landmarker = await stillPromise;

  const people: StillPerson[] = [];
  let poses = 0;
  landmarker.detect(image, (result) => {
    poses = result.landmarks?.length ?? 0;
    for (const m of result.segmentationMasks ?? []) {
      const mask = new Float32Array(m.getAsFloat32Array()); // 복사
      const gw = m.width;
      const gh = m.height;
      // 바운딩 박스는 거친 격자로 계산
      const step = Math.max(1, Math.floor(gw / 160));
      const cw = Math.ceil(gw / step);
      const ch = Math.ceil(gh / step);
      const coarse = new Uint8Array(cw * ch);
      for (let y = 0; y < ch; y++)
        for (let x = 0; x < cw; x++)
          if (
            mask[Math.min(gh - 1, y * step) * gw + Math.min(gw - 1, x * step)] >
            0.5
          )
            coarse[y * cw + x] = 1;
      const bbox = boxFromGrid(coarse, cw, ch);
      if (bbox && bbox.w * bbox.h > 0.005)
        people.push({ mask, w: gw, h: gh, bbox });
    }
  });
  if (poses > 0 && people.length === 0 && !forceCpu) {
    // GPU 가 빈 마스크를 준 경우: CPU 로 바꿔 한 번 더 시도
    console.warn("GPU 마스크가 비어 있어 CPU 로 전환합니다");
    forceCpu = true;
    disposeStillSegmenter();
    return segmentStill(image);
  }
  return people;
}

export function disposeStillSegmenter() {
  stillPromise?.then((l) => l.close());
  stillPromise = null;
}

export function boxCenter(b: Box) {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

export function boxIou(a: Box, b: Box) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * 정지 프레임에서 감지된 사람 중 '맞은 사람'을 고른다.
 * 1순위: 명중 지점을 마스크가 덮는 사람, 2순위: 실시간 때 맞았던 박스와 가장 많이 겹치는 사람.
 */
export function pickHitPerson(
  stills: StillPerson[],
  hit: { x: number; y: number }, // 비디오 정규화 좌표
  liveBox: Box,
): StillPerson | null {
  let best: StillPerson | null = null;
  let bestScore = 0;
  for (const p of stills) {
    const px = Math.min(p.w - 1, Math.max(0, Math.floor(hit.x * p.w)));
    const py = Math.min(p.h - 1, Math.max(0, Math.floor(hit.y * p.h)));
    const covers = p.mask[py * p.w + px] > 0.5 ? 1 : 0;
    const score = covers * 10 + boxIou(p.bbox, liveBox);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

/** 정지 이미지용 분할기를 미리 만들어 둔다 (첫 명중 때 모델 로딩 지연 방지) */
export function warmStillSegmenter() {
  stillPromise ??= createPose("IMAGE").then((r) => r.landmarker);
  return stillPromise.then(() => undefined);
}
