export type TripType = "one_way" | "round_trip";

export type TripPlanStatus = "draft" | "confirmed" | "active" | "completed" | "archived";

export type TripPlanStopLeg = "outbound" | "return";

export type TripPlanStopSource = "algorithm" | "manual";

export type TripPlanStopStatus = "planned" | "visited" | "skipped";

export type TripEndpointSource = "mapbox" | "current_location" | "station";
export type TripRouteKind = "base" | "planned";

export interface TripEndpoint {
  source: TripEndpointSource;
  label: string;
  fullAddress: string | null;
  latitude: number;
  longitude: number;
  stationId: string | null;
  providerId: string | null;
}

export interface TripRouteGeometry {
  type: "LineString";
  coordinates: [number, number][];
}

export interface TripRouteSegment {
  segmentIndex: number;
  leg: TripPlanStopLeg;
  startSequence: number | null;
  endSequence: number | null;
  provider: "mapbox";
  distanceMeters: number;
  durationSeconds: number;
  geometry: TripRouteGeometry;
}

export interface TripRouteMetrics {
  baseDistanceMeters: number;
  baseDurationSeconds: number;
  plannedDistanceMeters: number;
  plannedDriveSeconds: number;
  plannedStopSeconds: number;
  extraDistanceMeters: number;
  extraDurationSeconds: number;
}

export interface TripBaseRoute {
  provider: "mapbox";
  algorithmVersion: "base-route-v1";
  calculatedAt: string;
  geometryPersisted: boolean;
  metrics: TripRouteMetrics;
  segments: TripRouteSegment[];
}

export interface TripPlanSettings {
  tripType: TripType;
  corridorMiles: number;
  maxExtraMinutes: number;
  maxExtraMiles: number | null;
  /** Null means no user-configured count cap; legacy Drafts may retain a number. */
  maxStops: number | null;
  stopDurationMinutes: number;
}

