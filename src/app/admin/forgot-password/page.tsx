import Link from "next/link";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#fffdf2] px-5 py-12">
      <section className="w-full max-w-md rounded-[32px] border border-[#d5e6df] bg-white/90 p-6 shadow-[0_24px_80px_rgba(23,63,60,0.12)] backdrop-blur sm:p-9">
        <Link href="/" className="text-sm font-semibold tracking-wide text-action-blue">
          MyTesla2026Journey
        </Link>
        <h1 className="mt-5 text-[38px] font-semibold leading-none tracking-[-0.035em] text-ink">
          Reset your password.
        </h1>
        <p className="mt-3 text-base leading-7 text-[#486d69]">
          We’ll send a one-time recovery link to the administrator email.
        </p>
        <ForgotPasswordForm />
      </section>
    </main>
  );
}
