import Link from "next/link";
import { notFound } from "next/navigation";
import AdminDashboard from "@/components/AdminDashboard";
import { requireAdmin } from "@/lib/admin/server";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await requireAdmin())) notFound();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center gap-3">
        <Link
          href="/home"
          aria-label="홈으로"
          className="flex size-11 items-center justify-center rounded-full bg-white/10 text-xl"
        >
          ←
        </Link>
        <h1 className="text-2xl font-black">관리자</h1>
      </header>
      <AdminDashboard />
    </main>
  );
}
