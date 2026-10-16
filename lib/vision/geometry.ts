// 비디오(정규화 좌표 0~1) <-> 화면(CSS px) 좌표 변환. 비디오는 object-cover 로 채워지고,
// 전면 카메라는 CSS 로 좌우 반전되어 있다.

export type Viewport = {
  sw: number; // 화면(요소) 너비 CSS px
  sh: number;
  vw: number; // 비디오 원본 너비 px
  vh: number;
  mirror: boolean;
};

export function coverScale(vp: Viewport) {
  const scale = Math.max(vp.sw / vp.vw, vp.sh / vp.vh);
  const ox = (vp.sw - vp.vw * scale) / 2;
  const oy = (vp.sh - vp.vh * scale) / 2;
  return { scale, ox, oy };
}

export function videoToScreen(nx: number, ny: number, vp: Viewport) {
  const { scale, ox, oy } = coverScale(vp);
  const x = (vp.mirror ? 1 - nx : nx) * vp.vw * scale + ox;
  const y = ny * vp.vh * scale + oy;
  return { x, y };
}

export function screenToVideo(x: number, y: number, vp: Viewport) {
  const { scale, ox, oy } = coverScale(vp);
  const nx = (x - ox) / (vp.vw * scale);
  const ny = (y - oy) / (vp.vh * scale);
  return { x: vp.mirror ? 1 - nx : nx, y: ny };
}

/** 비디오 전체가 화면에 그려지는 사각형 (화면 밖으로 넘칠 수 있음) */
export function videoRectOnScreen(vp: Viewport) {
  const { scale, ox, oy } = coverScale(vp);
  return { x: ox, y: oy, w: vp.vw * scale, h: vp.vh * scale };
}
