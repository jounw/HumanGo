// 전설/신화 캐릭터를 서버(/api/upgrade-character)에 보내 AI 로 다시 그린다.
// 실패하면 null 을 돌려주고, 호출한 쪽은 기본 몸통 합성 결과를 그대로 쓴다.

import { CHARACTER_SIZE } from "@/lib/constants";
import { canvasToBlob } from "@/lib/game/upload";
import { newCanvas } from "@/lib/vision/mask";
import type { AiRarity } from "./aiPrompt";

const CLIENT_TIMEOUT_MS = 120_000;

export async function upgradeCharacter(
  face: HTMLCanvasElement,
  rarity: AiRarity,
  seedId: string,
  signal?: AbortSignal,
): Promise<HTMLCanvasElement | null> {
  try {
    const form = new FormData();
    form.set("face", await canvasToBlob(face, "image/png"), "face.png");
    form.set("rarity", rarity);
    form.set("seed", seedId); // 같은 캐릭터는 같은 속성/모티프가 나오도록
    const res = await fetch("/api/upgrade-character", {
      method: "POST",
      body: form,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(CLIENT_TIMEOUT_MS)])
        : AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const out = newCanvas(CHARACTER_SIZE, CHARACTER_SIZE);
    const ctx = out.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, CHARACTER_SIZE, CHARACTER_SIZE);
    bmp.close();
    return out;
  } catch (e) {
    if (!(e instanceof DOMException && e.name === "AbortError"))
      console.warn("AI 캐릭터 변환 실패, 기본 몸통을 사용합니다", e);
    return null;
  }
}
