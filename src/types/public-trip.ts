import type { TripPlanStatus, TripPlanStopLeg, TripPlanStopStatus, TripRouteGeometry } from "@/lib/trips/types";

export interface PublicTripStop {
  id: string;
  sequence: number;
  leg: TripPlanStopLeg;
  stationId: string;
  stationName: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  status: Exclude<TripPlanStopStatus, "skipped">;
  estimatedArrivalAt: string | null;
  checkedInAt: string | null;
}

export interface PublicTripSegment {
  segmentIndex: number;
  leg: TripPlanStopLeg;
  startSequence: number | null;
  endSequence: number | null;
  geometry: TripRouteGeometry;
}

export interface PublicHomepageTrip {
  id: string;
  name: string;
  status: Extract<TripPlanStatus, "confirmed" | "active" | "completed">;
  confirmedAt: string | null;
  activatedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  stops: PublicTripStop[];
  segments: PublicTripSegment[];
}
