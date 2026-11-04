// 포획 결과 등록: 이미지 4장을 리사이즈해 Storage 에 올리고 captures 행을 만든다.
// 실패하면 이미 올라간 파일을 정리한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BUCKET,
  CAPTURE_NAME_MAX,
  SCENE_JPEG_QUALITY,
  SCENE_MAX_WIDTH,
  type Rarity,
} from "@/lib/constants";
import { demoSave } from "@/lib/demo/store";
import { newCanvas } from "@/lib/vision/mask";

export type RegisterInput = {
  id: string; // 능력치/스킬이 이 id 로 정해지므로 등록 전에 미리 정해 둔다
  name: string;
  isPrivate?: boolean; // true 면 나만 볼 수 있다 (기본 전체 공개)
  bodyId: string;
  rarity: Rarity;
  character: HTMLCanvasElement;
  face: HTMLCanvasElement;
  scene: HTMLCanvasElement;
  cutout: HTMLCanvasElement;
};

export function scaleToMaxWidth(c: HTMLCanvasElement, maxW: number) {
  if (c.width <= maxW) return c;
  const out = newCanvas(maxW, Math.round((c.height * maxW) / c.width));
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(c, 0, 0, out.width, out.height);
  return out;
}

export function canvasToBlob(
  c: HTMLCanvasElement,
  type: "image/png" | "image/jpeg",
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("이미지 변환 실패"))),
      type,
      quality,
    ),
  );
}

export async function registerCapture(
  supabase: SupabaseClient,
  input: RegisterInput,
): Promise<string> {
  const name = input.name.trim();
  if (name.length < 1 || name.length > CAPTURE_NAME_MAX) {
    throw new Error(`이름은 1~${CAPTURE_NAME_MAX}자로 입력해 주세요.`);
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요해요.");

  const id = input.id;
  const base = `${user.id}/${id}`;
  const paths = {
    character: `${base}/character.png`,
    face: `${base}/face.png`,
    scene: `${base}/scene.jpg`,
    cutout: `${base}/cutout.png`,
  };

  // 캐릭터 512 / 얼굴 256 는 이미 목표 크기. 장면/컷아웃은 가로 최대 1280 (둘이 같은 비율로 줄어 겹쳐 볼 수 있음)
  const [character, face, scene, cutout] = await Promise.all([
    canvasToBlob(input.character, "image/png"),
    canvasToBlob(input.face, "image/png"),
    canvasToBlob(
      scaleToMaxWidth(input.scene, SCENE_MAX_WIDTH),
      "image/jpeg",
      SCENE_JPEG_QUALITY,
    ),
    canvasToBlob(scaleToMaxWidth(input.cutout, SCENE_MAX_WIDTH), "image/png"),
  ]);

  const uploaded: string[] = [];
  try {
    const jobs: [string, Blob, string][] = [
      [paths.character, character, "image/png"],
      [paths.face, face, "image/png"],
      [paths.scene, scene, "image/jpeg"],
      [paths.cutout, cutout, "image/png"],
    ];
    for (const [path, blob, contentType] of jobs) {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType, upsert: true });
      if (error) throw error;
      uploaded.push(path);
    }
    const { error } = await supabase.from("captures").insert({
      id,
      owner_id: user.id,
      name,
      character_path: paths.character,
      face_path: paths.face,
      scene_path: paths.scene,
      cutout_path: paths.cutout,
      body_template: input.bodyId,
      rarity: input.rarity,
      is_private: input.isPrivate ?? false,
    });
    if (error) throw error;
    return id;
  } catch (e) {
    if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
    throw e instanceof Error ? e : new Error("등록에 실패했어요.");
  }
}

/** 데모 모드: Supabase 없이 브라우저(IndexedDB)에 저장 */
export async function demoRegister(input: RegisterInput): Promise<string> {
  const name = input.name.trim();
  if (name.length < 1 || name.length > CAPTURE_NAME_MAX) {
    throw new Error(`이름은 1~${CAPTURE_NAME_MAX}자로 입력해 주세요.`);
  }
  const id = input.id;
  const [character, scene, cutout] = await Promise.all([
    canvasToBlob(input.character, "image/png"),
    canvasToBlob(
      scaleToMaxWidth(input.scene, SCENE_MAX_WIDTH),
      "image/jpeg",
      SCENE_JPEG_QUALITY,
    ),
    canvasToBlob(scaleToMaxWidth(input.cutout, SCENE_MAX_WIDTH), "image/png"),
  ]);
  await demoSave({
    id,
    name,
    rarity: input.rarity,
    capturedAt: new Date().toISOString(),
    bodyId: input.bodyId,
    character,
    scene,
    cutout,
  });
  return id;
}
