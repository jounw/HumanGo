import { NextResponse } from "next/server";
import {
  dbStats,
  deployInfo,
  hostStats,
  requireAdmin,
  trafficStats,
} from "@/lib/admin/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const a = await requireAdmin();
  // 관리자가 아니면 존재 자체를 숨긴다
  if (!a) return new NextResponse(null, { status: 404 });
  const [db, host, traffic, deploy] = await Promise.all([
    dbStats(a.admin),
    hostStats(),
    trafficStats(),
    deployInfo(a.admin),
  ]);
  return NextResponse.json(
    { at: Date.now(), db, host, traffic, deploy },
    { headers: { "cache-control": "no-store" } },
  );
}
