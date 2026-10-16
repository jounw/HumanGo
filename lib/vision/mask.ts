// 마스크 후처리: 이진화, 팽창(dilate), 가장자리 페더링, 캔버스 변환.
// 사람 마스크는 풀해상도(수십만 px)이므로 누적합 기반 O(n) 박스 필터를 쓴다.

export function binarize(src: Float32Array, threshold = 0.5): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i++) if (src[i] > threshold) out[i] = 1;
  return out;
}

/** 1차원 슬라이딩 윈도우 (radius). mode 'max': 윈도우에 1이 하나라도 있으면 1. 'avg': 평균. */
function pass1d(
  src: Uint8Array,
  dst: Uint8Array,
  len: number,
  count: number,
  stride: number,
  step: number,
  r: number,
  mode: "max" | "avg",
) {
  const prefix = new Uint32Array(len + 1);
  for (let line = 0; line < count; line++) {
    const base = line * step;
    for (let i = 0; i < len; i++)
      prefix[i + 1] = prefix[i] + src[base + i * stride];
    for (let i = 0; i < len; i++) {
      const a = Math.max(0, i - r);
      const b = Math.min(len - 1, i + r);
      const sum = prefix[b + 1] - prefix[a];
      dst[base + i * stride] =
        mode === "max" ? (sum > 0 ? 1 : 0) : Math.round(sum / (b - a + 1));
    }
  }
}

/** 마스크를 r 픽셀만큼 팽창 (사각 커널). 입력/출력은 0/1. */
export function dilate(
  src: Uint8Array,
  w: number,
  h: number,
  r: number,
): Uint8Array {
  if (r <= 0) return src.slice();
  const tmp = new Uint8Array(src.length);
  const out = new Uint8Array(src.length);
  pass1d(src, tmp, w, h, 1, w, r, "max"); // 가로
  pass1d(tmp, out, h, w, w, 1, r, "max"); // 세로
  return out;
}

/** 마스크를 r 픽셀만큼 침식 (배경 번짐 제거용). 반전 -> 팽창 -> 반전. */
export function erode(
  src: Uint8Array,
  w: number,
  h: number,
  r: number,
): Uint8Array {
  if (r <= 0) return src.slice();
  const inv = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i++) inv[i] = src[i] ? 0 : 1;
  const grown = dilate(inv, w, h, r);
  for (let i = 0; i < grown.length; i++) grown[i] = grown[i] ? 0 : 1;
  return grown;
}

/** 0/1 마스크를 부드러운 0~255 알파로. r 은 블러 반경. */
export function feather(
  src: Uint8Array,
  w: number,
  h: number,
  r: number,
): Uint8Array {
  const scaled = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i++) scaled[i] = src[i] ? 255 : 0;
  if (r <= 0) return scaled;
  // 255 범위 값에 대한 평균이므로 누적합 Uint32 로 충분 (최대 255 * 16384)
  const tmp = new Uint8Array(src.length);
  const out = new Uint8Array(src.length);
  pass1d(scaled, tmp, w, h, 1, w, r, "avg");
  pass1d(tmp, out, h, w, w, 1, r, "avg");
  return out;
}

/** 0~255 알파 배열 -> 알파 채널만 의미 있는 캔버스 (흰색 + alpha) */
export function alphaToCanvas(
  alpha: Uint8Array,
  w: number,
  h: number,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < alpha.length; i++) {
    const o = i * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
    img.data[o + 3] = alpha[i];
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function newCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** source 의 알파를 maskCanvas 의 알파로 제한한 새 캔버스 (크기가 달라도 maskCanvas 를 늘려 맞춤) */
export function applyAlpha(
  source: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
): HTMLCanvasElement {
  const out = newCanvas(source.width, source.height);
  const ctx = out.getContext("2d")!;
  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(maskCanvas, 0, 0, out.width, out.height);
  return out;
}
