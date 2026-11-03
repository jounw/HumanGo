// 서버는 내부 주소로, 브라우저는 현재 접속 주소 + 프록시 경로(예: /sb)로 Supabase 에 접속할 수 있게 한다.
// NEXT_PUBLIC_SUPABASE_PROXY_PATH 가 없으면 기존처럼 NEXT_PUBLIC_SUPABASE_URL 을 그대로 쓴다.

export const SUPABASE_PROXY_PATH =
  process.env.NEXT_PUBLIC_SUPABASE_PROXY_PATH ?? "";

// 쿠키 이름이 URL 호스트에서 만들어지면 서버(내부 주소)와 브라우저(공개 주소)가 서로 다른 쿠키를 보게 되므로 고정한다.
export const AUTH_COOKIE_OPTIONS = { name: "sb-humango-auth-token" };

export function browserSupabaseUrl(): string {
  if (SUPABASE_PROXY_PATH && typeof window !== "undefined")
    return window.location.origin + SUPABASE_PROXY_PATH;
  return process.env.NEXT_PUBLIC_SUPABASE_URL!;
}

/** 서버가 만든 Supabase 절대 URL(서명 URL 등)을 브라우저가 접근 가능한 경로로 바꾼다. */
export function toBrowserUrl(url: string): string {
  const internal = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!SUPABASE_PROXY_PATH || !internal || !url.startsWith(internal)) return url;
  return SUPABASE_PROXY_PATH + url.slice(internal.replace(/\/$/, "").length);
}
