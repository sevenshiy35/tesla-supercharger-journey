import { sampleCheckIns, sampleStations } from "@/data/stations.sample";
import { getJourneySummary, getStateSummary } from "@/lib/journey/calculations";
import type { CheckInRecord, JourneySummary, StateJourneySummary } from "@/types/journey";
import type { SuperchargerStation } from "@/types/station";
import type { StationsRepository } from "./repository";

export class MockStationsRepository implements StationsRepository {
  async getAllStations(): Promise<SuperchargerStation[]> {
    return sampleStations;
  }

  async getStationsByState(stateCode: string): Promise<SuperchargerStation[]> {
    return sampleStations.filter((station) => station.state === stateCode);
  }

  async getJourneySummary(stations = sampleStations): Promise<JourneySummary> {
    return getJourneySummary(stations);
  }

  async getStateSummary(
    stateCode: string,
    stations = sampleStations,
  ): Promise<StateJourneySummary> {
    return getStateSummary(stations, stateCode);
  }

  async getLatestCheckIns(limit = 6): Promise<CheckInRecord[]> {
    return sampleCheckIns
      .slice()
      .sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt))
      .slice(0, limit);
  }
}
