export interface DirectedRouteMatrix {
  durationsSeconds: Array<Array<number | null>>;
  distancesMeters: Array<Array<number | null>>;
}

export interface SelectedOptimizationStation {
  nodeIndex: number;
  stationId: string;
  nearestLeg?: "outbound" | "return" | null;
  routeProgress?: number | null;
}

export interface SelectedRouteCost {
  durationSeconds: number;
  distanceMeters: number;
}

export interface SelectedOutAndBackRoute extends SelectedRouteCost {
  outboundNodeIndices: number[];
  returnNodeIndices: number[];
}

export interface SelectedOutAndBackOptimizationResult {
  route: SelectedOutAndBackRoute | null;
  unreachableNodeIndices: number[];
  iterations: number;
  runtimeMs: number;
  technicalLimitReached: boolean;
  technicalLimitReason: "optimization_iteration_guard" | "optimization_runtime_guard" | null;
  seedCount: number;
}

export interface SelectedOutAndBackOptimizationOptions {
  maxIterations: number;
  maxRuntimeMs: number;
  now?: () => number;
}

type Leg = "outbound" | "return";

interface Insertion {
  station: SelectedOptimizationStation;
  leg: Leg;
  position: number;
  route: SelectedOutAndBackRoute;
  deltaDuration: number;
  deltaDistance: number;
}

function completeSequence(outbound: number[], returning: number[]) {
  return [0, ...outbound, 1, ...returning, 0];
}

export function calculateSelectedRouteCost(
  matrix: DirectedRouteMatrix,
  outboundNodeIndices: number[],
  returnNodeIndices: number[],
): SelectedRouteCost | null {
  const sequence = completeSequence(outboundNodeIndices, returnNodeIndices);
  let durationSeconds = 0;
  let distanceMeters = 0;
  for (let index = 1; index < sequence.length; index += 1) {
    const from = sequence[index - 1];
    const to = sequence[index];
    const duration = matrix.durationsSeconds[from]?.[to];
    const distance = matrix.distancesMeters[from]?.[to];
    if (duration === null || duration === undefined || distance === null || distance === undefined) {
      return null;
    }
    durationSeconds += duration;
    distanceMeters += distance;
  }
  return { durationSeconds, distanceMeters };
}

function asRoute(
  matrix: DirectedRouteMatrix,
  outboundNodeIndices: number[],
  returnNodeIndices: number[],
): SelectedOutAndBackRoute | null {
  const cost = calculateSelectedRouteCost(matrix, outboundNodeIndices, returnNodeIndices);
  return cost ? { outboundNodeIndices, returnNodeIndices, ...cost } : null;
}

function routeSignature(route: SelectedOutAndBackRoute) {
  return `${route.outboundNodeIndices.join(",")}|${route.returnNodeIndices.join(",")}`;
}

function compareRoutes(left: SelectedOutAndBackRoute, right: SelectedOutAndBackRoute) {
  return left.durationSeconds - right.durationSeconds ||
    left.distanceMeters - right.distanceMeters ||
    routeSignature(left).localeCompare(routeSignature(right));
}

function isStrictImprovement(candidate: SelectedOutAndBackRoute, current: SelectedOutAndBackRoute) {
  return candidate.durationSeconds < current.durationSeconds ||
    (candidate.durationSeconds === current.durationSeconds && candidate.distanceMeters < current.distanceMeters);
}

function allInsertions(
  matrix: DirectedRouteMatrix,
  route: SelectedOutAndBackRoute,
  station: SelectedOptimizationStation,
  preferredLeg?: Leg,
) {
  const insertions: Insertion[] = [];
  const legs: Leg[] = preferredLeg ? [preferredLeg] : ["outbound", "return"];
  for (const leg of legs) {
    const target = leg === "outbound" ? route.outboundNodeIndices : route.returnNodeIndices;
    for (let position = 0; position <= target.length; position += 1) {
      const nextTarget = [...target];
      nextTarget.splice(position, 0, station.nodeIndex);
      const candidate = asRoute(
        matrix,
        leg === "outbound" ? nextTarget : [...route.outboundNodeIndices],
        leg === "return" ? nextTarget : [...route.returnNodeIndices],
      );
      if (!candidate) continue;
      insertions.push({
        station,
        leg,
        position,
        route: candidate,
        deltaDuration: candidate.durationSeconds - route.durationSeconds,
        deltaDistance: candidate.distanceMeters - route.distanceMeters,
      });
    }
  }
  return insertions.sort((left, right) =>
    left.deltaDuration - right.deltaDuration ||
    left.deltaDistance - right.deltaDistance ||
    left.station.stationId.localeCompare(right.station.stationId) ||
    left.leg.localeCompare(right.leg) ||
    left.position - right.position);
}

