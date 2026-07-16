import type { TripMatrixResult } from "@/lib/mapbox/matrix-result";
import { getMatrixDistance, getMatrixDuration } from "@/lib/mapbox/matrix-result";
import type { MapboxCoordinate } from "@/lib/mapbox/types";
import {
  MATRIX_MAX_COORDINATES,
  MAX_ALGORITHM_ITERATIONS,
  MAX_MATRIX_REQUESTS_PER_GENERATION,
  type TripTechnicalLimitReason,
} from "./planning-config";
import type { CorridorCandidate } from "./corridor";
import type { TripPlanStopLeg, TripType } from "./types";

const FLOATING_NEGATIVE_TOLERANCE = 0.5;

export interface SuggestionRouteNode extends MapboxCoordinate {
  key: string;
  kind: "origin" | "destination" | "station";
  stationId: string | null;
  initialLeg: TripPlanStopLeg | null;
}

export interface MatrixEvaluationBatch {
  routeStartIndex: number;
  routeNodes: SuggestionRouteNode[];
  candidates: CorridorCandidate[];
}

export interface PairCost {
  durationSeconds: number;
  distanceMeters: number;
}

export interface InsertionOption extends PairCost {
  candidate: CorridorCandidate;
  edgeIndex: number;
  leg: TripPlanStopLeg;
  materialNegativeCost: boolean;
}

export interface SelectedSuggestionStop extends CorridorCandidate {
  leg: TripPlanStopLeg;
  selectionRank: number;
  estimatedDetourSeconds: number;
  estimatedDetourMeters: number;
}

export interface SuggestionAlgorithmOptions {
  tripType: TripType;
  origin: MapboxCoordinate;
  destination: MapboxCoordinate;
  candidates: CorridorCandidate[];
  maxExtraMinutes: number;
  maxExtraMiles: number | null;
  legacyMaxStops: number | null;
  matrixRequestLimit?: number;
  iterationLimit?: number;
  matrixMaximumCoordinates?: number;
  initialRouteNodes?: SuggestionRouteNode[];
  initialExtraDriveSeconds?: number;
  initialExtraDistanceMeters?: number;
  canInsertCandidate?: (candidate: CorridorCandidate, routeNodes: SuggestionRouteNode[], edgeIndex: number) => boolean;
}

export interface SuggestionAlgorithmResult {
  routeNodes: SuggestionRouteNode[];
  selectedStops: SelectedSuggestionStop[];
  extraDriveSeconds: number;
  extraDistanceMeters: number;
  evaluatedCandidateCount: number;
  unreachableCandidateCount: number;
  matrixRequestCount: number;
  algorithmIterationCount: number;
  technicalLimitReached: boolean;
  technicalLimitReason: TripTechnicalLimitReason | null;
  materialNegativeCostCount: number;
}

export type DrivingMatrixGetter = (coordinates: MapboxCoordinate[]) => Promise<TripMatrixResult>;

function candidateCoordinate(candidate: CorridorCandidate): MapboxCoordinate {
  return { longitude: candidate.longitude, latitude: candidate.latitude };
}

export function createInitialSuggestionRoute(
  tripType: TripType,
  origin: MapboxCoordinate,
  destination: MapboxCoordinate,
): SuggestionRouteNode[] {
  const originNode: SuggestionRouteNode = { ...origin, key: "origin:start", kind: "origin", stationId: null, initialLeg: null };
  const destinationNode: SuggestionRouteNode = { ...destination, key: "destination", kind: "destination", stationId: null, initialLeg: null };
  if (tripType === "one_way") return [originNode, destinationNode];
  return [
    originNode,
    destinationNode,
    { ...origin, key: "origin:end", kind: "origin", stationId: null, initialLeg: null },
  ];
}

function stationNode(candidate: CorridorCandidate): SuggestionRouteNode {
  return {
    ...candidateCoordinate(candidate),
    key: `station:${candidate.id}`,
    kind: "station",
    stationId: candidate.id,
    initialLeg: candidate.nearestLeg,
  };
}

export function edgeLeg(routeNodes: SuggestionRouteNode[], edgeIndex: number): TripPlanStopLeg {
  const destinationIndex = routeNodes.findIndex((node) => node.kind === "destination");
  return destinationIndex >= 0 && edgeIndex >= destinationIndex ? "return" : "outbound";
}

/** Interleaves each leg's early, middle and late thirds so early request batches cover the whole route. */
export function progressiveCandidateOrder(candidates: CorridorCandidate[]) {
  const buckets: CorridorCandidate[][] = [];
  for (const leg of ["outbound", "return"] as const) {
    const legCandidates = candidates.filter((candidate) => candidate.nearestLeg === leg);
    for (let third = 0; third < 3; third += 1) {
      buckets.push(legCandidates.filter((candidate) => {
        if (third === 0) return candidate.routeProgress < 1 / 3;
        if (third === 1) return candidate.routeProgress >= 1 / 3 && candidate.routeProgress < 2 / 3;
        return candidate.routeProgress >= 2 / 3;
      }));
    }
  }
  const ordered: CorridorCandidate[] = [];
  let offset = 0;
  while (buckets.some((bucket) => offset < bucket.length)) {
    for (const bucket of buckets) if (bucket[offset]) ordered.push(bucket[offset]);
    offset += 1;
  }
  return ordered;
}

