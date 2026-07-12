import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicEnvironment } from "@/lib/env/supabase";
import type { Database } from "@/types/database";

/** Create a Supabase client for use in Client Components only. */
export function createClient() {
  const { url, publishableKey } = getSupabasePublicEnvironment();

  return createBrowserClient<Database>(url, publishableKey);
}
