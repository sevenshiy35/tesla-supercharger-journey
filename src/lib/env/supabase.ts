export interface SupabasePublicEnvironment {
  url: string;
  publishableKey: string;
}

function requirePublicEnvironmentValue(
  name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  value: string | undefined,
) {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    throw new Error(
      `Missing ${name}. Add it to .env.local and restart the Next.js development server.`,
    );
  }

  return normalizedValue;
}

export function getSupabasePublicEnvironment(): SupabasePublicEnvironment {
  const url = requirePublicEnvironmentValue(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const publishableKey = requirePublicEnvironmentValue(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  try {
    new URL(url);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be a valid absolute URL. Check .env.local and restart the Next.js development server.",
    );
  }

  return { url, publishableKey };
}
