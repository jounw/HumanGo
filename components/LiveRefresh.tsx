"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/** 테이블 변경(Realtime)이 오면 서버 컴포넌트를 다시 불러온다. 연결이 끊겨도 주기적으로 갱신한다. */
export default function LiveRefresh({
  tables,
  pollMs = 15000,
}: {
  tables: ("battles" | "friendships")[];
  pollMs?: number;
}) {
  const router = useRouter();
  const key = tables.join(",");

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    };
    let channel = supabase.channel(`live-${key}-${Math.random()}`);
    for (const table of key.split(","))
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        refresh,
      );
    channel.subscribe();
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, pollMs);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [key, pollMs, router]);

  return null;
}
