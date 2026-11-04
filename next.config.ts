import { execSync } from "node:child_process";
import type { NextConfig } from "next";

// 빌드한 커밋을 관리자 페이지에서 보여 주기 위해 빌드 시점에 기록한다. git 이 없으면 unknown.
function git(cmd: string) {
  try {
    return execSync(`git ${cmd}`, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  env: {
    BUILD_SHA: git("rev-parse HEAD"),
    BUILD_SUBJECT: git("log -1 --format=%s"),
    BUILD_TIME: new Date().toISOString(),
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