function cheapestInsertionSeed(
  matrix: DirectedRouteMatrix,
  stations: SelectedOptimizationStation[],
  stationOrder: SelectedOptimizationStation[] = stations,
  preferredLeg?: (station: SelectedOptimizationStation) => Leg | undefined,
) {
  let route = asRoute(matrix, [], []);
  if (!route) return null;
  const remaining = new Map(stations.map((station) => [station.nodeIndex, station]));
  while (remaining.size > 0) {
    const candidates: Insertion[] = [];
    for (const ordered of stationOrder) {
      const station = remaining.get(ordered.nodeIndex);
      if (!station) continue;
      let insertion = allInsertions(matrix, route, station, preferredLeg?.(station))[0];
      if (!insertion && preferredLeg) insertion = allInsertions(matrix, route, station)[0];
      if (insertion) candidates.push(insertion);
    }
    candidates.sort((left, right) =>
      left.deltaDuration - right.deltaDuration ||
      left.deltaDistance - right.deltaDistance ||
      left.station.stationId.localeCompare(right.station.stationId) ||
      left.leg.localeCompare(right.leg) ||
      left.position - right.position);
    const selected = candidates[0];
    if (!selected) return null;
    route = selected.route;
    remaining.delete(selected.station.nodeIndex);
  }
  return route;
}

function regretTwoSeed(matrix: DirectedRouteMatrix, stations: SelectedOptimizationStation[]) {
  let route = asRoute(matrix, [], []);
  if (!route) return null;
  const remaining = new Map(stations.map((station) => [station.nodeIndex, station]));
  while (remaining.size > 0) {
    const choices = [...remaining.values()].flatMap((station) => {
      const insertions = allInsertions(matrix, route!, station);
      if (insertions.length === 0) return [];
      const best = insertions[0];
      const second = insertions[1];
      return [{
        best,
        regret: second ? second.deltaDuration - best.deltaDuration : Number.POSITIVE_INFINITY,
        distanceRegret: second ? second.deltaDistance - best.deltaDistance : Number.POSITIVE_INFINITY,
      }];
    });
    choices.sort((left, right) =>
      right.regret - left.regret ||
      right.distanceRegret - left.distanceRegret ||
      left.best.deltaDuration - right.best.deltaDuration ||
      left.best.deltaDistance - right.best.deltaDistance ||
      left.best.station.stationId.localeCompare(right.best.station.stationId));
    const selected = choices[0]?.best;
    if (!selected) return null;
    route = selected.route;
    remaining.delete(selected.station.nodeIndex);
  }
  return route;
}

function replaceAt<T>(values: T[], index: number, value: T) {
  const next = [...values];
  next[index] = value;
  return next;
}

function localSearch(
  matrix: DirectedRouteMatrix,
  initial: SelectedOutAndBackRoute,
  state: { iterations: number; deadline: number; maxIterations: number; now: () => number },
) {
  let route = initial;
  while (state.iterations < state.maxIterations && state.now() < state.deadline) {
    let best: SelectedOutAndBackRoute | null = null;
    const consider = (candidate: SelectedOutAndBackRoute | null) => {
      if (!candidate || !isStrictImprovement(candidate, route)) return;
      if (!best || compareRoutes(candidate, best) < 0) best = candidate;
    };
    const legs: Array<{ name: Leg; values: number[] }> = [
      { name: "outbound", values: route.outboundNodeIndices },
      { name: "return", values: route.returnNodeIndices },
    ];

    // Relocate within or across legs.
    for (const source of legs) {
      for (let sourceIndex = 0; sourceIndex < source.values.length; sourceIndex += 1) {
        const node = source.values[sourceIndex];
        for (const target of legs) {
          const without = source.values.filter((_, index) => index !== sourceIndex);
          const targetBase = source.name === target.name ? without : target.values;
          for (let targetIndex = 0; targetIndex <= targetBase.length; targetIndex += 1) {
            if (source.name === target.name && targetIndex === sourceIndex) continue;
            const inserted = [...targetBase];
            inserted.splice(targetIndex, 0, node);
            consider(asRoute(
              matrix,
              source.name === "outbound"
                ? (target.name === "outbound" ? inserted : without)
                : (target.name === "outbound" ? inserted : route.outboundNodeIndices),
              source.name === "return"
                ? (target.name === "return" ? inserted : without)
                : (target.name === "return" ? inserted : route.returnNodeIndices),
            ));
          }
        }
      }
    }

    // Swap, including adjacent swaps and cross-leg swaps.
    for (let firstLegIndex = 0; firstLegIndex < legs.length; firstLegIndex += 1) {
      for (let secondLegIndex = firstLegIndex; secondLegIndex < legs.length; secondLegIndex += 1) {
        const firstLeg = legs[firstLegIndex];
        const secondLeg = legs[secondLegIndex];
        for (let firstIndex = 0; firstIndex < firstLeg.values.length; firstIndex += 1) {
          const secondStart = firstLegIndex === secondLegIndex ? firstIndex + 1 : 0;
          for (let secondIndex = secondStart; secondIndex < secondLeg.values.length; secondIndex += 1) {
            const firstValues = replaceAt(firstLeg.values, firstIndex, secondLeg.values[secondIndex]);
            const secondValues = firstLegIndex === secondLegIndex
              ? replaceAt(firstValues, secondIndex, firstLeg.values[firstIndex])
              : replaceAt(secondLeg.values, secondIndex, firstLeg.values[firstIndex]);
            const nextOutbound = firstLegIndex === secondLegIndex
              ? (firstLeg.name === "outbound" ? secondValues : route.outboundNodeIndices)
              : (firstLeg.name === "outbound" ? firstValues : secondValues);
            const nextReturn = firstLegIndex === secondLegIndex
              ? (firstLeg.name === "return" ? secondValues : route.returnNodeIndices)
              : (firstLeg.name === "return" ? firstValues : secondValues);
            consider(asRoute(matrix, nextOutbound, nextReturn));
          }
        }
      }
    }

    // Directed 2-opt: reverse a contiguous subsection and re-evaluate every edge.
    for (const leg of legs) {
      for (let start = 0; start < leg.values.length - 1; start += 1) {
        for (let end = start + 1; end < leg.values.length; end += 1) {
          const reversed = [
            ...leg.values.slice(0, start),
            ...leg.values.slice(start, end + 1).reverse(),
            ...leg.values.slice(end + 1),
          ];
          consider(asRoute(
            matrix,
            leg.name === "outbound" ? reversed : route.outboundNodeIndices,
            leg.name === "return" ? reversed : route.returnNodeIndices,
          ));
        }
      }
    }

    state.iterations += 1;
    if (!best) break;
    route = best;
  }
  return route;
}

