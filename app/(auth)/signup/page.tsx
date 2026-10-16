export const dynamic = "force-dynamic";

import AuthForm from "@/components/AuthForm";

export default function SignupPage() {
  // 코드 입력란 표시 여부만 서버에서 결정. 코드 값 자체는 클라이언트에 내려가지 않음.
  return (
    <AuthForm mode="signup" needsCode={Boolean(process.env.SIGNUP_CODE)} />
  );
}