export interface TripPlan extends TripPlanSettings {
  id: string;
  userId: string;
  name: string | null;
  status: TripPlanStatus;
  originSource: TripEndpointSource | null;
  originLabel: string | null;
  originFullAddress: string | null;
  originLatitude: number | null;
  originLongitude: number | null;
  originStationId: string | null;
  originProviderId: string | null;
  destinationSource: TripEndpointSource | null;
  destinationLabel: string | null;
  destinationFullAddress: string | null;
  destinationLatitude: number | null;
  destinationLongitude: number | null;
  destinationStationId: string | null;
  destinationProviderId: string | null;
  routeInputRevision: number;
  routeProvider: string | null;
  algorithmVersion: string | null;
  baseDistanceMeters: number | null;
  baseDurationSeconds: number | null;
  plannedDistanceMeters: number | null;
  plannedDriveSeconds: number | null;
  plannedStopSeconds: number | null;
  extraDistanceMeters: number | null;
  extraDurationSeconds: number | null;
  corridorCandidateCount: number | null;
  evaluatedCandidateCount: number | null;
  unreachableCandidateCount: number | null;
  technicalLimitReached: boolean;
  technicalLimitReason: string | null;
  plannedRouteStale: boolean;
  routeCalculatedAt: string | null;
  isPublic: boolean;
  showOnHomepage: boolean;
  confirmedAt: string | null;
  activatedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TripPlanStop {
  id: string;
  tripPlanId: string;
  stationId: string;
  sequence: number;
  leg: TripPlanStopLeg;
  source: TripPlanStopSource;
  isLocked: boolean;
  status: TripPlanStopStatus;
  estimatedArrivalAt: string | null;
  estimatedDetourSeconds: number | null;
  estimatedDetourMeters: number | null;
  corridorDistanceMeters: number | null;
  routeProgress: number | null;
  selectionRank: number | null;
  visitId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TripPlanSegment {
  id: string;
  tripPlanId: string;
  segmentIndex: number;
  leg: TripPlanStopLeg;
  startSequence: number | null;
  endSequence: number | null;
  provider: string;
  distanceMeters: number;
  durationSeconds: number;
  geometry: TripRouteGeometry;
  routeKind: TripRouteKind;
  createdAt: string;
  updatedAt: string;
}

export interface SuggestedTripStop {
  id: string;
  sequence: number;
  leg: TripPlanStopLeg;
  stationId: string;
  stationName: string;
  address: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  corridorDistanceMeters: number | null;
  estimatedDetourSeconds: number | null;
  estimatedDetourMeters: number | null;
  routeProgress: number | null;
  selectionRank: number | null;
  source: TripPlanStopSource;
  isLocked: boolean;
  isVisited: boolean;
  payToPark: boolean;
  status: TripPlanStopStatus;
}

export type TripBudgetStatus = "within" | "over_time" | "over_distance" | "over_both";

export interface TripSuggestionSummary {
  corridorCandidateCount: number;
  evaluatedCandidateCount: number;
  selectedStopCount: number;
  unreachableCandidateCount: number;
  baseDistanceMeters: number;
  baseDurationSeconds: number;
  plannedDistanceMeters: number;
  plannedDriveSeconds: number;
  plannedStopSeconds: number;
  extraDistanceMeters: number;
  extraDriveSeconds: number;
  remainingExtraDriveSeconds: number;
  remainingExtraDistanceMeters: number | null;
  outboundStopCount: number;
  returnStopCount: number;
  algorithmVersion: string;
  technicalLimitReached: boolean;
  technicalLimitReason: string | null;
  preOptimizationDriveSeconds: number;
  postOptimizationDriveSeconds: number;
  optimizationImprovementSeconds: number;
  expectedNewStopCount: number;
  alreadyVisitedStopCount: number;
  manualStopCount: number;
  lockedStopCount: number;
  overTimeSeconds: number;
  overDistanceMeters: number;
  budgetStatus: TripBudgetStatus;
  plannedRouteStale: boolean;
}

export interface TripStopSearchResult {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string | null;
  latitude: number;
  longitude: number;
  operationalStatus: string;
  isVisited: boolean;
  payToPark: boolean;
  isExistingStop: boolean;
  isEndpoint: boolean;
  canAdd: boolean;
  warning: string | null;
}

export interface TripStationCandidate {
  stationId: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string | null;
  latitude: number;
  longitude: number;
  operationalStatus: string;
  stallCount: number | null;
  maxPowerKw: number | null;
  isVisited: boolean;
  payToPark: boolean;
  isEndpoint: boolean;
  isAlreadyInTrip: boolean;
  isSelectable: boolean;
  warning: string | null;
  distanceToOutboundMeters: number;
  distanceToReturnMeters: number;
  nearestLeg: TripPlanStopLeg;
  routeProgress: number;
}

export type SelectedTripBudgetStatus = "within_budget" | "over_time" | "over_distance" | "over_both";

export interface SelectedOutAndBackSummary {
  selectedStopCount: number;
  expectedNewStopCount: number;
  alreadyVisitedStopCount: number;
  outboundStopCount: number;
  returnStopCount: number;
  baseDistanceMeters: number;
  baseDurationSeconds: number;
  plannedDistanceMeters: number;
  plannedDriveSeconds: number;
  plannedStopSeconds: number;
  extraDistanceMeters: number;
  extraDriveSeconds: number;
  overTimeSeconds: number;
  overDistanceMeters: number;
  budgetStatus: SelectedTripBudgetStatus;
  algorithmVersion: string;
  matrixRequestCount: number;
  optimizationIterations: number;
  optimizationRuntimeMs: number;
  technicalLimitReached: boolean;
  technicalLimitReason: string | null;
}

export interface SelectedOutAndBackGenerationResult {
  stops: SuggestedTripStop[];
  summary: SelectedOutAndBackSummary;
  segments: TripRouteSegment[];
  geometryPersisted: boolean;
  routeInputRevision: number;
}

/** Client-safe detail DTO. Ownership identity never crosses the Server Component boundary. */
export type TripRoutePlannerPlan = Omit<TripPlan, "userId">;

/** Safe, compact DTO for the Admin list. It contains no user ID or Geometry. */
export interface TripPlanSummary {
  id: string;
  name: string | null;
  tripType: TripType;
  status: TripPlanStatus;
  originLabel: string | null;
  destinationLabel: string | null;
  stopCount: number;
  plannedDistanceMeters: number | null;
  updatedAt: string;
}

export const TRIP_PLAN_STATUSES: readonly TripPlanStatus[] = [
  "draft",
  "confirmed",
  "active",
  "completed",
  "archived",
];

export const DEFAULT_TRIP_PLAN_SETTINGS: Readonly<TripPlanSettings> = {
  tripType: "one_way",
  corridorMiles: 50,
  maxExtraMinutes: 120,
  maxExtraMiles: null,
  maxStops: null,
  stopDurationMinutes: 3,
};
