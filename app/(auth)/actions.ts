"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NICKNAME_MAX } from "@/lib/constants";

export type AuthState = { error?: string };

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

export async function login(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = str(formData.get("email")).trim();
  const password = str(formData.get("password"));
  if (!email || !password)
    return { error: "이메일과 비밀번호를 입력해 주세요." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "이메일 또는 비밀번호가 맞지 않아요." };

  redirect("/");
}

export async function signup(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = str(formData.get("email")).trim();
  const password = str(formData.get("password"));
  const nickname = str(formData.get("nickname")).trim();
  const code = str(formData.get("code")).trim();

  const required = process.env.SIGNUP_CODE;
  if (required && code !== required) {
    return { error: "가입 코드가 맞지 않아요." };
  }
  if (!nickname || nickname.length > NICKNAME_MAX) {
    return { error: `닉네임은 1~${NICKNAME_MAX}자로 입력해 주세요.` };
  }
  if (!email) return { error: "이메일을 입력해 주세요." };
  if (password.length < 6) return { error: "비밀번호는 6자 이상이어야 해요." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nickname } },
  });

  if (error) {
    // 닉네임 중복이면 프로필 생성 트리거가 실패해 이 메시지로 돌아옴
    if (/database error/i.test(error.message)) {
      return { error: "이미 사용 중인 닉네임이에요." };
    }
    if (/already registered/i.test(error.message)) {
      return { error: "이미 가입된 이메일이에요." };
    }
    return { error: error.message };
  }
  if (!data.session) {
    return {
      error:
        "가입은 됐지만 로그인되지 않았어요. Supabase 대시보드에서 'Confirm email'을 꺼 주세요.",
    };
  }

  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
