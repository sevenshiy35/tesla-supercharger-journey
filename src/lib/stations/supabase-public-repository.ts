import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getJourneySummary, getStateSummary } from "@/lib/journey/calculations";
import { createPublicClient as createSupabasePublicClient } from "@/lib/supabase/public";
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

const publicVisitPhotoSchema = z.object({
  id: z.string(),
  visit_id: z.string(),
  caption: z.string().nullable(),
  is_cover: z.boolean(),
  display_order: z.number(),
  created_at: z.string(),
});

type PublicClientFactory = () => Promise<SupabaseClient<Database>>;

export class SupabasePublicStationsRepository implements StationsRepository {
  constructor(
    private readonly createPublicClient: PublicClientFactory = createSupabasePublicClient,
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

    const parsedVisits = (data ?? []).map((row) => {
      const parsed = latestCheckInRowSchema.safeParse(row);
      if (!parsed.success) {
        throw new StationDataValidationError("A public check-in row did not match the expected structure.");
      }
      return parsed.data;
    });
    const visitIds = parsedVisits.map((visit) => visit.id);
    const photosByVisit = new Map<string, Array<z.infer<typeof publicVisitPhotoSchema>>>();
    if (visitIds.length > 0) {
      const { data: photoData, error: photoError } = await client
        .from("public_visit_photos")
        .select("id,visit_id,caption,is_cover,display_order,created_at")
        .in("visit_id", visitIds)
        .order("is_cover", { ascending: false })
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      const photoViewIsPending = photoError?.code === "PGRST205" || photoError?.code === "42P01";
      if (photoError && !photoViewIsPending) {
        throw new StationDataRequestError("Public check-in covers could not be loaded.");
      }
      if (!photoError) {
        for (const row of photoData ?? []) {
          const parsed = publicVisitPhotoSchema.safeParse(row);
          if (!parsed.success) continue;
          const photos = photosByVisit.get(parsed.data.visit_id) ?? [];
          photos.push(parsed.data);
          photosByVisit.set(parsed.data.visit_id, photos);
        }
      }
    }

    return parsedVisits.map((value) => {
      const cover = photosByVisit.get(value.id)?.[0];
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
        imageUrl: cover ? `/api/public/photos/${cover.id}` : undefined,
        imageAlt: cover?.caption?.trim() || (cover ? `Tesla Supercharger visit photo at ${value.station.name}` : undefined),
        detailUrl: `/visits/${value.id}`,
      };
    });
  }
}
