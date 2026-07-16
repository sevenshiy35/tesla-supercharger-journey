"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { validateStationPayToPark } from "@/lib/trips/validation";

export interface StationPayToParkMutationState {
  ok: boolean;
  stationId?: string;
  payToPark?: boolean;
  updatedAt?: string;
  error?: string;
}

function safePreferenceError(message: string) {
  if (/station.*not found|does not exist/i.test(message)) return "This Supercharger is no longer available.";
  if (/administrator|authentication/i.test(message)) return "Your administrator session has expired.";
  return "The pay-to-park marker could not be saved. Please try again.";
}

export async function setStationPayToParkAction(
  input: unknown,
): Promise<StationPayToParkMutationState> {
  await requireAdmin();
  const validation = validateStationPayToPark(input);
  if (!validation.success) {
    return { ok: false, error: validation.error.issues[0]?.message ?? "The Station preference is invalid." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_set_station_pay_to_park", {
    p_station_id: validation.data.stationId,
    p_pay_to_park: validation.data.payToPark,
  });
  if (error || !data?.[0]) {
    return { ok: false, error: safePreferenceError(error?.message ?? "") };
  }

  // The database write is authoritative. A cache refresh failure must not turn
  // a successful, idempotent preference change into a false save failure.
  try {
    revalidatePath("/admin", "layout");
  } catch {
    // The client already applies the returned state optimistically.
  }
  return {
    ok: true,
    stationId: data[0].station_id,
    payToPark: data[0].pay_to_park,
    updatedAt: data[0].updated_at,
  };
}
