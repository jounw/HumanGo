// 데모 모드 저장소: Supabase 대신 브라우저 IndexedDB 에 포획 기록과 이미지를 저장한다.
import type { Rarity } from "@/lib/constants";
import { isRarity } from "@/lib/game/rarity";
import type { DexItem } from "@/lib/dex";

export const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";
export const DEMO_NICKNAME = "데모";

export type DemoRecord = {
  id: string;
  name: string;
  rarity: Rarity;
  capturedAt: string;
  bodyId: string;
  character: Blob;
  face?: Blob; // 3D 보기용 (이전 데모 기록에는 없음)
  scene: Blob;
  cutout: Blob;
};

const DB = "humango-demo";
const STORE = "captures";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const demoSave = (r: DemoRecord) => tx("readwrite", (s) => s.put(r));
export const demoGet = (id: string) =>
  tx<DemoRecord | undefined>("readonly", (s) => s.get(id));
export const demoDelete = (id: string) => tx("readwrite", (s) => s.delete(id));

export async function demoList(): Promise<DemoRecord[]> {
  const all = await tx<DemoRecord[]>("readonly", (s) => s.getAll());
  return all.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

export async function demoRename(id: string, name: string) {
  const r = await demoGet(id);
  if (r) await demoSave({ ...r, name });
}

export function toItem(r: DemoRecord): DexItem {
  return {
    id: r.id,
    name: r.name,
    rarity: isRarity(r.rarity) ? r.rarity : "common",
    capturedAt: r.capturedAt,
    ownerId: "demo",
    ownerNickname: DEMO_NICKNAME,
    characterUrl: URL.createObjectURL(r.character),
  };
}
