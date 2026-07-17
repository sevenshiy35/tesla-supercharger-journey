"use client";

import { ArrowDownUp, Calculator, CheckCircle2, LoaderCircle, LockKeyhole, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  calculateTripBaseRouteAction,
  clearTripPlanRouteAction,
  saveTripPlanRouteBasicsAction,
} from "@/app/admin/trip-actions";
import { endpointDistanceMeters } from "@/lib/trips/distance";
import { formatTripDistance, formatTripDuration, formatTripStatus, formatTripType, formatTripUpdatedAt } from "@/lib/trips/format";
import type { SelectedOutAndBackSummary, SuggestedTripStop, TripBaseRoute, TripEndpoint, TripPlanSegment, TripRoutePlannerPlan, TripRouteSegment, TripSuggestionSummary, TripType } from "@/lib/trips/types";
import { TripRouteBasicsFields } from "./TripRouteBasicsFields";
import { TripRouteMap } from "./TripRouteMap";
import { TripStopsPanel } from "./TripSuggestionsPanel";
import { TripStationSelectionPanel } from "./TripStationSelectionPanel";

function planEndpoint(plan: TripRoutePlannerPlan, kind: "origin" | "destination"): TripEndpoint | null {
  const source = kind === "origin" ? plan.originSource : plan.destinationSource;
  const label = kind === "origin" ? plan.originLabel : plan.destinationLabel;
  const fullAddress = kind === "origin" ? plan.originFullAddress : plan.destinationFullAddress;
  const latitude = kind === "origin" ? plan.originLatitude : plan.destinationLatitude;
  const longitude = kind === "origin" ? plan.originLongitude : plan.destinationLongitude;
  const stationId = kind === "origin" ? plan.originStationId : plan.destinationStationId;
  const providerId = kind === "origin" ? plan.originProviderId : plan.destinationProviderId;
  return source && label && latitude !== null && longitude !== null
    ? { source, label, fullAddress, latitude, longitude, stationId, providerId }
    : null;
}

function initialSegments(segments: TripPlanSegment[], routeKind: "base" | "planned"): TripRouteSegment[] {
  return segments.flatMap((segment) => segment.provider === "mapbox" && segment.routeKind === routeKind ? [{
    segmentIndex: segment.segmentIndex,
    leg: segment.leg,
    startSequence: segment.startSequence,
    endSequence: segment.endSequence,
    provider: "mapbox" as const,
    distanceMeters: segment.distanceMeters,
    durationSeconds: segment.durationSeconds,
    geometry: segment.geometry,
  }] : []);
}

