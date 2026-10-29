"use client";

import { useEffect } from "react";
import { warmExpression } from "@/lib/vision/expression";
import { warmFaceDetector } from "@/lib/vision/face";
import { preloadOpenCV } from "@/lib/vision/inpaint";
import { warmLiveSegmenter, warmStillSegmenter } from "@/lib/vision/segmenter";

// 카메라 화면에 들어가기 전(시작/홈 화면)부터 무거운 모델을 하나씩 미리 불러온다.
// 모델 모듈은 앱 전체에서 공유되므로, 카메라 화면은 이미 로딩된 것을 바로 쓴다.
export default function ModelPreloader() {
  useEffect(() => {
    const conn = (navigator as { connection?: { saveData?: boolean } })
      .connection;
    if (conn?.saveData) return; // 데이터 절약 모드에서는 카메라 진입 때 로딩

    let dead = false;
    const run = async () => {
      // 화면이 먼저 그려지도록 브라우저가 한가할 때 시작하고, GPU 초기화가 겹치지 않게 순서대로 한다
      const steps = [
        warmLiveSegmenter,
        warmStillSegmenter,
        warmFaceDetector,
        warmExpression,
        preloadOpenCV,
      ];
      for (const step of steps) {
        if (dead) return;
        try {
          await step();
        } catch (e) {
          console.warn("모델 미리 로딩 실패 (카메라 진입 때 다시 시도)", e);
        }
      }
      new Image().src = "/ball/capture-ball.svg";
    };

    const ric = "requestIdleCallback" in window;
    const handle = ric
      ? window.requestIdleCallback(() => void run(), { timeout: 1500 })
      : window.setTimeout(() => void run(), 300);
    return () => {
      dead = true;
      if (ric) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, []);

  return null;
}
