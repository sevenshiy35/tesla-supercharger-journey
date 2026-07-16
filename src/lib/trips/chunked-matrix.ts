import "server-only";

import { MapboxServerError } from "@/lib/mapbox/errors";
import { getDrivingMatrix, getDrivingMatrixSubset } from "@/lib/mapbox/matrix";
import type { TripMatrixResult } from "@/lib/mapbox/matrix-result";
import type { MapboxCoordinate } from "@/lib/mapbox/types";
import {
  MATRIX_DESTINATION_BLOCK_SIZE,
  MATRIX_MAX_COORDINATES,
  MATRIX_SOURCE_BLOCK_SIZE,
  MAX_MATRIX_REQUESTS_PER_OPTIMIZATION,
} from "./planning-config";

export interface ChunkedDirectedMatrixResult extends TripMatrixResult {
  requestCount: number;
}

export type MatrixSubsetRequester = (
  coordinates: MapboxCoordinate[],
  sourceIndices: number[],
  destinationIndices: number[],
) => Promise<TripMatrixResult>;

function chunks(size: number, blockSize: number) {
  const result: number[][] = [];
  for (let start = 0; start < size; start += blockSize) {
    result.push(Array.from({ length: Math.min(blockSize, size - start) }, (_, offset) => start + offset));
  }
  return result;
}

function emptyMatrix(size: number): Array<Array<number | null>> {
  return Array.from({ length: size }, () => Array<number | null>(size).fill(null));
}

export async function buildChunkedDrivingMatrix(
  coordinates: MapboxCoordinate[],
  requestSubset: MatrixSubsetRequester = getDrivingMatrixSubset,
): Promise<ChunkedDirectedMatrixResult> {
  if (coordinates.length < 2) {
    throw new MapboxServerError("invalid_request", "The selected route needs two endpoints.");
  }
  if (coordinates.length <= MATRIX_MAX_COORDINATES && requestSubset === getDrivingMatrixSubset) {
    const matrix = await getDrivingMatrix(coordinates);
    return { ...matrix, requestCount: 1 };
  }

  const sourceBlocks = chunks(coordinates.length, MATRIX_SOURCE_BLOCK_SIZE);
  const destinationBlocks = chunks(coordinates.length, MATRIX_DESTINATION_BLOCK_SIZE);
  const plannedRequestCount = sourceBlocks.length * destinationBlocks.length;
  if (plannedRequestCount > MAX_MATRIX_REQUESTS_PER_OPTIMIZATION) {
    throw new MapboxServerError("invalid_request", "The internal Matrix request guard was reached.");
  }

  const durationsSeconds = emptyMatrix(coordinates.length);
  const distancesMeters = emptyMatrix(coordinates.length);
  let requestCount = 0;

  for (const sourceBlock of sourceBlocks) {
    for (const destinationBlock of destinationBlocks) {
      const requestedDestinations = [...destinationBlock];
      // Mapbox requires at least two Matrix elements. Pad a 1x1 tail tile,
      // then discard the padding cell when copying into the full Matrix.
      if (sourceBlock.length * requestedDestinations.length === 1) {
        const padding = coordinates.findIndex((_, index) => !requestedDestinations.includes(index));
        if (padding >= 0) requestedDestinations.push(padding);
      }

      const globalIndices = [...new Set([...sourceBlock, ...requestedDestinations])];
      if (globalIndices.length > MATRIX_MAX_COORDINATES) {
        throw new MapboxServerError("invalid_request", "A Matrix tile exceeded the coordinate guard.");
      }
      const localIndex = new Map(globalIndices.map((global, local) => [global, local]));
      const tileCoordinates = globalIndices.map((index) => coordinates[index]);
      const localSources = sourceBlock.map((index) => localIndex.get(index)!);
      const localDestinations = requestedDestinations.map((index) => localIndex.get(index)!);
      const tile = await requestSubset(tileCoordinates, localSources, localDestinations);
      requestCount += 1;

      for (let sourceOffset = 0; sourceOffset < sourceBlock.length; sourceOffset += 1) {
        for (let destinationOffset = 0; destinationOffset < destinationBlock.length; destinationOffset += 1) {
          const sourceIndex = sourceBlock[sourceOffset];
          const destinationIndex = destinationBlock[destinationOffset];
          durationsSeconds[sourceIndex][destinationIndex] =
            tile.durationsSeconds[sourceOffset]?.[destinationOffset] ?? null;
          distancesMeters[sourceIndex][destinationIndex] =
            tile.distancesMeters[sourceOffset]?.[destinationOffset] ?? null;
        }
      }
    }
  }

  return { durationsSeconds, distancesMeters, requestCount };
}