function definitelyUnreachableNodes(matrix: DirectedRouteMatrix, stations: SelectedOptimizationStation[]) {
  return stations.filter((station) => {
    const node = station.nodeIndex;
    const hasIncoming = matrix.durationsSeconds.some((row, index) =>
      index !== node && row?.[node] !== null && row?.[node] !== undefined);
    const hasOutgoing = matrix.durationsSeconds[node]?.some((value, index) =>
      index !== node && value !== null && value !== undefined) ?? false;
    return !hasIncoming || !hasOutgoing;
  }).map((station) => station.nodeIndex);
}

export function optimizeSelectedOutAndBack(
  matrix: DirectedRouteMatrix,
  stations: SelectedOptimizationStation[],
  options: SelectedOutAndBackOptimizationOptions,
): SelectedOutAndBackOptimizationResult {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const state = {
    iterations: 0,
    deadline: startedAt + Math.max(1, options.maxRuntimeMs),
    maxIterations: Math.max(1, options.maxIterations),
    now,
  };
  const stableStations = [...stations].sort((left, right) => left.stationId.localeCompare(right.stationId));
  const byProgress = [...stableStations].sort((left, right) =>
    (left.routeProgress ?? Number.POSITIVE_INFINITY) - (right.routeProgress ?? Number.POSITIVE_INFINITY) ||
    left.stationId.localeCompare(right.stationId));
  const seeds = [
    cheapestInsertionSeed(matrix, stableStations),
    regretTwoSeed(matrix, stableStations),
    cheapestInsertionSeed(matrix, stableStations, stableStations, (station) => station.nearestLeg ?? undefined),
    cheapestInsertionSeed(matrix, stableStations, byProgress, (station) =>
      station.routeProgress === null || station.routeProgress === undefined
        ? station.nearestLeg ?? undefined
        : station.routeProgress <= 0.5 ? "outbound" : "return"),
  ].filter((route): route is SelectedOutAndBackRoute => route !== null);

  let best: SelectedOutAndBackRoute | null = null;
  for (const seed of seeds) {
    if (state.iterations >= state.maxIterations || now() >= state.deadline) break;
    const optimized = localSearch(matrix, seed, state);
    if (!best || compareRoutes(optimized, best) < 0) best = optimized;
  }

  const runtimeMs = Math.max(0, now() - startedAt);
  const iterationGuard = state.iterations >= state.maxIterations;
  const runtimeGuard = now() >= state.deadline;
  return {
    route: best,
    unreachableNodeIndices: best ? [] : definitelyUnreachableNodes(matrix, stableStations),
    iterations: state.iterations,
    runtimeMs,
    technicalLimitReached: iterationGuard || runtimeGuard,
    technicalLimitReason: iterationGuard
      ? "optimization_iteration_guard"
      : runtimeGuard ? "optimization_runtime_guard" : null,
    seedCount: seeds.length,
  };
}
