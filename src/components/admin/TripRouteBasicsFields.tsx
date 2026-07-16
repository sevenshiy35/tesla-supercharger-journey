"use client";

import type { TripEndpoint, TripType } from "@/lib/trips/types";
import { TripEndpointPicker } from "./TripEndpointPicker";

export function TripRouteBasicsFields({
  tripType,
  origin,
  destination,
  disabled = false,
  onTripTypeChange,
  onOriginChange,
  onDestinationChange,
}: {
  tripType: TripType;
  origin: TripEndpoint | null;
  destination: TripEndpoint | null;
  disabled?: boolean;
  onTripTypeChange: (tripType: TripType) => void;
  onOriginChange: (endpoint: TripEndpoint | null) => void;
  onDestinationChange: (endpoint: TripEndpoint | null) => void;
}) {
  return (
    <div className="space-y-5">
      <fieldset disabled={disabled}>
        <legend className="text-sm font-semibold">Trip Type</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-[20px] bg-[#edf4f0] p-1.5">
          {([
            ["one_way", "One way"],
            ["round_trip", "Round trip"],
          ] as const).map(([value, label]) => (
            <label
              key={value}
              className={`flex min-h-12 cursor-pointer items-center justify-center rounded-[15px] px-4 text-center font-semibold transition ${
                tripType === value
                  ? "bg-ink text-white shadow-sm"
                  : "text-[#3d625f] hover:bg-white/70"
              }`}
            >
              <input
                type="radio"
                name="tripType"
                value={value}
                checked={tripType === value}
                onChange={() => onTripTypeChange(value)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 xl:grid-cols-2">
        <TripEndpointPicker
          id="trip-origin"
          title="Origin"
          value={origin}
          onChange={onOriginChange}
          disabled={disabled}
          allowCurrentLocation
        />
        <TripEndpointPicker
          id="trip-destination"
          title={tripType === "round_trip" ? "Turnaround destination" : "Destination"}
          value={destination}
          onChange={onDestinationChange}
          disabled={disabled}
          allowCurrentLocation={false}
        />
      </div>

      <div className="rounded-2xl bg-[#f2f6f3] px-4 py-3 text-sm leading-6 text-[#486d69]">
        <p className="font-semibold text-ink">
          {tripType === "round_trip"
            ? "Origin → Destination → Origin"
            : "Origin → Destination"}
        </p>
        {tripType === "round_trip" ? (
          <p className="mt-1">
            The destination is the turnaround point. The trip returns to the origin after visiting it.
          </p>
        ) : null}
      </div>
    </div>
  );
}
