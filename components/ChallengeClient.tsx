"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import TeamPicker from "@/components/TeamPicker";
import type { DexItem } from "@/lib/dex";

export default function ChallengeClient({
  friendId,
  items,
}: {
  friendId: string;
  items: DexItem[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(team: string[]) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/battle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ friendId, team }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "신청하지 못했어요.");
      router.push(`/battle/${json.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "신청하지 못했어요.");
      setBusy(false);
    }
  }

  return (
    <TeamPicker
      items={items}
      confirmLabel="배틀 신청"
      busy={busy}
      error={error}
      onConfirm={submit}
    />
  );
}
