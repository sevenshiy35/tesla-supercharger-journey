"use server";

import { createClient } from "@/lib/supabase/server";

export interface ResetPasswordState {
  success?: boolean;
  error?: string;
}

export async function resetPasswordAction(
  _previousState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (password.length < 12) {
    return { error: "Use at least 12 characters for the new password." };
  }
  if (password.length > 128) {
    return { error: "The password must be 128 characters or fewer." };
  }
  if (password !== confirmation) {
    return { error: "The two passwords do not match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "This recovery link is invalid or has expired. Request a new one." };
  }

  const { data: admin, error: adminError } = await supabase
    .from("app_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminError || !admin) {
    await supabase.auth.signOut();
    return { error: "This account is not authorized for the journey admin." };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    return {
      error: "Supabase did not accept that password. Use a longer, unique password with letters, numbers, and symbols.",
    };
  }

  await supabase.auth.signOut({ scope: "global" });
  return { success: true };
}
