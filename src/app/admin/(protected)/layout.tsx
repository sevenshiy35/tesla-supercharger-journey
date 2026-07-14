import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/auth/admin";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="min-h-dvh bg-[#f7f5e9] text-ink">
      <AdminNav email={admin.email} />
      <div className="mx-auto min-h-dvh w-full max-w-7xl px-5 pb-28 pt-7 sm:px-8 lg:ml-64 lg:w-[calc(100%-16rem)] lg:px-10 lg:pb-12 lg:pt-10">
        {children}
      </div>
    </div>
  );
}
