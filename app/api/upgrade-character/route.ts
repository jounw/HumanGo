// 전설/신화 등급 캐릭터를 이미지 생성 AI(OpenAI)로 다시 그린다.
// API 키는 서버에서만 쓰고, 로그인하지 않은 요청은 proxy.ts 가 막는다(데모 모드 제외).

import { hashSeed } from "@/lib/game/seed";
import { buildPrompt, isAiRarity } from "@/lib/game/aiPrompt";

export const maxDuration = 120;

const MAX_FACE_BYTES = 2 * 1024 * 1024;
const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

const fail = (status: number, message: string) =>
  Response.json({ error: message }, { status });

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fail(503, "AI 이미지 생성이 설정되지 않았어요.");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "잘못된 요청이에요.");
  }
  const face = form.get("face");
  const rarity = String(form.get("rarity") ?? "");
  if (!(face instanceof File) || face.type !== "image/png")
    return fail(400, "얼굴 이미지가 필요해요.");
  if (face.size > MAX_FACE_BYTES) return fail(413, "이미지가 너무 커요.");
  const seed = String(form.get("seed") ?? "").slice(0, 64);
  if (!isAiRarity(rarity))
    return fail(400, "전설/신화 등급만 변환할 수 있어요.");

  const body = new FormData();
  body.set("model", MODEL);
  body.set("image", face, "face.png");
  body.set("prompt", buildPrompt(rarity, hashSeed(seed)));
  body.set("size", "1024x1024");
  body.set("background", "transparent");
  body.set("output_format", "png");
  body.set("quality", "medium");

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body,
      signal: AbortSignal.timeout(110_000),
    });
  } catch (e) {
    console.error("OpenAI 이미지 요청 실패", e);
    return fail(504, "AI 응답이 늦어지고 있어요.");
  }

  if (!res.ok) {
    // 키/요청 내용이 노출되지 않도록 상태 코드와 오류 메시지만 서버 로그에 남긴다
    console.error("OpenAI 이미지 오류", res.status, await res.text());
    return fail(502, "AI 이미지를 만들지 못했어요.");
  }
  const json = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) return fail(502, "AI 이미지를 만들지 못했어요.");

  return new Response(Buffer.from(b64, "base64"), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
