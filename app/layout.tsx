import type { Metadata, Viewport } from "next";
import { GAME_NAME } from "@/lib/constants";
import "./globals.css";

export const metadata: Metadata = {
  title: GAME_NAME,
  description: "친구를 잡는 AR 웹게임",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1020",
};

// 배포 확인용 표식: 이 빌드의 커밋(앞 7자리)과 빌드 시각을 <html> 에 남긴다.
// 페이지 소스 보기로 서버가 어떤 커밋을 돌리는지 알 수 있다. (next.config.ts 가 빌드할 때 채운다)
const BUILD = (process.env.BUILD_SHA ?? "dev").slice(0, 7);
const BUILT = process.env.BUILD_TIME ?? "";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ko"
      className="h-full antialiased"
      data-build={BUILD}
      data-built={BUILT}
    >
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
