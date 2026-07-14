import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth/admin";
import { LoginForm } from "./LoginForm";

interface AdminLoginPageProps {
  searchParams: Promise<{ error?: string; message?: string }>;
}

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const admin = await getCurrentAdmin();
  const { error, message } = await searchParams;

  if (admin) {
    redirect("/admin");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#fffdf2] px-5 py-12">
      <section className="w-full max-w-md rounded-[32px] border border-[#d5e6df] bg-white/90 p-6 shadow-[0_24px_80px_rgba(23,63,60,0.12)] backdrop-blur sm:p-9">
        <Link href="/" className="text-sm font-semibold tracking-wide text-action-blue">
          MyTesla2026Journey
        </Link>
        <h1 className="mt-5 text-[38px] font-semibold leading-none tracking-[-0.035em] text-ink">
          Welcome back.
        </h1>
        <p className="mt-3 text-base leading-7 text-[#486d69]">
          Sign in with the administrator account already registered in Supabase.
        </p>
        {error === "not-authorized" ? (
          <p role="alert" className="mt-5 rounded-2xl border border-[#d9a8aa] bg-[#fff1f1] px-4 py-3 text-sm text-[#8d2930]">
            The signed-in account is not authorized for this admin. Sign in with an allowlisted account.
          </p>
        ) : null}
        {message === "password-updated" ? (
          <p role="status" className="mt-5 rounded-2xl border border-[#b9ded1] bg-[#e7f5ef] px-4 py-3 text-sm text-[#245e52]">
            Password updated. Sign in with your new password.
          </p>
        ) : null}
        <LoginForm />
        <p className="mt-7 text-center text-xs leading-5 text-[#67817e]">
          Public registration remains intentionally unavailable.
        </p>
      </section>
    </main>
  );
}
