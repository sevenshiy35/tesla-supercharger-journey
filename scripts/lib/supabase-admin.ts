import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/types/database";

function requireServerEnvironmentValue(
  name:
    | "NEXT_PUBLIC_SUPABASE_URL"
    | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    | "SUPABASE_SECRET_KEY",
  value: string | undefined,
) {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`Missing ${name}. Add it to .env.local before running the station sync.`);
  }

  return normalized;
}

function createScriptClient(key: string, url: string): SupabaseClient<Database> {
  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export function createSupabaseScriptReadClient(): SupabaseClient<Database> {
  const url = requireServerEnvironmentValue(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const publishableKey = requireServerEnvironmentValue(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  try {
    new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid absolute URL.");
  }

  return createScriptClient(publishableKey, url);
}

export function createSupabaseAdminClient(): SupabaseClient<Database> {
  const url = requireServerEnvironmentValue(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const secretKey = requireServerEnvironmentValue(
    "SUPABASE_SECRET_KEY",
    process.env.SUPABASE_SECRET_KEY,
  );

  try {
    new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid absolute URL.");
  }

  return createScriptClient(secretKey, url);
}
