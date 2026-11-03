import Link from "next/link";
import { notFound } from "next/navigation";
import ChallengeClient from "@/components/ChallengeClient";
import { UUID } from "@/lib/battle/server";
import { listCaptures } from "@/lib/dex";
import { createClient } from "@/lib/supabase/server";

export default async function NewBattlePage(props: PageProps<"/battle/new">) {
  const { friend } = await props.searchParams;
  if (typeof friend !== "string" || !UUID.test(friend)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname")
    .eq("id", friend)
    .maybeSingle();
  if (!profile) notFound();

  const items = await listCaptures(supabase, { ownerId: user.id });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 py-6">
      <header className="flex items-center gap-3">
        <Link
          href="/battle"
          aria-label="배틀 로비로"
          className="flex size-11 items-center justify-center rounded-full bg-white/10 text-xl"
        >
          ←
        </Link>
        <h1 className="text-xl font-black">{profile.nickname}님에게 도전</h1>
      </header>
      <ChallengeClient friendId={friend} items={items} />
    </main>
  );
}
