// 도감 데이터 조회 (서버 전용). 이미지는 private 버킷이라 signed URL 로 내려준다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET, SIGNED_URL_TTL_SEC, type Rarity } from "@/lib/constants";
import { isRarity } from "@/lib/game/rarity";
import { toBrowserUrl } from "@/lib/supabase/config";

export type DexItem = {
  id: string;
  name: string;
  rarity: Rarity;
  capturedAt: string;
  ownerId: string;
  ownerNickname: string;
  isPrivate?: boolean;
  characterUrl: string | null;
};

type Row = {
  id: string;
  name: string;
  rarity: string;
  character_path: string;
  captured_at: string;
  owner_id: string;
  is_private: boolean;
  owner: { nickname: string } | { nickname: string }[] | null;
};

const COLUMNS =
  "id,name,rarity,character_path,captured_at,owner_id,is_private,owner:profiles(nickname)";

export async function signUrls(supabase: SupabaseClient, paths: string[]) {
  const map = new Map<string, string>();
  if (!paths.length) return map;
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SEC);
  for (const d of data ?? [])
    if (d.path && d.signedUrl) map.set(d.path, toBrowserUrl(d.signedUrl));
  return map;
}

function nickname(owner: Row["owner"]) {
  const o = Array.isArray(owner) ? owner[0] : owner;
  return o?.nickname ?? "알 수 없음";
}

export async function listCaptures(
  supabase: SupabaseClient,
  opts: { ownerId?: string; limit?: number } = {},
): Promise<DexItem[]> {
  let q = supabase
    .from("captures")
    .select(COLUMNS)
    .order("captured_at", { ascending: false });
  if (opts.ownerId) q = q.eq("owner_id", opts.ownerId);
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error || !data) return [];

  const rows = data as unknown as Row[];
  const urls = await signUrls(
    supabase,
    rows.map((r) => r.character_path),
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    rarity: isRarity(r.rarity) ? r.rarity : "common",
    capturedAt: r.captured_at,
    ownerId: r.owner_id,
    ownerNickname: nickname(r.owner),
    isPrivate: r.is_private,
    characterUrl: urls.get(r.character_path) ?? null,
  }));
}
