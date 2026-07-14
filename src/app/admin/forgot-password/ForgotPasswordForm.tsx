"use client";

import { ArrowLeft, Mail } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, initialState);

  if (state.success) {
    return (
      <div className="mt-8">
        <div className="flex size-12 items-center justify-center rounded-full bg-[#dff4eb] text-[#245e52]">
          <Mail size={22} aria-hidden />
        </div>
        <h2 className="mt-5 text-2xl font-semibold">Check your email</h2>
        <p className="mt-2 text-sm leading-6 text-[#486d69]">
          If that address belongs to an account, a recovery link has been sent. Open the newest email in the same browser where possible.
        </p>
        <p className="mt-3 rounded-2xl bg-[#fff5e6] px-4 py-3 text-sm leading-6 text-[#815719]">
          The link expires. If it opens the home page again, verify the Supabase Redirect URL configuration before requesting another email.
        </p>
        <Link
          href="/admin/login"
          className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-full border border-[#bedbd5] px-5 font-semibold"
        >
          <ArrowLeft size={18} aria-hidden /> Back to Sign In
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <div>
        <label htmlFor="recovery-email" className="text-sm font-medium text-[#315b57]">
          Administrator email
        </label>
        <input
          id="recovery-email"
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          disabled={pending}
          className="mt-2 min-h-12 w-full rounded-2xl border border-[#bedbd5] bg-white px-4 text-base text-ink shadow-sm outline-none transition focus:border-action-blue focus:ring-4 focus:ring-[#34908b]/15 disabled:opacity-60"
          placeholder="you@example.com"
        />
      </div>
      {state.error ? (
        <p role="alert" className="rounded-2xl border border-[#d9a8aa] bg-[#fff1f1] px-4 py-3 text-sm text-[#8d2930]">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Mail size={18} aria-hidden />
        {pending ? "Sending…" : "Send Recovery Link"}
      </button>
      <Link
        href="/admin/login"
        className="flex min-h-11 items-center justify-center gap-2 text-sm font-semibold text-action-blue"
      >
        <ArrowLeft size={17} aria-hidden /> Back to Sign In
      </Link>
    </form>
  );
}
