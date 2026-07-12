import "server-only";

import { unstable_cache } from "next/cache";
import { getJourneySummary, getStateSummary } from "@/lib/journey/calculations";
import type { CheckInRecord, JourneySummary, StateJourneySummary } from "@/types/journey";
import type { SuperchargerStation } from "@/types/station";
import { StationDataConfigurationError } from "./errors";
import { applyVisitedStationIds } from "./mappers";
import { fetchNlrStationDirectory } from "./nlr-source";
import type { StationsRepository } from "./repository";

const NLR_REVALIDATE_SECONDS = 86_400;

const getCachedNlrStationDirectory = unstable_cache(
  async () => {
    const apiKey = process.env.NLR_API_KEY?.trim();

    if (!apiKey) {
      throw new StationDataConfigurationError("Add NLR_API_KEY to `.env.local`.");
    }

    // The raw NLR response is about 30 MB, so cache only the normalized station directory.
    return (await fetchNlrStationDirectory({ apiKey })).stations;
  },
  ["nlr-tesla-supercharger-directory-v2"],
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