function Summary({ plan, tripType, origin, destination, route, stopCount }: { plan: TripRoutePlannerPlan; tripType: TripType; origin: TripEndpoint | null; destination: TripEndpoint | null; route: TripBaseRoute | null; stopCount: number }) {
  const segments = route?.segments ?? [];
  const outbound = segments.find((segment) => segment.leg === "outbound");
  const returnSegment = segments.find((segment) => segment.leg === "return");
  const distance = route?.metrics.baseDistanceMeters ?? plan.baseDistanceMeters;
  const duration = route?.metrics.baseDurationSeconds ?? plan.baseDurationSeconds;
  const calculatedAt = route?.calculatedAt ?? plan.routeCalculatedAt;
  return (
    <section className="rounded-[24px] border border-[#d5e6df] bg-white p-5">
      <h3 className="text-lg font-semibold">Base route summary</h3>
      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm [&_dd]:font-data">
        <div><dt className="text-[#67817e]">Trip type</dt><dd className="mt-1 font-semibold">{formatTripType(tripType)}</dd></div>
        <div><dt className="text-[#67817e]">Provider</dt><dd className="mt-1 font-semibold">{calculatedAt ? "Mapbox" : "Not calculated"}</dd></div>
        <div><dt className="text-[#67817e]">Origin</dt><dd className="mt-1 font-semibold">{origin?.label ?? "Not selected"}</dd></div>
        <div><dt className="text-[#67817e]">Destination</dt><dd className="mt-1 font-semibold">{destination?.label ?? "Not selected"}</dd></div>
        <div><dt className="text-[#67817e]">Base distance</dt><dd className="mt-1 font-semibold">{formatTripDistance(distance)}</dd></div>
        <div><dt className="text-[#67817e]">Base drive time</dt><dd className="mt-1 font-semibold">{formatTripDuration(duration)}</dd></div>
        {outbound ? <><div><dt className="text-[#67817e]">Outbound</dt><dd className="mt-1 font-semibold">{formatTripDistance(outbound.distanceMeters)} · {formatTripDuration(outbound.durationSeconds)}</dd></div></> : null}
        {returnSegment ? <div><dt className="text-[#67817e]">Return</dt><dd className="mt-1 font-semibold">{formatTripDistance(returnSegment.distanceMeters)} · {formatTripDuration(returnSegment.durationSeconds)}</dd></div> : null}
        {returnSegment ? <div><dt className="text-[#67817e]">Round-trip total</dt><dd className="mt-1 font-semibold">{formatTripDistance(distance)} · {formatTripDuration(duration)}</dd></div> : null}
        <div><dt className="text-[#67817e]">Selected stations</dt><dd className="mt-1 font-semibold">{stopCount}</dd></div>
        {stopCount > 0 ? <div><dt className="text-[#67817e]">Optimized distance</dt><dd className="mt-1 font-semibold">{formatTripDistance(route?.metrics.plannedDistanceMeters ?? plan.plannedDistanceMeters)}</dd></div> : null}
        {stopCount > 0 ? <div><dt className="text-[#67817e]">Optimized drive time</dt><dd className="mt-1 font-semibold">{formatTripDuration(route?.metrics.plannedDriveSeconds ?? plan.plannedDriveSeconds)}</dd></div> : null}
        {stopCount > 0 ? <div><dt className="text-[#67817e]">Additional distance</dt><dd className="mt-1 font-semibold">{formatTripDistance(route?.metrics.extraDistanceMeters ?? plan.extraDistanceMeters)}</dd></div> : null}
        {stopCount > 0 ? <div><dt className="text-[#67817e]">Additional drive time</dt><dd className="mt-1 font-semibold">{formatTripDuration(route?.metrics.extraDurationSeconds ?? plan.extraDurationSeconds)}</dd></div> : null}
      </dl>
      {calculatedAt ? <p className="mt-4 border-t border-[#e2ece8] pt-4 font-data text-xs text-[#67817e]">Last calculated {formatTripUpdatedAt(calculatedAt)}</p> : null}
      {calculatedAt && !route?.geometryPersisted ? <p className="mt-3 rounded-2xl bg-[#fffdf2] p-3 text-xs leading-5 text-[#725d30]">Metrics are saved. Under the current safe policy, route Geometry is generated through a private, no-store preview when needed.</p> : null}
    </section>
  );
}