function routeChunks(routeNodes: SuggestionRouteNode[], maximumCoordinates: number) {
  const maximumRouteNodes = routeNodes.length < maximumCoordinates
    ? routeNodes.length
    : Math.max(2, Math.floor(maximumCoordinates * 0.64));
  const chunks: Array<{ routeStartIndex: number; routeNodes: SuggestionRouteNode[] }> = [];
  let start = 0;
  while (start < routeNodes.length - 1) {
    const end = Math.min(routeNodes.length, start + maximumRouteNodes);
    chunks.push({ routeStartIndex: start, routeNodes: routeNodes.slice(start, end) });
    start = end - 1;
  }
  return chunks;
}

export function buildMatrixEvaluationBatches(
  routeNodes: SuggestionRouteNode[],
  candidates: CorridorCandidate[],
  maximumCoordinates = MATRIX_MAX_COORDINATES,
): MatrixEvaluationBatch[] {
  if (!Number.isInteger(maximumCoordinates) || maximumCoordinates < 3) {
    throw new RangeError("Matrix evaluation needs capacity for two route nodes and one candidate.");
  }
  const orderedCandidates = progressiveCandidateOrder(candidates);
  const batches: MatrixEvaluationBatch[] = [];
  for (const chunk of routeChunks(routeNodes, maximumCoordinates)) {
    const candidateCapacity = maximumCoordinates - chunk.routeNodes.length;
    for (let start = 0; start < orderedCandidates.length; start += candidateCapacity) {
      batches.push({
        ...chunk,
        candidates: orderedCandidates.slice(start, start + candidateCapacity),
      });
    }
  }
  return batches;
}

function safeDelta(via: number, direct: number) {
  const delta = via - direct;
  if (!Number.isFinite(delta)) return null;
  if (delta >= 0) return { value: delta, materialNegative: false };
  if (delta >= -FLOATING_NEGATIVE_TOLERANCE) return { value: 0, materialNegative: false };
  // Provider inconsistencies must never create budget credit. Preserve a safe, aggregate diagnostic only.
  return { value: 0, materialNegative: true };
}

export function calculateInsertionDelta(
  matrix: TripMatrixResult,
  fromIndex: number,
  candidateIndex: number,
  toIndex: number,
) {
  const durationAC = getMatrixDuration(matrix, fromIndex, candidateIndex);
  const durationCB = getMatrixDuration(matrix, candidateIndex, toIndex);
  const durationAB = getMatrixDuration(matrix, fromIndex, toIndex);
  const distanceAC = getMatrixDistance(matrix, fromIndex, candidateIndex);
  const distanceCB = getMatrixDistance(matrix, candidateIndex, toIndex);
  const distanceAB = getMatrixDistance(matrix, fromIndex, toIndex);
  if ([durationAC, durationCB, durationAB, distanceAC, distanceCB, distanceAB].some((value) => value === null)) return null;
  const duration = safeDelta((durationAC as number) + (durationCB as number), durationAB as number);
  const distance = safeDelta((distanceAC as number) + (distanceCB as number), distanceAB as number);
  if (!duration || !distance) return null;
  return {
    durationSeconds: duration.value,
    distanceMeters: distance.value,
    materialNegativeCost: duration.materialNegative || distance.materialNegative,
  };
}

function compareOptions(left: InsertionOption, right: InsertionOption) {
  return left.durationSeconds - right.durationSeconds ||
    left.distanceMeters - right.distanceMeters ||
    left.candidate.corridorDistanceMeters - right.candidate.corridorDistanceMeters ||
    left.candidate.routeProgress - right.candidate.routeProgress ||
    left.candidate.id.localeCompare(right.candidate.id) ||
    left.edgeIndex - right.edgeIndex;
}

function withinBudget(
  option: InsertionOption,
  usedSeconds: number,
  usedMeters: number,
  maximumSeconds: number,
  maximumMeters: number | null,
) {
  return usedSeconds + option.durationSeconds <= maximumSeconds + 1e-6 &&
    (maximumMeters === null || usedMeters + option.distanceMeters <= maximumMeters + 1e-6);
}

