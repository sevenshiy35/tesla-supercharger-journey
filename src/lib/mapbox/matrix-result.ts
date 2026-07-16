import { MapboxServerError } from "./errors";

export interface TripMatrixResult {
  durationsSeconds: Array<Array<number | null>>;
  distancesMeters: Array<Array<number | null>>;
}

function parseCell(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new MapboxServerError("invalid_response", `Invalid Matrix ${label} value.`);
  }
  return value;
}

function parseMatrix(value: unknown, rowCount: number, columnCount: number, label: string) {
  if (!Array.isArray(value) || value.length !== rowCount) {
    throw new MapboxServerError("invalid_response", `Invalid Matrix ${label} dimensions.`);
  }
  return value.map((row) => {
    if (!Array.isArray(row) || row.length !== columnCount) {
      throw new MapboxServerError("invalid_response", `Invalid Matrix ${label} dimensions.`);
    }
    return row.map((cell) => parseCell(cell, label));
  });
}

export function parseTripMatrixResult(payload: unknown, coordinateCount: number): TripMatrixResult {
  return parseTripMatrixSubsetResult(payload, coordinateCount, coordinateCount);
}

export function parseTripMatrixSubsetResult(
  payload: unknown,
  sourceCount: number,
  destinationCount: number,
): TripMatrixResult {
  if (!payload || typeof payload !== "object") {
    throw new MapboxServerError("invalid_response", "Invalid Matrix response.");
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.code === "string" && record.code !== "Ok") {
    throw new MapboxServerError("no_route", "Mapbox returned no usable Matrix.");
  }
  return {
    durationsSeconds: parseMatrix(record.durations, sourceCount, destinationCount, "duration"),
    distancesMeters: parseMatrix(record.distances, sourceCount, destinationCount, "distance"),
  };
}

function matrixValue(
  matrix: Array<Array<number | null>>,
  fromIndex: number,
  toIndex: number,
  label: string,
) {
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) {
    throw new RangeError(`Matrix ${label} indices must be integers.`);
  }
  const row = matrix[fromIndex];
  if (!row || toIndex < 0 || toIndex >= row.length) {
    throw new RangeError(`Matrix ${label} index is out of bounds.`);
  }
  const value = row[toIndex];
  if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
    throw new TypeError(`Matrix ${label} value is invalid.`);
  }
  return value;
}

export function getMatrixDuration(result: TripMatrixResult, fromIndex: number, toIndex: number) {
  return matrixValue(result.durationsSeconds, fromIndex, toIndex, "duration");
}

export function getMatrixDistance(result: TripMatrixResult, fromIndex: number, toIndex: number) {
  return matrixValue(result.distancesMeters, fromIndex, toIndex, "distance");
}
