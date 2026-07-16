import "server-only";

import { createClient } from "@/lib/supabase/server";

const PREFERENCE_PAGE_SIZE = 1_000;

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** Reads only one authenticated user's private preferences. */
export async function loadAdminPayToParkStationIds(
  supabase: ServerSupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const stationIds = new Set<string>();
  for (let page = 0; ; page += 1) {
    const from = page * PREFERENCE_PAGE_SIZE;
    const { data, error } = await supabase
      .from("station_user_preferences")
      .select("station_id")
      .eq("user_id", userId)
      .eq("pay_to_park", true)
      .order("station_id", { ascending: true })
      .range(from, from + PREFERENCE_PAGE_SIZE - 1);
    if (error) throw new Error("Personal Station preferences could not be loaded.");
    for (const row of data ?? []) stationIds.add(row.station_id);
    if ((data?.length ?? 0) < PREFERENCE_PAGE_SIZE) break;
  }
  return stationIds;
}
