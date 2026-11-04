import Link from "next/link";
import { notFound } from "next/navigation";
import AdminPhotoCard from "@/components/AdminPhotoCard";
import { requireAdmin } from "@/lib/admin/server";
import { signUrls } from "@/lib/dex";
import { isRarity } from "@/lib/game/rarity";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

// 관리자 전용: 비공개 포함 모든 캐릭터의 사진(캐릭터/얼굴/장면/컷아웃)을 보고 지운다.
export default async function AdminPhotosPage(
  props: PageProps<"/admin/photos">,
) {
  const a = await requireAdmin();
  if (!a) notFound();

  const sp = await props.searchParams;
  const page = Math.max(1, Number.parseInt(String(sp.page ?? "1"), 10) || 1);
  const onlyPrivate = sp.private === "1";

  let q = a.admin
    .from("captures")
    .select(
      "id,name,rarity,is_private,captured_at,character_path,face_path,scene_path,cutout_path,owner:profiles(nickname)",
      { count: "exact" },
    )
    .order("captured_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (onlyPrivate) q = q.eq("is_private", true);
  const { data, count } = await q;
  const rows = data ?? [];

  const urls = await signUrls(
    a.admin,
    rows.flatMap((r) =>
      [r.character_path, r.face_path, r.scene_path, r.cutout_path].filter(
        Boolean,
      ),
    ) as string[],
  );
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const href = (p: number) =>
    `/admin/photos?page=${p}${onlyPrivate ? "&private=1" : ""}`;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-5 px-4 py-6">
      <header className="flex items-center gap-3">
        <Link
          href="/admin"
          aria-label="관리자로"
          className="flex size-11 items-center justify-center rounded-full bg-white/10 text-xl"
        >
          ←
        </Link>
        <h1 className="text-2xl font-black">사진 관리</h1>
        <span className="ml-auto text-sm text-white/55">{count ?? 0}건</span>
      </header>

      <nav className="flex gap-1 rounded-xl bg-white/5 p-1 text-sm font-semibold">
        <Link
          href="/admin/photos"
          className={`flex-1 rounded-lg py-2.5 text-center ${onlyPrivate ? "text-white/55" : "bg-white/15"}`}
        >
          전체
        </Link>
        <Link
          href="/admin/photos?private=1"
          className={`flex-1 rounded-lg py-2.5 text-center ${onlyPrivate ? "bg-white/15" : "text-white/55"}`}
        >
          🔒 나만 보기만
        </Link>
      </nav>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-white/60">사진이 없어요.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => {
            const owner = Array.isArray(r.owner) ? r.owner[0] : r.owner;
            const u = (p: string | null) => (p ? (urls.get(p) ?? null) : null);
            return (
              <li key={r.id}>
                <AdminPhotoCard
                  id={r.id}
                  name={r.name}
                  rarity={isRarity(r.rarity) ? r.rarity : "common"}
                  isPrivate={r.is_private}
                  owner={owner?.nickname ?? "알 수 없음"}
                  capturedAt={new Intl.DateTimeFormat("ko-KR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Seoul",
                  }).format(new Date(r.captured_at))}
                  images={[
                    { label: "캐릭터", url: u(r.character_path) },
                    { label: "얼굴", url: u(r.face_path) },
                    { label: "장면", url: u(r.scene_path) },
                    { label: "컷아웃", url: u(r.cutout_path) },
                  ]}
                />
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-center gap-4 text-sm">
          {page > 1 ? (
            <Link
              href={href(page - 1)}
              className="rounded-lg bg-white/10 px-4 py-2"
            >
              ‹ 이전
            </Link>
          ) : (
            <span />
          )}
          <span className="text-white/60">
            {page} / {pages}
          </span>
          {page < pages ? (
            <Link
              href={href(page + 1)}
              className="rounded-lg bg-white/10 px-4 py-2"
            >
              다음 ›
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </main>
  );
}
