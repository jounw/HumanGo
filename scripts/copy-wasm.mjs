// 외부 CDN 장애에 대비해 무거운 에셋(MediaPipe wasm, OpenCV.js)을 같은 도메인에서 서빙하도록
// node_modules 에서 public 으로 복사한다. (npm install 시 자동 실행)
import { cpSync, existsSync, mkdirSync } from "node:fs";

const jobs = [
  ["node_modules/@mediapipe/tasks-vision/wasm", "public/models/wasm"],
  [
    "node_modules/@techstark/opencv-js/dist/opencv.js",
    "public/opencv/opencv.js",
  ],
];

for (const [src, dest] of jobs) {
  if (!existsSync(src)) continue;
  mkdirSync(dest.replace(/\/[^/]+$/, ""), { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log("copied", src, "->", dest);
}
