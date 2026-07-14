import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function getRequestOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  const protocol = forwardedProtocol ?? requestUrl.protocol.replace(":", "");

  if (!host || (protocol !== "http" && protocol !== "https")) {
    return requestUrl.origin;
  }

  return `${protocol}://${host}`;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = getRequestOrigin(request);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL("/admin/reset-password", origin));
    }
  }

  return NextResponse.redirect(
    new URL("/admin/reset-password?error=invalid-or-expired", origin),
  );
}
