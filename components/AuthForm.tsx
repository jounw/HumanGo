"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, signup, type AuthState } from "@/app/(auth)/actions";
import { GAME_NAME, NICKNAME_MAX } from "@/lib/constants";

const field =
  "w-full rounded-xl bg-white/10 px-4 py-3 text-base text-white placeholder:text-white/40 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-emerald-400";

export default function AuthForm({
  mode,
  needsCode,
}: {
  mode: "login" | "signup";
  needsCode?: boolean;
}) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    mode === "login" ? login : signup,
    {},
  );
  const isLogin = mode === "login";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-4 py-10">
      <header className="text-center">
        <h1 className="text-4xl font-black tracking-tight">{GAME_NAME}</h1>
        <p className="mt-2 text-white/60">
          {isLogin ? "친구들을 잡으러 가볼까요?" : "친구들과 함께 시작해요"}
        </p>
      </header>

      <form action={action} className="flex flex-col gap-3">
        {!isLogin && (
          <input
            name="nickname"
            placeholder="닉네임"
            maxLength={NICKNAME_MAX}
            autoComplete="nickname"
            required
            className={field}
          />
        )}
        <input
          name="email"
          type="email"
          placeholder="이메일"
          autoComplete="email"
          required
          className={field}
        />
        <input
          name="password"
          type="password"
          placeholder="비밀번호 (6자 이상)"
          autoComplete={isLogin ? "current-password" : "new-password"}
          required
          className={field}
        />
        {!isLogin && needsCode && (
          <input
            name="code"
            placeholder="가입 코드"
            autoComplete="off"
            required
            className={field}
          />
        )}

        {state.error && (
          <p role="alert" className="text-sm text-rose-300">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 min-h-12 rounded-xl bg-emerald-400 px-4 font-bold text-black active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? "잠시만요…" : isLogin ? "로그인" : "가입하기"}
        </button>
      </form>

      <p className="text-center text-sm text-white/60">
        {isLogin ? "처음이에요? " : "이미 계정이 있어요? "}
        <Link
          href={isLogin ? "/signup" : "/login"}
          className="font-semibold text-emerald-300 underline-offset-4 hover:underline"
        >
          {isLogin ? "가입하기" : "로그인"}
        </Link>
      </p>
    </main>
  );
}
