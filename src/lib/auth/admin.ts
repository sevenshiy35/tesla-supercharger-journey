import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface CurrentAdmin {
  id: string;
  email: string;
  createdAt: string;
}

/**
 * Verify the current cookie-backed user with Supabase Auth, then confirm that
 * the same UUID is allowlisted in app_admins. No administrator-list data is
 * returned to the caller.
 */
export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data: admin, error: adminError } = await supabase
    .from("app_admins")
    .select("created_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminError || !admin) {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? "Administrator",
    createdAt: admin.created_at,
  };
}

export async function requireAdmin(): Promise<CurrentAdmin> {
  const admin = await getCurrentAdmin();

  if (!admin) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    redirect(user ? "/admin/login?error=not-authorized" : "/admin/login");
  }

  return admin;
}
