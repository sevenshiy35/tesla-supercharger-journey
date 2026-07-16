import type { TripPlanStatus, TripType } from "./types";

export function formatTripType(value: TripType) {
  return value === "round_trip" ? "Round trip" : "One-way";
}

export function formatTripStatus(value: TripPlanStatus) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatTripDistance(distanceMeters: number | null) {
  if (distanceMeters === null) return "Not calculated";
  return `${(distanceMeters / 1609.344).toLocaleString("en-US", {
    maximumFractionDigits: 1,
  })} mi`;
}

export function formatTripUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatTripDuration(seconds: number | null) {
  if (seconds === null) return "Not calculated";
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return hours > 0 ? `${hours} hr ${remaining} min` : `${remaining} min`;
}
