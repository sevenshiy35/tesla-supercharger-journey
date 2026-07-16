"use client";

import type { Route } from "next";
import { LoaderCircle, Route as RouteIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createTripPlanDraftAction } from "@/app/admin/trip-actions";
import { endpointDistanceMeters } from "@/lib/trips/distance";
import type { TripEndpoint, TripType } from "@/lib/trips/types";
import { TripRouteBasicsFields } from "./TripRouteBasicsFields";

export function NewTripForm() {
  const router = useRouter();
  const [tripType, setTripType] = useState<TripType>("one_way");
  const [origin, setOrigin] = useState<TripEndpoint | null>(null);
  const [destination, setDestination] = useState<TripEndpoint | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooClose = origin && destination ? endpointDistanceMeters(origin, destination) < 100 : false;

  async function createDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !origin || !destination || tooClose) return;
    setSubmitting(true);
    setError(null);
    const result = await createTripPlanDraftAction({ tripType, origin, destination });
    if (!result.ok || !result.tripPlanId) {
      setSubmitting(false);
      setError(result.error ?? "The Draft could not be created.");
      return;
    }
    router.push(`/admin/trips/${result.tripPlanId}` as Route);
    router.refresh();
  }

  return (
    <form
      onSubmit={(event) => void createDraft(event)}
      className="rounded-[28px] border border-[#d5e6df] bg-white p-5 shadow-sm sm:p-7"
    >
      <div className="mb-6 flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#e7f5ef] text-action-blue">
          <RouteIcon size={21} aria-hidden />
        </span>
        <div>
          <h2 className="text-2xl font-semibold">Plan your route</h2>
          <p className="mt-1 text-sm leading-6 text-[#486d69]">
            Select the Superchargers you want to visit. The planner will optimize their visit order.
          </p>
        </div>
      </div>

      <TripRouteBasicsFields
        tripType={tripType}
        origin={origin}
        destination={destination}
        disabled={submitting}
        onTripTypeChange={setTripType}
        onOriginChange={setOrigin}
        onDestinationChange={setDestination}
      />

      {tooClose ? (
        <p role="alert" className="mt-5 rounded-2xl bg-[#fff1f1] px-4 py-3 text-sm text-[#8d2930]">
          Origin and destination are too close to calculate a useful trip.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-5 rounded-2xl bg-[#fff1f1] px-4 py-3 text-sm text-[#8d2930]">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting || !origin || !destination || Boolean(tooClose)}
        className="mt-7 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-6 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? <LoaderCircle size={18} className="animate-spin" aria-hidden /> : null}
        {submitting ? "Creating…" : "Create Draft"}
      </button>
    </form>
  );
}
