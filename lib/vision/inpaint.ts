// OpenCV.js 지연 로딩 + cv.inpaint(Telea). 용량이 크므로 카메라 화면 진입 시 preloadOpenCV() 로 미리 시작한다.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { INPAINT_RADIUS } from "@/lib/constants";

let cvPromise: Promise<any> | null = null;

export function preloadOpenCV(): Promise<any> {
  cvPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/opencv/opencv.js";
    s.async = true;
    s.onload = async () => {
      try {
        let cv = (window as any).cv;
        if (typeof cv?.then === "function")
          cv = await cv; // 최신 빌드는 Promise
        else if (!cv?.Mat)
          await new Promise<void>((r) => (cv.onRuntimeInitialized = () => r()));
        resolve(cv);
      } catch (e) {
        reject(e);
      }
    };
    s.onerror = () => reject(new Error("OpenCV.js 로딩 실패"));
    document.head.appendChild(s);
  });
  // 실패하면 다음 시도에서 다시 로드할 수 있게 한다
  cvPromise.catch(() => (cvPromise = null));
  return cvPromise;
}

/**
 * image(RGBA) 에서 mask(0/255, 같은 크기) 영역을 주변 배경으로 채운 ImageData 를 돌려준다.
 */
export async function inpaintImage(
  image: ImageData,
  mask: Uint8Array,
): Promise<ImageData> {
  const cv = await preloadOpenCV();
  const { width: w, height: h } = image;
  const mats: any[] = [];
  const keep = <T>(m: T) => (mats.push(m), m);
  try {
    const src = keep(cv.matFromImageData(image));
    const rgb = keep(new cv.Mat());
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB); // inpaint 는 3채널 8비트만 받는다
    const m = keep(new cv.Mat(h, w, cv.CV_8UC1));
    m.data.set(mask);
    const dst = keep(new cv.Mat());
    cv.inpaint(rgb, m, dst, INPAINT_RADIUS, cv.INPAINT_TELEA);
    const out = keep(new cv.Mat());
    cv.cvtColor(dst, out, cv.COLOR_RGB2RGBA);
    return new ImageData(new Uint8ClampedArray(out.data), w, h);
  } finally {
    mats.forEach((m) => m.delete()); // Mat 은 wasm 메모리이므로 반드시 해제
  }
}
