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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
