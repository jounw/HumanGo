import { createBrowserClient } from "@supabase/ssr";
import { AUTH_COOKIE_OPTIONS, browserSupabaseUrl } from "./config";

export function createClient() {
  return createBrowserClient(
    browserSupabaseUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: AUTH_COOKIE_OPTIONS },
  );
}
