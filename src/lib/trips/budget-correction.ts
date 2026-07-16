export interface DetourBudget {
  baseDistanceMeters: number;
  baseDurationSeconds: number;
  maxExtraMinutes: number;
  maxExtraMiles: number | null;
}

export interface CorrectableStopCost {
  id: string;
  estimatedDetourSeconds: number;
  estimatedDetourMeters: number;
  selectionRank: number;
}

export function calculateExtraRouteMetrics(
  plannedDistanceMeters: number,
  plannedDurationSeconds: number,
  budget: Pick<DetourBudget, "baseDistanceMeters" | "baseDurationSeconds">,
) {
  if (![plannedDistanceMeters, plannedDurationSeconds, budget.baseDistanceMeters, budget.baseDurationSeconds]
    .every((value) => Number.isFinite(value) && value >= 0)) {
    throw new RangeError("Route metrics must be finite and nonnegative.");
  }
  return {
    extraDistanceMeters: Math.max(0, plannedDistanceMeters - budget.baseDistanceMeters),
    extraDurationSeconds: Math.max(0, plannedDurationSeconds - budget.baseDurationSeconds),
  };
}

export function isWithinDetourBudget(
  metrics: { extraDistanceMeters: number; extraDurationSeconds: number },
  budget: Pick<DetourBudget, "maxExtraMinutes" | "maxExtraMiles">,
) {
  return metrics.extraDurationSeconds <= budget.maxExtraMinutes * 60 &&
    (budget.maxExtraMiles === null || metrics.extraDistanceMeters <= budget.maxExtraMiles * 1609.344);
}

export function chooseBudgetCorrectionStopIndex<T extends CorrectableStopCost>(stops: T[]) {
  if (stops.length === 0) return -1;
  let best = 0;
  for (let index = 1; index < stops.length; index += 1) {
    const left = stops[index];
    const right = stops[best];
    if (left.estimatedDetourSeconds > right.estimatedDetourSeconds ||
      (left.estimatedDetourSeconds === right.estimatedDetourSeconds && left.estimatedDetourMeters > right.estimatedDetourMeters) ||
      (left.estimatedDetourSeconds === right.estimatedDetourSeconds && left.estimatedDetourMeters === right.estimatedDetourMeters && left.selectionRank > right.selectionRank) ||
      (left.estimatedDetourSeconds === right.estimatedDetourSeconds && left.estimatedDetourMeters === right.estimatedDetourMeters && left.selectionRank === right.selectionRank && left.id.localeCompare(right.id) > 0)) best = index;
  }
  return best;
}
