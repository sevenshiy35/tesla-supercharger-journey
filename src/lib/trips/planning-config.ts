/** Official Mapbox limits reviewed against docs.mapbox.com on 2026-07-15. */
export const MATRIX_MAX_COORDINATES = 25;
export const MATRIX_MAX_ELEMENTS = 625;
export const MATRIX_REQUESTS_PER_MINUTE = 60;
export const DIRECTIONS_MAX_COORDINATES = 25;

/**
 * Phase 3B.4.1 selected-station optimizer guards. These are implementation
 * safety rails, not user-configurable planning limits and must never be
 * persisted as Trip settings.
 *
 * A 12 x 13 Matrix tile uses at most 25 distinct coordinates. With 48
 * selected Stations plus the two endpoints, the full directed Matrix takes
 * at most 20 requests, below both our guard and Mapbox's documented 60 rpm.
 */
export const MAX_SELECTED_STATIONS_PER_OPTIMIZATION = 48;
export const MATRIX_SOURCE_BLOCK_SIZE = 12;
export const MATRIX_DESTINATION_BLOCK_SIZE = 13;
export const MAX_MATRIX_REQUESTS_PER_OPTIMIZATION = 24;
export const MAX_OPTIMIZATION_ITERATIONS = 256;
export const MAX_OPTIMIZATION_RUNTIME_MS = 20_000;
export const SELECTED_OUT_AND_BACK_ALGORITHM_VERSION = "selected-out-and-back-v1" as const;

/** Conservative per-generation guards. These are not user Trip settings. */
export const MAX_MATRIX_REQUESTS_PER_GENERATION = 48;
export const MAX_ALGORITHM_ITERATIONS = 48;
export const MAX_LOCAL_OPTIMIZATION_ITERATIONS = 24;
export const MAX_BUDGET_CORRECTION_ITERATIONS = 8;
export const MAX_DIRECTIONS_REQUESTS_PER_GENERATION = 24;
export const TRIP_SUGGESTION_ALGORITHM_VERSION = "corridor-max-stops-v1" as const;

export const TECHNICAL_LIMIT_MESSAGES = {
  matrix_request_budget: "Matrix request budget reached",
  algorithm_iteration_budget: "Algorithm iteration budget reached",
  directions_request_budget: "Directions request budget reached",
  candidate_query_budget: "Candidate query budget reached",
} as const;

export type TripTechnicalLimitReason = keyof typeof TECHNICAL_LIMIT_MESSAGES;
