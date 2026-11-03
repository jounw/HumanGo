import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_OPTIONS } from "./config";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/auth",
  // 개발 전용 점검 페이지 (프로덕션에서는 페이지 자체가 404)
  ...(process.env.NODE_ENV !== "production" ? ["/dev"] : []),
];

// 세션 갱신 + 비로그인 사용자를 /login 으로 보냄. (Next 16에서는 proxy.ts 가 이 함수를 호출)
export async function updateSession(request: NextRequest) {
  // 로컬 개발 전용: Supabase 없이 화면/카메라 흐름을 점검할 때 로그인 검사를 건너뛴다.
  // 프로덕션 빌드에서는 NODE_ENV 때문에 절대 켜지지 않는다.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_BYPASS_AUTH === "1"
  ) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // "/" 는 시작 화면이라 누구나 볼 수 있다 (startsWith 로 비교하면 모든 경로가 걸리므로 따로 처리)
  const isPublic =
    pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    return NextResponse.redirect(url);
  }
  return response;
}
