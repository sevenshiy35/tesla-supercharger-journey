import "server-only";

import { visitedStationExternalIds } from "@/data/visited-stations.local";
import { stationDataSourceSchema, type StationDataSource } from "@/types/station-data";
import { StationDataConfigurationError } from "./errors";
import { MockStationsRepository } from "./mock-repository";
import { NlrStationsRepository } from "./nlr-repository";
import type { StationsRepository } from "./repository";

export interface StationsRepositorySelection {
  dataSource: StationDataSource;
  repository: StationsRepository;
}

export function getConfiguredStationDataSource(): StationDataSource {
  const parsed = stationDataSourceSchema.safeParse(process.env.STATION_DATA_SOURCE?.trim() || "sample");

  if (!parsed.success) {
    throw new StationDataConfigurationError("STATION_DATA_SOURCE must be either sample or nlr.");
  }

  return parsed.data;
}

export function createStationsRepository(): StationsRepositorySelection {
  const dataSource = getConfiguredStationDataSource();

  if (dataSource === "sample") {
    return {
      dataSource,
      repository: new MockStationsRepository(),
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