function LockedStops({ plan, stops }: { plan: TripRoutePlannerPlan; stops: SuggestedTripStop[] }) {
  const orderedStops = [...stops].sort((a, b) => a.sequence - b.sequence);
  return (
    <section className="mt-5 rounded-[28px] border border-[#d5e6df] bg-white p-5 shadow-sm sm:p-7">
      <h2 className="text-2xl font-semibold">Trip Stops</h2>
      <p className="mt-1 text-sm leading-6 text-[#486d69]">The saved Stop order is read-only for this {formatTripStatus(plan.status).toLowerCase()} Trip.</p>
      <ol className="mt-5 grid gap-3 md:grid-cols-2">
        {orderedStops.map((stop) => {
          const checkedIn = stop.status === "visited";
          return <li key={stop.id} className={`rounded-[20px] border p-4 transition ${checkedIn ? "border-[#b9ded1] bg-[#e7f5ef] shadow-[0_10px_30px_rgba(36,94,82,0.08)]" : "border-[#d5e6df] bg-[#f7faf8]"}`}>
            <p className={`text-xs font-semibold uppercase tracking-[0.12em] ${checkedIn ? "text-[#327363]" : "text-action-blue"}`}>
              Stop {stop.sequence + 1} · {stop.leg === "return" ? "Return" : "Outbound"}
            </p>
            <h3 className="mt-1 font-semibold">{stop.stationName}</h3>
            <p className="mt-1 text-sm text-[#486d69]">{stop.address} · {stop.city}, {stop.state}</p>
            {checkedIn ? <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#245e52]"><CheckCircle2 size={14} aria-hidden /> Checked in</span> : null}
          </li>;
        })}
      </ol>
      <div className="mt-5 rounded-[20px] border-2 border-dashed border-[#bedbd5] bg-[#f7faf8] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-action-blue">Destination</p>
        <p className="mt-1 font-semibold">{plan.destinationLabel ?? "Not selected"}</p>
      </div>
    </section>
  );
}

export function TripRoutePlanner({ plan, persistedSegments, initialSuggestedStops }: { plan: TripRoutePlannerPlan; persistedSegments: TripPlanSegment[]; initialSuggestedStops: SuggestedTripStop[] }) {
  const router = useRouter();
  const savedOrigin = useMemo(() => planEndpoint(plan, "origin"), [plan]);
  const savedDestination = useMemo(() => planEndpoint(plan, "destination"), [plan]);
  const [tripType, setTripType] = useState<TripType>(plan.tripType);
  const [origin, setOrigin] = useState(savedOrigin);
  const [destination, setDestination] = useState(savedDestination);
  const persistedBaseSegments = useMemo(() => initialSegments(persistedSegments, "base"), [persistedSegments]);
  const persistedPlannedSegments = useMemo(() => initialSegments(persistedSegments, "planned"), [persistedSegments]);
  const [suggestedStops, setSuggestedStops] = useState(initialSuggestedStops);
  const [plannedSegments, setPlannedSegments] = useState(persistedPlannedSegments);
  const [plannedRouteStale, setPlannedRouteStale] = useState(plan.plannedRouteStale);
  const [routeInputRevision, setRouteInputRevision] = useState(plan.routeInputRevision);
  const [routeAudit, setRouteAudit] = useState({
    algorithmVersion: plan.algorithmVersion,
    technicalLimitReached: plan.technicalLimitReached,
    technicalLimitReason: plan.technicalLimitReason,
  });
  const [previewPending, setPreviewPending] = useState(() => Boolean(
    plan.routeCalculatedAt && (initialSuggestedStops.length > 0 ? persistedPlannedSegments.length === 0 : persistedBaseSegments.length === 0),
  ));
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [route, setRoute] = useState<TripBaseRoute | null>(() => plan.routeCalculatedAt ? {
    provider: "mapbox",
    algorithmVersion: "base-route-v1",
    calculatedAt: plan.routeCalculatedAt,
    geometryPersisted: persistedBaseSegments.length > 0,
    metrics: {
      baseDistanceMeters: plan.baseDistanceMeters ?? 0,
      baseDurationSeconds: plan.baseDurationSeconds ?? 0,
      plannedDistanceMeters: plan.plannedDistanceMeters ?? 0,
      plannedDriveSeconds: plan.plannedDriveSeconds ?? 0,
      plannedStopSeconds: plan.plannedStopSeconds ?? 0,
      extraDistanceMeters: plan.extraDistanceMeters ?? 0,
      extraDurationSeconds: plan.extraDurationSeconds ?? 0,
    },
    segments: persistedBaseSegments,
  } : null);
  const [pending, setPending] = useState<"save" | "calculate" | "clear" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [invalidationConfirm, setInvalidationConfirm] = useState(false);
  const hasCalculatedRoute = Boolean(plan.routeCalculatedAt || route);
  const destructiveChange = hasCalculatedRoute || suggestedStops.length > 0;
  const endpointsComplete = Boolean(origin && destination);
  const tooClose = origin && destination ? endpointDistanceMeters(origin, destination) < 100 : false;
  const routeBasicsDirty = JSON.stringify({ tripType, origin, destination }) !== JSON.stringify({ tripType: plan.tripType, origin: savedOrigin, destination: savedDestination });
  const currentPlan = useMemo<TripRoutePlannerPlan>(() => ({
    ...plan,
    tripType,
    routeInputRevision,
    plannedRouteStale,
    algorithmVersion: routeAudit.algorithmVersion,
    technicalLimitReached: routeAudit.technicalLimitReached,
    technicalLimitReason: routeAudit.technicalLimitReason,
    plannedDistanceMeters: route?.metrics.plannedDistanceMeters ?? plan.plannedDistanceMeters,
    plannedDriveSeconds: route?.metrics.plannedDriveSeconds ?? plan.plannedDriveSeconds,
    plannedStopSeconds: route?.metrics.plannedStopSeconds ?? plan.plannedStopSeconds,
    extraDistanceMeters: route?.metrics.extraDistanceMeters ?? plan.extraDistanceMeters,
    extraDurationSeconds: route?.metrics.extraDurationSeconds ?? plan.extraDurationSeconds,
  }), [plan, plannedRouteStale, route, routeAudit, routeInputRevision, tripType]);

  useEffect(() => {
    if (!plan.routeCalculatedAt) return;
    const wantsPlanned = suggestedStops.length > 0 && !plannedRouteStale;
    if (wantsPlanned ? plannedSegments.length > 0 : (route?.segments.length ?? 0) > 0) return;
    const controller = new AbortController();
    void fetch(`/api/admin/trips/${plan.id}/route-preview?kind=${wantsPlanned ? "planned" : "base"}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    }).then(async (response) => {
      const payload = await response.json() as { segments?: TripRouteSegment[]; error?: string };
      if (!response.ok || !payload.segments) throw new Error(payload.error ?? "Route preview is unavailable.");
      if (wantsPlanned) setPlannedSegments(payload.segments);
      else setRoute((current) => current ? { ...current, segments: payload.segments ?? [] } : current);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setPreviewError(error instanceof Error ? error.message : "Route preview is unavailable.");
    }).finally(() => { if (!controller.signal.aborted) setPreviewPending(false); });
    return () => controller.abort();
  }, [plan.id, plan.routeCalculatedAt, plannedRouteStale, plannedSegments.length, route?.segments.length, suggestedStops.length]);

  async function saveRouteBasics() {
    if (!origin || !destination || tooClose) return;
    setPending("save"); setError(null); setMessage(null);
    const result = await saveTripPlanRouteBasicsAction(plan.id, routeInputRevision, { tripType, origin, destination });
    setPending(null);
    if (!result.ok) { setError(result.error ?? "Route basics could not be saved."); return; }
    if (result.routeInputRevision !== undefined) setRouteInputRevision(result.routeInputRevision);
    if (result.changed) {
      setRoute(null);
      setPlannedRouteStale(false);
      setRouteAudit({ algorithmVersion: null, technicalLimitReached: false, technicalLimitReason: null });
      setSuggestedStops([]); setPlannedSegments([]);
      setMessage("Route basics saved. Calculate the Base Route to continue.");
    } else {
      setMessage("Route basics were already up to date.");
    }
    router.refresh();
  }

  async function calculate() {
    if (!endpointsComplete || tooClose) return;
    setPending("calculate"); setError(null); setMessage(null);
    const result = await calculateTripBaseRouteAction(plan.id);
    setPending(null);
    if (!result.ok || !result.route) { setError(result.error ?? "The route could not be calculated."); return; }
    setRoute(result.route);
    setRouteAudit({ algorithmVersion: result.route.algorithmVersion, technicalLimitReached: false, technicalLimitReason: null });
    if (result.routeInputRevision !== undefined) setRouteInputRevision(result.routeInputRevision);
    setSuggestedStops([]); setPlannedSegments([]);
    setMessage(result.route.geometryPersisted ? "Base route calculated and saved." : "Base route calculated. Metrics are saved; Geometry is available only in this browser session.");
    router.refresh();
  }

  async function clearRoute() {
    setPending("clear"); setError(null);
    const result = await clearTripPlanRouteAction(plan.id);
    setPending(null); setClearOpen(false);
    if (!result.ok) { setError(result.error ?? "The route could not be cleared."); return; }
    setRoute(null); setRouteAudit({ algorithmVersion: null, technicalLimitReached: false, technicalLimitReason: null }); setSuggestedStops([]); setPlannedSegments([]); setMessage("Calculated route cleared. Your endpoints were kept."); router.refresh();
  }

  function suggestionsGenerated(result: { stops: SuggestedTripStop[]; summary: TripSuggestionSummary; segments: TripRouteSegment[]; routeInputRevision?: number }) {
    setPreviewPending(false); setPreviewError(null);
    setSuggestedStops(result.stops);
    setPlannedSegments(result.segments);
    setPlannedRouteStale(false);
    setRouteAudit({
      algorithmVersion: result.summary.algorithmVersion,
      technicalLimitReached: result.summary.technicalLimitReached,
      technicalLimitReason: result.summary.technicalLimitReason,
    });
    if (result.routeInputRevision !== undefined) setRouteInputRevision(result.routeInputRevision);
    setRoute((current) => current ? {
      ...current,
      metrics: {
        ...current.metrics,
        plannedDistanceMeters: result.summary.plannedDistanceMeters,
        plannedDriveSeconds: result.summary.plannedDriveSeconds,
        plannedStopSeconds: result.summary.plannedStopSeconds,
        extraDistanceMeters: result.summary.extraDistanceMeters,
        extraDurationSeconds: result.summary.extraDriveSeconds,
      },
    } : current);
  }

  function suggestionsEdited(nextStops: SuggestedTripStop[], stale: boolean, revision?: number) {
    setSuggestedStops(nextStops);
    setPlannedRouteStale(stale);
    if (revision !== undefined) setRouteInputRevision(revision);
  }

  function stationPreferenceChanged(stationId: string, payToPark: boolean) {
    setSuggestedStops((current) => current.map((stop) => stop.stationId === stationId
      ? { ...stop, payToPark }
      : stop));
  }

  function selectedRouteOptimized(result: { stops: SuggestedTripStop[]; summary: SelectedOutAndBackSummary; segments: TripRouteSegment[]; routeInputRevision: number }) {
    setPreviewPending(false); setPreviewError(null);
    setSuggestedStops(result.stops);
    setPlannedSegments(result.segments);
    setPlannedRouteStale(false);
    setRouteInputRevision(result.routeInputRevision);
    setRouteAudit({
      algorithmVersion: result.summary.algorithmVersion,
      technicalLimitReached: result.summary.technicalLimitReached,
      technicalLimitReason: result.summary.technicalLimitReason,
    });
    setRoute((current) => current ? {
      ...current,
      metrics: {
        ...current.metrics,
        plannedDistanceMeters: result.summary.plannedDistanceMeters,
        plannedDriveSeconds: result.summary.plannedDriveSeconds,
        plannedStopSeconds: result.summary.plannedStopSeconds,
        extraDistanceMeters: result.summary.extraDistanceMeters,
        extraDurationSeconds: result.summary.extraDriveSeconds,
      },
    } : current);
  }

  if (plan.status !== "draft") {
    return (
      <div className="mt-6 font-ui">
        <section id="route-basics" className="rounded-[24px] border border-[#bcdcd5] bg-[#e7f5ef] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-[#245e52]">
              <LockKeyhole size={20} aria-hidden />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Route locked</h2>
              <p className="mt-1 text-sm leading-6 text-[#486d69]">
                This Trip is {formatTripStatus(plan.status).toLowerCase()}. Its route basics, Stations, and Stop order are read-only.
              </p>
            </div>
          </div>
        </section>
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(390px,0.85fr)]">
          <div className="xl:sticky xl:top-6 xl:self-start">
            <TripRouteMap origin={origin} destination={destination} baseSegments={route?.segments ?? []} plannedSegments={plannedSegments} plannedRouteStale={plannedRouteStale} stops={suggestedStops} loading={previewPending} routeError={previewError} />
          </div>
          <Summary plan={currentPlan} tripType={tripType} origin={origin} destination={destination} route={route} stopCount={suggestedStops.length} />
        </div>
        <LockedStops plan={currentPlan} stops={suggestedStops} />
      </div>
    );
  }

  return (
    <div className="mt-6 font-ui">
      <section id="route-basics" className="scroll-mt-6 rounded-[28px] border border-[#d5e6df] bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold">Plan your route</h2>
          <p className="mt-1 text-sm leading-6 text-[#486d69]">Select the Superchargers you want to visit. The planner will optimize their visit order.</p>
        </div>
        <TripRouteBasicsFields
          tripType={tripType}
          origin={origin}
          destination={destination}
          disabled={pending !== null}
          onTripTypeChange={setTripType}
          onOriginChange={setOrigin}
          onDestinationChange={setDestination}
        />

        {destructiveChange && routeBasicsDirty ? <p className="mt-5 rounded-2xl bg-[#fffdf2] px-4 py-3 text-sm leading-6 text-[#725d30]">Changing the trip type, origin, or destination will clear the current stops and calculated route.</p> : null}
        {tooClose ? <p role="alert" className="mt-5 rounded-2xl bg-[#fff1f1] px-4 py-3 text-sm text-[#8d2930]">Origin and destination are too close to calculate a useful trip.</p> : null}
        {message ? <p role="status" className="mt-5 rounded-2xl bg-[#e7f5ef] px-4 py-3 text-sm text-[#245e52]">{message}</p> : null}
        {error ? <p role="alert" className="mt-5 rounded-2xl bg-[#fff1f1] px-4 py-3 text-sm text-[#8d2930]">{error}</p> : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          {routeBasicsDirty || !hasCalculatedRoute ? <button
            type="button"
            disabled={pending !== null || !endpointsComplete || Boolean(tooClose)}
            onClick={() => {
              if (routeBasicsDirty) {
                if (destructiveChange) setInvalidationConfirm(true);
                else void saveRouteBasics();
              } else {
                void calculate();
              }
            }}
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-ink px-5 font-semibold text-white disabled:opacity-50"
          >
            {pending === "save" || pending === "calculate" ? <LoaderCircle size={18} className="animate-spin" /> : routeBasicsDirty ? <Save size={18} /> : <Calculator size={18} />}
            {pending === "save" ? "Saving…" : pending === "calculate" ? "Calculating…" : routeBasicsDirty ? "Save Route Basics" : "Calculate Base Route"}
          </button> : null}
          <button
            type="button"
            disabled={pending !== null || !origin || !destination || origin.source === "current_location"}
            onClick={() => { setOrigin(destination); setDestination(origin); }}
            className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#bedbd5] px-4 text-sm font-semibold disabled:opacity-40"
          >
            <ArrowDownUp size={17} /> Swap
          </button>
          {hasCalculatedRoute ? <button type="button" disabled={pending !== null} onClick={() => setClearOpen(true)} className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#d9a8aa] px-4 text-sm font-semibold text-[#8d2930] disabled:opacity-50"><Trash2 size={17} />Clear route</button> : null}
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(390px,0.85fr)]">
        <div className="xl:sticky xl:top-6 xl:self-start">
          <TripRouteMap origin={origin} destination={destination} baseSegments={route?.segments ?? []} plannedSegments={plannedSegments} plannedRouteStale={plannedRouteStale} stops={suggestedStops} loading={pending === "calculate" || previewPending} routeError={previewError} />
        </div>
        <Summary plan={currentPlan} tripType={tripType} origin={origin} destination={destination} route={route} stopCount={suggestedStops.length} />
      </div>

      <div>
        {currentPlan.tripType === "round_trip" ? <TripStationSelectionPanel
          plan={currentPlan}
          origin={origin}
          destination={destination}
          baseSegments={route?.segments ?? []}
          plannedSegments={plannedSegments}
          stops={suggestedStops}
          hasBaseRoute={hasCalculatedRoute && !routeBasicsDirty}
          expectedRevision={routeInputRevision}
          onRouteUpdated={selectedRouteOptimized}
          onPayToParkChanged={stationPreferenceChanged}
        /> : null}
        <TripStopsPanel plan={currentPlan} stops={suggestedStops} hasBaseRoute={hasCalculatedRoute && !routeBasicsDirty} onRouteUpdated={suggestionsGenerated} onStopsEdited={suggestionsEdited} onPayToParkChanged={stationPreferenceChanged} />
      </div>

      {clearOpen ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#102d2a]/55 p-4 sm:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget && pending !== "clear") setClearOpen(false); }}>
        <div role="dialog" aria-modal="true" aria-labelledby="clear-route-title" className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl">
          <h2 id="clear-route-title" className="text-2xl font-semibold">Clear calculated route?</h2>
          <p className="mt-3 text-sm leading-6 text-[#486d69]">This clears the calculated route and planned stops, but keeps your origin and destination.</p>
          <div className="mt-6 grid grid-cols-2 gap-3"><button type="button" disabled={pending === "clear"} onClick={() => setClearOpen(false)} className="min-h-12 rounded-full border border-[#bedbd5] font-semibold">Cancel</button><button type="button" disabled={pending === "clear"} onClick={() => void clearRoute()} className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#9d3037] font-semibold text-white">{pending === "clear" ? <LoaderCircle size={18} className="animate-spin" /> : null}{pending === "clear" ? "Clearing…" : "Clear Route"}</button></div>
        </div>
      </div> : null}

      {invalidationConfirm ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#102d2a]/55 p-4 sm:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget) setInvalidationConfirm(false); }}>
        <div role="dialog" aria-modal="true" aria-labelledby="route-change-warning-title" className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl">
          <h2 id="route-change-warning-title" className="text-2xl font-semibold">Change route inputs?</h2>
          <p className="mt-3 text-sm leading-6 text-[#486d69]">Changing the trip type, origin, or destination will clear the current stops and calculated route.</p>
          <div className="mt-6 grid grid-cols-2 gap-3"><button type="button" onClick={() => setInvalidationConfirm(false)} className="min-h-12 rounded-full border border-[#bedbd5] font-semibold">Cancel</button><button type="button" onClick={() => { setInvalidationConfirm(false); void saveRouteBasics(); }} className="min-h-12 rounded-full bg-ink px-3 font-semibold text-white">Continue &amp; Clear</button></div>
        </div>
      </div> : null}
    </div>
  );
}
