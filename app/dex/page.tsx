import Link from "next/link";
import { DemoDexList } from "@/components/demo/DemoViews";
import { DEMO } from "@/lib/demo/store";
import CharacterCard from "@/components/CharacterCard";
import ResetDexButton from "@/components/ResetDexButton";
import { listCaptures } from "@/lib/dex";
import { createClient } from "@/lib/supabase/server";

export default async function DexPage(props: PageProps<"/dex">) {
  if (DEMO) return <DemoDexList />;
  const { tab } = await props.searchParams;
  const mine = tab !== "all";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const items = await listCaptures(
    supabase,
    mine && user ? { ownerId: user.id } : {},
  );

  const tabClass = (active: boolean) =>
    `flex-1 rounded-lg py-2.5 text-center text-sm font-semibold ${
      active ? "bg-white/15 text-white" : "text-white/55"
    }`;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 py-6">
      <header className="flex items-center gap-3">
        <Link
          href="/home"
          aria-label="홈으로"
          className="flex size-11 items-center justify-center rounded-full bg-white/10 text-xl"
        >
          ‹
        </Link>
        <h1 className="text-2xl font-black">도감</h1>
        <span className="ml-auto text-sm text-white/55">{items.length}명</span>
      </header>

      <nav
        className="flex gap-1 rounded-xl bg-white/5 p-1"
        aria-label="도감 종류"
      >
        <Link
          href="/dex"
          replace
          className={tabClass(mine)}
          aria-current={mine ? "page" : undefined}
        >
          내 도감
        </Link>
        <Link
          href="/dex?tab=all"
          replace
          className={tabClass(!mine)}
          aria-current={!mine ? "page" : undefined}
        >
          전체
        </Link>
      </nav>

      {items.length === 0 ? (
        <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-lg font-semibold">
            {mine ? "아직 잡은 친구가 없어요" : "아직 아무도 잡히지 않았어요"}
          </p>
          <p className="text-sm text-white/60">
            카메라로 친구를 찾아 캡처볼을 던져 보세요.
          </p>
          <Link
            href="/capture"
            className="min-h-12 rounded-xl bg-emerald-400 px-6 py-3 font-bold text-black"
          >
            잡으러 가기
          </Link>
        </section>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {items.map((item) => (
            <li key={item.id}>
              <CharacterCard item={item} showOwner={!mine} />
            </li>
          ))}
        </ul>
      )}
      {mine && items.length > 0 && <ResetDexButton />}
    </main>
  );
}
