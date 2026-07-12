import "server-only";

import { visitedStationExternalIds } from "@/data/visited-stations.local";
import { getSupabasePublicEnvironment } from "@/lib/env/supabase";
import type { StationDataSource } from "@/types/station-data";
import { parseStationDataSource } from "./data-source";
import { StationDataConfigurationError } from "./errors";
import { MockStationsRepository } from "./mock-repository";
import { NlrStationsRepository } from "./nlr-repository";
import type { StationsRepository } from "./repository";
import { SupabasePublicStationsRepository } from "./supabase-public-repository";

export interface StationsRepositorySelection {
  dataSource: StationDataSource;
  repository: StationsRepository;
}

export function getConfiguredStationDataSource(): StationDataSource {
  return parseStationDataSource(process.env.STATION_DATA_SOURCE);
}

export function createStationsRepository(): StationsRepositorySelection {
  const dataSource = getConfiguredStationDataSource();

  if (dataSource === "sample") {
    return {
      dataSource,
      repository: new MockStationsRepository(),
    };
  }

  if (dataSource === "supabase") {
    try {
      getSupabasePublicEnvironment();
    } catch {
      throw new StationDataConfigurationError(
        "Add the Supabase environment variables and restart the server.",
      );
    }

    return {
      dataSource,
      repository: new SupabasePublicStationsRepository(),
    };
  }

  const apiKey = process.env.NLR_API_KEY?.trim();

  if (!apiKey) {
    throw new StationDataConfigurationError("Add NLR_API_KEY to `.env.local`.");
  }

  return {
    dataSource,
    repository: new NlrStationsRepository(visitedStationExternalIds),
  };
}
