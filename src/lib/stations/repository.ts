import type { CheckInRecord, JourneySummary, StateJourneySummary } from "@/types/journey";
import type { SuperchargerStation } from "@/types/station";

export interface StationsRepository {
  getAllStations(): Promise<SuperchargerStation[]>;
  getStationsByState(stateCode: string): Promise<SuperchargerStation[]>;
  getJourneySummary(stations?: SuperchargerStation[]): Promise<JourneySummary>;
  getStateSummary(stateCode: string, stations?: SuperchargerStation[]): Promise<StateJourneySummary>;
  getLatestCheckIns(limit?: number): Promise<CheckInRecord[]>;
}
