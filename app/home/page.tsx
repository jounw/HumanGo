import Link from "next/link";
import { logout } from "@/app/(auth)/actions";
import CharacterCard from "@/components/CharacterCard";
import ModelPreloader from "@/components/ModelPreloader";
import { DemoHome } from "@/components/demo/DemoViews";
import { DEMO } from "@/lib/demo/store";
import { GAME_NAME } from "@/lib/constants";
import { listCaptures } from "@/lib/dex";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  if (DEMO)
    return (
      <>
        <ModelPreloader />
        <DemoHome />
      </>
    );
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("nickname")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  const { count } = user
    ? await supabase
        .from("captures")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id)
    : { count: 0 };

  const recent = user
    ? await listCaptures(supabase, { ownerId: user.id, limit: 4 })
    : [];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-8 px-4 py-8">
      <ModelPreloader />
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight">{GAME_NAME}</h1>
        <form action={logout}>
          <button className="min-h-11 rounded-lg px-3 text-sm text-white/60 hover:text-white">
            로그아웃
          </button>
        </form>
      </header>

      <section>
        <p className="text-white/60">안녕하세요,</p>
        <p className="text-3xl font-bold">
          {profile?.nickname ?? "트레이너"}님
        </p>
      </section>

      <Link
        href="/capture"
        className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-3xl bg-emerald-400 text-black shadow-lg shadow-emerald-400/20 active:scale-[0.98]"
      >
        <span className="text-3xl font-black">잡으러 가기</span>
        <span className="text-sm font-medium opacity-70">
          카메라로 친구를 찾아보세요
        </span>
      </Link>

      <Link
        href="/dex"
        className="flex items-center justify-between rounded-2xl bg-white/10 px-5 py-4 ring-1 ring-white/10 active:bg-white/15"
      >
        <span className="font-semibold">내 도감</span>
        <span className="text-white/60">{count ?? 0}명 잡음 ›</span>
      </Link>

      {recent.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">최근 잡은 친구</h2>
          <ul className="grid grid-cols-2 gap-3">
            {recent.map((item) => (
              <li key={item.id}>
                <CharacterCard item={item} showOwner={false} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
