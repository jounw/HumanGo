import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoDexDetail } from "@/components/demo/DemoViews";
import { DEMO } from "@/lib/demo/store";
import DexDetail from "@/components/DexDetail";
import { signUrls } from "@/lib/dex";
import { isRarity } from "@/lib/game/rarity";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DexDetailPage(props: PageProps<"/dex/[id]">) {
  const { id } = await props.params;
  if (DEMO) return <DemoDexDetail id={id} />;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: row } = await supabase
    .from("captures")
    .select(
      "id,name,rarity,character_path,face_path,scene_path,cutout_path,body_template,captured_at,owner_id,owner:profiles(nickname)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!row) notFound();

  const paths = [
    row.character_path,
    row.face_path,
    row.scene_path,
    row.cutout_path,
  ].filter(Boolean) as string[];
  const urls = await signUrls(supabase, paths);
  const owner = Array.isArray(row.owner) ? row.owner[0] : row.owner;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 py-6">
      <header className="flex items-center gap-3">
        <Link
          href="/dex"
          aria-label="도감으로"
          className="flex size-11 items-center justify-center rounded-full bg-white/10 text-xl"
        >
          ‹
        </Link>
        <h1 className="text-lg font-bold">도감 상세</h1>
      </header>
      <DexDetail
        id={row.id}
        name={row.name}
        rarity={isRarity(row.rarity) ? row.rarity : "common"}
        ownerNickname={owner?.nickname ?? "알 수 없음"}
        isMine={user?.id === row.owner_id}
        // 서버 시간대와 무관하게 같은 문자열이 나오도록 서버에서 포맷
        capturedAt={new Intl.DateTimeFormat("ko-KR", {
          dateStyle: "long",
          timeStyle: "short",
          timeZone: "Asia/Seoul",
        }).format(new Date(row.captured_at))}
        characterUrl={urls.get(row.character_path) ?? null}
        faceUrl={row.face_path ? (urls.get(row.face_path) ?? null) : null}
        bodyId={row.body_template}
        sceneUrl={row.scene_path ? (urls.get(row.scene_path) ?? null) : null}
        cutoutUrl={row.cutout_path ? (urls.get(row.cutout_path) ?? null) : null}
        paths={paths}
      />
    </main>
  );
}