export async function maximizeSuggestedStops(
  options: SuggestionAlgorithmOptions,
  getMatrix: DrivingMatrixGetter,
): Promise<SuggestionAlgorithmResult> {
  const matrixRequestLimit = options.matrixRequestLimit ?? MAX_MATRIX_REQUESTS_PER_GENERATION;
  const iterationLimit = options.iterationLimit ?? MAX_ALGORITHM_ITERATIONS;
  const matrixMaximumCoordinates = options.matrixMaximumCoordinates ?? MATRIX_MAX_COORDINATES;
  const maximumSeconds = options.maxExtraMinutes * 60;
  const maximumMeters = options.maxExtraMiles === null ? null : options.maxExtraMiles * 1609.344;
  const routeNodes = options.initialRouteNodes ? [...options.initialRouteNodes] : createInitialSuggestionRoute(options.tripType, options.origin, options.destination);
  const remaining = new Map(options.candidates.map((candidate) => [candidate.id, candidate]));
  const evaluated = new Set<string>();
  const unreachable = new Set<string>();
  const selectedStops: SelectedSuggestionStop[] = [];
  let extraDriveSeconds = options.initialExtraDriveSeconds ?? 0;
  let extraDistanceMeters = options.initialExtraDistanceMeters ?? 0;
  let matrixRequestCount = 0;
  let algorithmIterationCount = 0;
  let materialNegativeCostCount = 0;
  let technicalLimitReason: TripTechnicalLimitReason | null = null;

  while (remaining.size > 0) {
    if (options.legacyMaxStops !== null && selectedStops.length >= options.legacyMaxStops) break;
    if (algorithmIterationCount >= iterationLimit) {
      technicalLimitReason = "algorithm_iteration_budget";
      break;
    }
    algorithmIterationCount += 1;
    const batches = buildMatrixEvaluationBatches(routeNodes, [...remaining.values()], matrixMaximumCoordinates);
    const bestByCandidate = new Map<string, InsertionOption>();
    const coveredEdgesByCandidate = new Map<string, Set<number>>();

    for (const batch of batches) {
      if (matrixRequestCount >= matrixRequestLimit) {
        technicalLimitReason = "matrix_request_budget";
        break;
      }
      const coordinates = [...batch.routeNodes, ...batch.candidates.map(candidateCoordinate)];
      const matrix = await getMatrix(coordinates);
      matrixRequestCount += 1;
      for (let candidateOffset = 0; candidateOffset < batch.candidates.length; candidateOffset += 1) {
        const candidate = batch.candidates[candidateOffset];
        evaluated.add(candidate.id);
        const covered = coveredEdgesByCandidate.get(candidate.id) ?? new Set<number>();
        const candidateIndex = batch.routeNodes.length + candidateOffset;
        for (let localEdge = 0; localEdge < batch.routeNodes.length - 1; localEdge += 1) {
          const edgeIndex = batch.routeStartIndex + localEdge;
          covered.add(edgeIndex);
          if (options.canInsertCandidate && !options.canInsertCandidate(candidate, routeNodes, edgeIndex)) continue;
          const delta = calculateInsertionDelta(matrix, localEdge, candidateIndex, localEdge + 1);
          if (!delta) continue;
          const option: InsertionOption = {
            candidate,
            edgeIndex,
            leg: edgeLeg(routeNodes, edgeIndex),
            ...delta,
          };
          const current = bestByCandidate.get(candidate.id);
          if (!current || compareOptions(option, current) < 0) bestByCandidate.set(candidate.id, option);
        }
        coveredEdgesByCandidate.set(candidate.id, covered);
      }
    }

    for (const candidate of remaining.values()) {
      if (bestByCandidate.has(candidate.id)) unreachable.delete(candidate.id);
      if (coveredEdgesByCandidate.get(candidate.id)?.size === routeNodes.length - 1 && !bestByCandidate.has(candidate.id)) {
        unreachable.add(candidate.id);
      }
    }
    const feasible = [...bestByCandidate.values()]
      .filter((option) => withinBudget(option, extraDriveSeconds, extraDistanceMeters, maximumSeconds, maximumMeters))
      .sort(compareOptions);
    const best = feasible[0];
    if (!best) break;
    if (best.materialNegativeCost) materialNegativeCostCount += 1;
    routeNodes.splice(best.edgeIndex + 1, 0, stationNode(best.candidate));
    remaining.delete(best.candidate.id);
    unreachable.delete(best.candidate.id);
    extraDriveSeconds += best.durationSeconds;
    extraDistanceMeters += best.distanceMeters;
    selectedStops.push({
      ...best.candidate,
      leg: best.leg,
      selectionRank: selectedStops.length + 1,
      estimatedDetourSeconds: Math.round(best.durationSeconds),
      estimatedDetourMeters: Math.round(best.distanceMeters),
    });
    if (technicalLimitReason) break;
  }

  // Final leg assignment is structural, not the candidate's initial nearest-leg hint.
  const routeOrder = new Map(routeNodes.map((node, index) => [node.stationId, { index, leg: edgeLeg(routeNodes, Math.max(0, index - 1)) }]));
  for (const stop of selectedStops) stop.leg = routeOrder.get(stop.id)?.leg ?? stop.leg;

  return {
    routeNodes,
    selectedStops,
    extraDriveSeconds: Math.round(extraDriveSeconds),
    extraDistanceMeters: Math.round(extraDistanceMeters),
    evaluatedCandidateCount: evaluated.size,
    unreachableCandidateCount: unreachable.size,
    matrixRequestCount,
    algorithmIterationCount,
    technicalLimitReached: technicalLimitReason !== null,
    technicalLimitReason,
    materialNegativeCostCount,
  };
}
