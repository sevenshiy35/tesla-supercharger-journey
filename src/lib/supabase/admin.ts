import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicEnvironment } from "@/lib/env/supabase";
import type { Database } from "@/types/database";

/**
 * Server-only client used solely after an explicit public-photo eligibility
 * check. Never import this module from a Client Component.
 */
export function createSupabaseAdminClient() {
  const { url } = getSupabasePublicEnvironment();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error("Public photo signing is not configured.");
  }
  return createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
