import "server-only";

import { MATRIX_MAX_COORDINATES, MATRIX_MAX_ELEMENTS } from "@/lib/trips/planning-config";
import { MapboxServerError } from "./errors";
import {
  parseTripMatrixResult,
  parseTripMatrixSubsetResult,
  type TripMatrixResult,
} from "./matrix-result";
import { mapboxJsonRequest } from "./server-client";
import type { MapboxCoordinate } from "./types";

function validateCoordinate(coordinate: MapboxCoordinate) {
  return Number.isFinite(coordinate.longitude) && Number.isFinite(coordinate.latitude) &&
    coordinate.longitude >= -180 && coordinate.longitude <= 180 &&
    coordinate.latitude >= -90 && coordinate.latitude <= 90;
}

export async function getDrivingMatrix(coordinates: MapboxCoordinate[]): Promise<TripMatrixResult> {
  if (coordinates.length < 2 || coordinates.length > MATRIX_MAX_COORDINATES) {
    throw new MapboxServerError(
      "invalid_request",
      `A driving Matrix requires between 2 and ${MATRIX_MAX_COORDINATES} coordinates.`,
    );
  }
  if (!coordinates.every(validateCoordinate)) {
    throw new MapboxServerError("invalid_request", "A Matrix coordinate is invalid.");
  }
  const coordinatePath = coordinates
    .map(({ longitude, latitude }) => `${longitude},${latitude}`)
    .join(";");
  const payload = await mapboxJsonRequest(
    `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordinatePath}`,
    { annotations: "distance,duration" },
    15_000,
  );
  return parseTripMatrixResult(payload, coordinates.length);
}

export async function getDrivingMatrixSubset(
  coordinates: MapboxCoordinate[],
  sourceIndices: number[],
  destinationIndices: number[],
): Promise<TripMatrixResult> {
  if (coordinates.length < 2 || coordinates.length > MATRIX_MAX_COORDINATES) {
    throw new MapboxServerError(
      "invalid_request",
      `A driving Matrix requires between 2 and ${MATRIX_MAX_COORDINATES} coordinates.`,
    );
  }
  if (!coordinates.every(validateCoordinate)) {
    throw new MapboxServerError("invalid_request", "A Matrix coordinate is invalid.");
  }
  if (
    sourceIndices.length === 0 || destinationIndices.length === 0 ||
    sourceIndices.length * destinationIndices.length > MATRIX_MAX_ELEMENTS
  ) {
    throw new MapboxServerError("invalid_request", "Matrix source/destination dimensions are invalid.");
  }
  const validIndex = (index: number) =>
    Number.isInteger(index) && index >= 0 && index < coordinates.length;
  if (!sourceIndices.every(validIndex) || !destinationIndices.every(validIndex)) {
    throw new MapboxServerError("invalid_request", "A Matrix source or destination index is invalid.");
  }
  const coordinatePath = coordinates
    .map(({ longitude, latitude }) => `${longitude},${latitude}`)
    .join(";");
  const payload = await mapboxJsonRequest(
    `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordinatePath}`,
    {
      annotations: "distance,duration",
      sources: sourceIndices.join(";"),
      destinations: destinationIndices.join(";"),
    },
    15_000,
  );
  return parseTripMatrixSubsetResult(payload, sourceIndices.length, destinationIndices.length);
}
