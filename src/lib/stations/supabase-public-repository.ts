import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getJourneySummary, getStateSummary } from "@/lib/journey/calculations";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { CheckInRecord, JourneySummary, StateJourneySummary } from "@/types/journey";
import type { SuperchargerStation } from "@/types/station";
import { StationDataRequestError, StationDataValidationError } from "./errors";
import { readAllPages } from "./pagination";
import { mapPublicStationStatusRows, type PublicStationStatusRow } from "./supabase-public-mappers";
import type { StationsRepository } from "./repository";

const PUBLIC_STATION_COLUMNS =
  "id,external_id,name,address,city,state,postal_code,latitude,longitude,stall_count,max_power_kw,operational_status,source_updated_at,visited,latest_visit_at";

const latestCheckInRowSchema = z.object({
  id: z.string(),
  checked_in_at: z.string(),
  checked_in_timezone: z.string(),
  checked_in_time_precision: z.enum(["exact", "date_only"]),
  station: z.object({
    id: z.string(),
    name: z.string(),
    city: z.string(),
    state: z.string(),
  }),
  charging_session: z
    .object({
      energy_kwh: z.number().nullable(),
      cost_usd: z.number().nullable(),
    })
    .nullable(),
});

type PublicClientFactory = () => Promise<SupabaseClient<Database>>;

export class SupabasePublicStationsRepository implements StationsRepository {
  constructor(
    private readonly createPublicClient: PublicClientFactory = createSupabaseServerClient,
  ) {}

  async getAllStations(): Promise<SuperchargerStation[]> {
    const client = await this.createPublicClient();
    const rows = await readAllPages<PublicStationStatusRow>(async (from, to) => {
      const { data, error } = await client
        .from("public_station_status")
        .select(PUBLIC_STATION_COLUMNS)
        .order("external_id", { ascending: true })
        .range(from, to);

      if (error) {
        throw new StationDataRequestError("The Supabase station directory could not be loaded.");
      }

      return (data ?? []) as PublicStationStatusRow[];
    });

    return mapPublicStationStatusRows(rows);
  }

  async getStationsByState(stateCode: string): Promise<SuperchargerStation[]> {
    const stations = await this.getAllStations();
    return stations.filter((station) => station.state === stateCode.toUpperCase());
  }

  async getJourneySummary(stations?: SuperchargerStation[]): Promise<JourneySummary> {
    return getJourneySummary(stations ?? (await this.getAllStations()));
  }

  async getStateSummary(
    stateCode: string,
    stations?: SuperchargerStation[],
  ): Promise<StateJourneySummary> {
    return getStateSummary(stations ?? (await this.getAllStations()), stateCode);
  }

  async getLatestCheckIns(limit = 6): Promise<CheckInRecord[]> {
    const client = await this.createPublicClient();
    const { data, error } = await client
      .from("station_visits")
      .select(`
        id,
        checked_in_at,
        checked_in_timezone,
        checked_in_time_precision,
        station:stations!station_visits_station_id_fkey(id, name, city, state),
        charging_session:charging_sessions(energy_kwh, cost_usd)
      `)
      .eq("is_public", true)
      .order("checked_in_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new StationDataRequestError("The latest public check-ins could not be loaded.");
    }

    return (data ?? []).map((row) => {
      const parsed = latestCheckInRowSchema.safeParse(row);

      if (!parsed.success) {
        throw new StationDataValidationError("A public check-in row did not match the expected structure.");
      }

      const value = parsed.data;
      return {
        id: value.id,
        stationId: value.station.id,
        stationName: value.station.name,
        city: value.station.city,
        state: value.station.state,
        checkedInAt: value.checked_in_at,
        checkedInTimezone: value.checked_in_timezone,
        checkedInTimePrecision: value.checked_in_time_precision,
        energyKwh: value.charging_session?.energy_kwh ?? undefined,
        costUsd: value.charging_session?.cost_usd ?? undefined,
      };
    });
  }
}
