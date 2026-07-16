import type { SuggestionRouteNode, PairCost } from "./suggestion-algorithm";

export type PairCostGetter = (from: SuggestionRouteNode, to: SuggestionRouteNode) => PairCost | null;

export interface LocalOptimizationResult {
  routeNodes: SuggestionRouteNode[];
  iterations: number;
  preOptimizationDriveSeconds: number;
  postOptimizationDriveSeconds: number;
  optimizationImprovementSeconds: number;
}

function routeCost(nodes: SuggestionRouteNode[], getCost: PairCostGetter) {
  let durationSeconds = 0;
  let distanceMeters = 0;
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const cost = getCost(nodes[index], nodes[index + 1]);
    if (!cost) return null;
    durationSeconds += cost.durationSeconds;
    distanceMeters += cost.distanceMeters;
  }
  return { durationSeconds, distanceMeters };
}

export function optimizeAdjacentSuggestionStops(
  inputNodes: SuggestionRouteNode[],
  getCost: PairCostGetter,
  maximumIterations: number,
): LocalOptimizationResult {
  const nodes = [...inputNodes];
  const initial = routeCost(nodes, getCost);
  if (!initial) return {
    routeNodes: nodes,
    iterations: 0,
    preOptimizationDriveSeconds: 0,
    postOptimizationDriveSeconds: 0,
    optimizationImprovementSeconds: 0,
  };
  let current = initial;
  let iterations = 0;
  while (iterations < maximumIterations) {
    let best: { index: number; cost: PairCost } | null = null;
    for (let index = 1; index < nodes.length - 2; index += 1) {
      const left = nodes[index];
      const right = nodes[index + 1];
      if (left.kind !== "station" || right.kind !== "station") continue;
      // Destination remains a fixed midpoint; adjacent stations cannot cross it.
      const destinationIndex = nodes.findIndex((node) => node.kind === "destination");
      if ((index < destinationIndex) !== (index + 1 < destinationIndex)) continue;
      const candidate = [...nodes];
      candidate[index] = right;
      candidate[index + 1] = left;
      const cost = routeCost(candidate, getCost);
      if (!cost) continue;
      const improvesDuration = cost.durationSeconds < current.durationSeconds - 1e-6;
      const tiesDuration = Math.abs(cost.durationSeconds - current.durationSeconds) <= 1e-6;
      const improvesDistance = tiesDuration && cost.distanceMeters < current.distanceMeters - 1e-6;
      if (!improvesDuration && !improvesDistance) continue;
      if (!best || cost.durationSeconds < best.cost.durationSeconds - 1e-6 ||
        (Math.abs(cost.durationSeconds - best.cost.durationSeconds) <= 1e-6 && cost.distanceMeters < best.cost.distanceMeters - 1e-6) ||
        (Math.abs(cost.durationSeconds - best.cost.durationSeconds) <= 1e-6 && Math.abs(cost.distanceMeters - best.cost.distanceMeters) <= 1e-6 && index < best.index)) {
        best = { index, cost };
      }
    }
    if (!best) break;
    const temporary = nodes[best.index];
    nodes[best.index] = nodes[best.index + 1];
    nodes[best.index + 1] = temporary;
    current = best.cost;
    iterations += 1;
  }
  return {
    routeNodes: nodes,
    iterations,
    preOptimizationDriveSeconds: Math.round(initial.durationSeconds),
    postOptimizationDriveSeconds: Math.round(current.durationSeconds),
    optimizationImprovementSeconds: Math.max(0, Math.round(initial.durationSeconds - current.durationSeconds)),
  };
}
