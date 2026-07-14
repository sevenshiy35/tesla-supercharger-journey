"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export interface ForgotPasswordState {
  success?: boolean;
  error?: string;
}

function normalizeOrigin(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

async function getRequestOrigin() {
  const configuredOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? null);
  if (configuredOrigin) return configuredOrigin;

  const requestHeaders = await headers();
  const requestOrigin = normalizeOrigin(requestHeaders.get("origin"));
  if (requestOrigin) return requestOrigin;

  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) return null;
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return normalizeOrigin(`${protocol}://${host}`);
}

export async function forgotPasswordAction(
  _previousState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return { error: "Enter a valid email address." };
  }

  const origin = await getRequestOrigin();
  if (!origin) {
    return { error: "The site URL could not be determined. Please try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: new URL("/auth/callback", origin).toString(),
  });

  if (error) {
    return { error: "A recovery email could not be sent right now. Wait a moment and try again." };
  }

  // Keep the response identical for existing and unknown email addresses.
  return { success: true };
}
