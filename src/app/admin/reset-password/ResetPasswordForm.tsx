"use client";

import { Check, Eye, EyeOff, KeyRound } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { resetPasswordAction, type ResetPasswordState } from "./actions";

const initialState: ResetPasswordState = {};

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  if (state.success) {
    return (
      <div className="mt-8">
        <div className="flex size-12 items-center justify-center rounded-full bg-[#dff4eb] text-[#245e52]">
          <Check size={23} aria-hidden />
        </div>
        <h2 className="mt-5 text-2xl font-semibold">Password updated</h2>
        <p className="mt-2 text-sm leading-6 text-[#486d69]">
          Existing Sessions were signed out. Sign in again with your new password.
        </p>
        <Link
          href="/admin/login?message=password-updated"
          className="mt-6 flex min-h-12 items-center justify-center rounded-full bg-ink px-5 font-semibold text-white"
        >
          Continue to Sign In
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-8 space-y-5">
      {(["password", "confirmation"] as const).map((name) => (
        <div key={name}>
          <label htmlFor={name} className="text-sm font-medium text-[#315b57]">
            {name === "password" ? "New password" : "Confirm new password"}
          </label>
          <div className="relative mt-2">
            <input
              id={name}
              name={name}
              type={showPassword ? "text" : "password"}
              autoComplete={name === "password" ? "new-password" : "new-password"}
              minLength={12}
              maxLength={128}
              required
              disabled={pending}
              className="min-h-12 w-full rounded-2xl border border-[#bedbd5] bg-white px-4 pr-14 text-base text-ink shadow-sm outline-none transition focus:border-action-blue focus:ring-4 focus:ring-[#34908b]/15 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute inset-y-0 right-0 flex min-w-12 items-center justify-center rounded-r-2xl text-[#486d69] hover:text-ink"
              aria-label={showPassword ? "Hide passwords" : "Show passwords"}
            >
              {showPassword ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
            </button>
          </div>
        </div>
      ))}
      <p className="text-xs leading-5 text-[#67817e]">
        Use at least 12 characters. A unique password from a password manager is recommended.
      </p>
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
        <KeyRound size={18} aria-hidden />
        {pending ? "Updating…" : "Set New Password"}
      </button>
    </form>
  );
}
