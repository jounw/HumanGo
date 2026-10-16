// 캡처 화면 -> 결과 화면으로 캔버스를 넘기는 메모리 저장소. (클라이언트 내비게이션 동안만 유지)
import type { Target } from "@/lib/vision/capture";

export type CaptureSession = {
  still: HTMLCanvasElement;
  scene: HTMLCanvasElement;
  target: Target;
};

let current: CaptureSession | null = null;

export const setCaptureSession = (s: CaptureSession | null) => {
  current = s;
};
export const getCaptureSession = () => current;
