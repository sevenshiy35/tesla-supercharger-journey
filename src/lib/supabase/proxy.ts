import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnvironment } from "@/lib/env/supabase";
import type { Database } from "@/types/database";

/** Refresh a Supabase Auth session and copy every rotated cookie to the response. */
export async function refreshAuthSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabasePublicEnvironment();
  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // This network-validated call is intentionally kept between client creation
  // and returning the response so token refresh cookies cannot be lost.
  await supabase.auth.getUser();
  return response;
}
