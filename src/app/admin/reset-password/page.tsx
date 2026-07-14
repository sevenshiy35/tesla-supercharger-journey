import Link from "next/link";
import { getCurrentAdmin } from "@/lib/auth/admin";
import { ResetPasswordForm } from "./ResetPasswordForm";

interface ResetPasswordPageProps {
  searchParams: Promise<{ error?: string }>;
}

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const [{ error }, admin] = await Promise.all([searchParams, getCurrentAdmin()]);
  const invalidRecovery = error === "invalid-or-expired" || !admin;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#fffdf2] px-5 py-12">
      <section className="w-full max-w-md rounded-[32px] border border-[#d5e6df] bg-white/90 p-6 shadow-[0_24px_80px_rgba(23,63,60,0.12)] backdrop-blur sm:p-9">
        <Link href="/" className="text-sm font-semibold tracking-wide text-action-blue">
          MyTesla2026Journey
        </Link>
        <h1 className="mt-5 text-[38px] font-semibold leading-none tracking-[-0.035em] text-ink">
          Choose a new password.
        </h1>
        {invalidRecovery ? (
          <div className="mt-6">
            <p role="alert" className="rounded-2xl border border-[#d9a8aa] bg-[#fff1f1] px-4 py-3 text-sm leading-6 text-[#8d2930]">
              This recovery link is invalid, expired, or was opened without its recovery Session. Request a fresh link and open the newest email.
            </p>
            <Link
              href="/admin/forgot-password"
              className="mt-5 flex min-h-12 items-center justify-center rounded-full bg-ink px-5 font-semibold text-white"
            >
              Request Another Link
            </Link>
          </div>
        ) : (
          <ResetPasswordForm />
        )}
      </section>
    </main>
  );
}
