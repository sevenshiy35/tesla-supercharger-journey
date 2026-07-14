import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicEnvironment } from "@/lib/env/supabase";
import type { Database } from "@/types/database";

/** Cookie-free client for data that is intentionally readable through the anon role. */
export async function createPublicClient() {
  const { url, publishableKey } = getSupabasePublicEnvironment();
  return createClient<Database>(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
