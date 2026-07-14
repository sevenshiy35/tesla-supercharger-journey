"use client";

import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  useEffect(() => {
    if (state.success) {
      router.replace("/admin");
      router.refresh();
    }
  }, [router, state.success]);

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <div>
        <label htmlFor="email" className="text-sm font-medium text-[#315b57]">
          Email
        </label>
        <input
          id="email"
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

      <div>
        <label htmlFor="password" className="text-sm font-medium text-[#315b57]">
          Password
        </label>
        <div className="relative mt-2">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            disabled={pending}
            className="min-h-12 w-full rounded-2xl border border-[#bedbd5] bg-white px-4 pr-14 text-base text-ink shadow-sm outline-none transition focus:border-action-blue focus:ring-4 focus:ring-[#34908b]/15 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            className="absolute inset-y-0 right-0 flex min-w-12 items-center justify-center rounded-r-2xl text-[#486d69] hover:text-ink"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
          </button>
        </div>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-2xl border border-[#d9a8aa] bg-[#fff1f1] px-4 py-3 text-sm text-[#8d2930]"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 font-semibold text-white shadow-sm transition hover:bg-[#215a55] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LockKeyhole size={18} aria-hidden />
        {pending ? "Signing in…" : "Sign In"}
      </button>
      <Link
        href="/admin/forgot-password"
        className="flex min-h-11 items-center justify-center text-sm font-semibold text-action-blue hover:underline"
      >
        Forgot password?
      </Link>
    </form>
  );
}
