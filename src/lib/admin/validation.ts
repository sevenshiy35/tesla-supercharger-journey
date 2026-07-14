export const MAX_VISIT_NOTES_LENGTH = 2_000;

export interface CheckInInput {
  visitId: string;
  stationId: string;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  notes: string;
  isPublic: boolean;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

export function isValidTimezone(value: string) {
  const timezone = value.trim();
  if (!timezone || timezone.length > 100) return false;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export function validateCoordinates(latitude: number | null, longitude: number | null) {
  if ((latitude === null) !== (longitude === null)) {
    return "Latitude and longitude must be provided together.";
  }
  if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
    return "Latitude must be between -90 and 90.";
  }
  if (
    longitude !== null &&
    (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)
  ) {
    return "Longitude must be between -180 and 180.";
  }
  return null;
}

export function validateCheckInInput(input: CheckInInput) {
  if (!isUuid(input.visitId)) return "The check-in request ID is invalid. Reload and try again.";
  if (!isUuid(input.stationId)) return "Select a valid station.";
  if (!isValidTimezone(input.timezone)) return "Your browser could not provide a valid timezone.";
  const coordinateError = validateCoordinates(input.latitude, input.longitude);
  if (coordinateError) return coordinateError;
  if (input.notes.length > MAX_VISIT_NOTES_LENGTH) {
    return "Notes must be 2,000 characters or fewer.";
  }
  return null;
}
