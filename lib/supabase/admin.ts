// 서버 전용: service_role 키로 RLS 를 우회하는 클라이언트. 등급 뽑기 기록처럼 사용자가 직접 바꾸면 안 되는 쓰기에만 쓴다.
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
