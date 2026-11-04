import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/server";
import { BUCKET } from "@/lib/constants";
import { UUID } from "@/lib/battle/server";

export const dynamic = "force-dynamic";

// 관리자 전용: 캐릭터와 그 이미지 파일을 지운다. 되돌릴 수 없다.
export async function DELETE(
  _req: Request,
  ctx: RouteContext<"/api/admin/captures/[id]">,
) {
  const a = await requireAdmin();
  if (!a) return new NextResponse(null, { status: 404 }); // 관리자가 아니면 존재를 숨긴다
  const { id } = await ctx.params;
  if (!UUID.test(id))
    return NextResponse.json({ error: "잘못된 id" }, { status: 400 });

  const { data: row, error: readError } = await a.admin
    .from("captures")
    .select("id,character_path,face_path,scene_path,cutout_path")
    .eq("id", id)
    .maybeSingle();
  if (readError)
    return NextResponse.json({ error: "조회하지 못했어요." }, { status: 500 });
  if (!row) return NextResponse.json({ ok: true }); // 이미 없음

  // 행을 먼저 지우면 파일 경로를 잃으므로 파일 -> 행 순서 (사용자 삭제와 같은 규칙)
  const paths = [
    row.character_path,
    row.face_path,
    row.scene_path,
    row.cutout_path,
  ].filter(Boolean) as string[];
  const { error: fileError } = await a.admin.storage.from(BUCKET).remove(paths);
  if (fileError) {
    console.error("관리자 삭제: 파일 삭제 실패", fileError);
    return NextResponse.json(
      { error: "파일을 지우지 못했어요." },
      { status: 500 },
    );
  }
  const { error: rowError } = await a.admin
    .from("captures")
    .delete()
    .eq("id", id);
  if (rowError) {
    console.error("관리자 삭제: 행 삭제 실패", rowError);
    return NextResponse.json({ error: "삭제하지 못했어요." }, { status: 500 });
  }
  console.log(`[admin] ${a.user.email} deleted capture ${id}`);
  return NextResponse.json({ ok: true });
}
