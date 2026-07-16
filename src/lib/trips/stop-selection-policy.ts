/** Phase 3B.3 optimizes the business goal before applying deterministic tie-breakers. */
export const TRIP_STOP_SELECTION_OBJECTIVE =
  "maximize_unvisited_stations_within_detour_budget" as const;

/**
 * Business and technical reasons that can end candidate expansion. Technical
 * guards stay in application code/configuration and are never Trip settings.
 */
export type TripStopSelectionStopReason =
  | "extra_time_budget_exceeded"
  | "extra_distance_budget_exceeded"
  | "no_feasible_corridor_candidates"
  | "candidate_unreachable"
  | "legacy_stop_limit_reached"
  | "technical_guard_reached";

/** A numeric limit is legacy-compatible; null never caps the selected count. */
export function isLegacyStopLimitReached(
  maxStops: number | null,
  selectedStopCount: number,
) {
  return maxStops !== null && selectedStopCount >= maxStops;
}
