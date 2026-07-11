export interface JourneySummary {
  totalStations: number;
  visitedStations: number;
  remainingStations: number;
  completionPercentage: number;
  statesVisited: number;
  lastUpdated: string;
}

export interface StateJourneySummary {
  stateCode: string;
  stateName: string;
  totalStations: number;
  visitedStations: number;
  remainingStations: number;
  completionPercentage: number;
  firstCheckIn?: string;
  latestCheckIn?: string;
  lastUpdated: string;
}

export interface CheckInRecord {
  id: string;
  stationId: string;
  stationName: string;
  city: string;
  state: string;
  checkedInAt: string;
  energyKwh?: number;
  costUsd?: number;
  note?: string;
  imageUrl?: string;
}

export interface NearbyCheckInCandidate {
  stationId: string;
  distanceMiles: number;
  confidence: "high" | "medium" | "low";
}

export interface QuickCheckInDraft {
  stationId: string;
  capturedAt: string;
  latitude?: number;
  longitude?: number;
  photoFileIds?: string[];
  energyKwh?: number;
  costUsd?: number;
  note?: string;
}

export interface RoutePlanningRequest {
  origin: string;
  destination: string;
  searchRadiusMiles: number;
  includeUnvisitedOnly: boolean;
}

export interface RoutePlanningResult {
  stationIds: string[];
  estimatedDetourMiles?: number;
  estimatedAdditionalCheckIns: number;
}
