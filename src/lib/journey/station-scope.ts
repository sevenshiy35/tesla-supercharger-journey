import type { CheckInRecord } from "@/types/journey";
import type { SuperchargerStation } from "@/types/station";

const excludedStateCodes = new Set(["AK", "HI"]);

export function isJourneyStateIncluded(stateCode: string) {
  return !excludedStateCodes.has(stateCode);
}

export function filterJourneyStations(stations: SuperchargerStation[]) {
  return stations.filter((station) => isJourneyStateIncluded(station.state));
}

export function filterJourneyCheckIns(checkIns: CheckInRecord[]) {
  return checkIns.filter((checkIn) => isJourneyStateIncluded(checkIn.state));
}
