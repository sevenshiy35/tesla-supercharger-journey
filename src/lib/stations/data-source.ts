import { stationDataSourceSchema, type StationDataSource } from "@/types/station-data";
import { StationDataConfigurationError } from "./errors";

export function parseStationDataSource(value: string | undefined): StationDataSource {
  const parsed = stationDataSourceSchema.safeParse(value?.trim() || "sample");

  if (!parsed.success) {
    throw new StationDataConfigurationError(
      "STATION_DATA_SOURCE must be sample, nlr, or supabase.",
    );
  }

  return parsed.data;
}
