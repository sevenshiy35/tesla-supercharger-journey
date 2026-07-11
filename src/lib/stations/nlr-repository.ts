import "server-only";

import { unstable_cache } from "next/cache";
import { getJourneySummary, getStateSummary } from "@/lib/journey/calculations";
import type { CheckInRecord, JourneySummary, StateJourneySummary } from "@/types/journey";
import type { SuperchargerStation } from "@/types/station";
import { StationDataConfigurationError, StationDataRequestError, StationDataValidationError } from "./errors";
import { applyVisitedStationIds, nlrStationsResponseSchema, normalizeNlrStations } from "./mappers";
import type { StationsRepository } from "./repository";

const NLR_STATIONS_ENDPOINT = "https://developer.nlr.gov/api/alt-fuel-stations/v1.json";
const NLR_REVALIDATE_SECONDS = 86_400;

const getCachedNlrStationDirectory = unstable_cache(
  async () => {
    const apiKey = process.env.NLR_API_KEY?.trim();

    if (!apiKey) {
      throw new StationDataConfigurationError("Add NLR_API_KEY to `.env.local`.");
    }

    const url = new URL(NLR_STATIONS_ENDPOINT);
    url.search = new URLSearchParams({
      api_key: apiKey,
      fuel_type: "ELEC",
      country: "US",
      ev_network: "Tesla",
      access: "public",
      status: "E",
      limit: "all",
    }).toString();

    let response: Response;

    try {
      // The raw NLR response is about 30 MB, so cache the normalized result below instead.
      response = await fetch(url, { cache: "no-store" });
    } catch {
      throw new StationDataRequestError("The NLR station request could not be completed.");
    }

    if (!response.ok) {
      throw new StationDataRequestError(`The NLR station request failed with status ${response.status}.`);
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new StationDataValidationError("The NLR response was not valid JSON.");
    }

    const parsed = nlrStationsResponseSchema.safeParse(payload);

    if (!parsed.success) {
      throw new StationDataValidationError("The NLR response did not match the expected station structure.");
    }

    const stations = normalizeNlrStations(parsed.data.fuel_stations, []);

    if (parsed.data.fuel_stations.length > 0 && stations.length === 0) {
      throw new StationDataValidationError("The NLR response contained no stations with valid coordinates.");
    }

    return stations;
  },
  ["nlr-tesla-supercharger-directory-v1"],
  {
    revalidate: NLR_REVALIDATE_SECONDS,
    tags: ["nlr-tesla-supercharger-directory"],
  },
);

export class NlrStationsRepository implements StationsRepository {
  constructor(private readonly visitedExternalIds: readonly string[]) {}

  async getAllStations(): Promise<SuperchargerStation[]> {
    const stations = await getCachedNlrStationDirectory();
    return applyVisitedStationIds(stations, this.visitedExternalIds);
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

  async getLatestCheckIns(): Promise<CheckInRecord[]> {
    return [];
  }
}
