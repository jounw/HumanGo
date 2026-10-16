import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // 정적 파일, 이미지, 모델 파일은 제외
    "/((?!_next/static|_next/image|favicon.ico|models/|ball/|bodies/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|tflite|wasm|js)$).*)",
  ],
};
