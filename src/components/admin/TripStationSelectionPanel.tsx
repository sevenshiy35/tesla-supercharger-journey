"use client";

import { LoaderCircle, Map as MapIcon, Sparkles, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  optimizeSelectedOutAndBackStationsAction,
  type SelectedOutAndBackMutationState,
} from "@/app/admin/trip-actions";
import { setStationPayToParkAction } from "@/app/admin/station-preference-actions";
import { isMapboxMatrixFeatureEnabled } from "@/lib/mapbox/client-config";
import { formatTripDistance, formatTripDuration } from "@/lib/trips/format";
import { MAX_SELECTED_STATIONS_PER_OPTIMIZATION } from "@/lib/trips/planning-config";
import type {
  SuggestedTripStop,
  TripEndpoint,
  TripRoutePlannerPlan,
  TripRouteSegment,
  TripStationCandidate,
} from "@/lib/trips/types";
import { TripStationSelectionMap } from "./TripStationSelectionMap";
import { PayToParkBadge, PayToParkToggleButton } from "./PayToParkPreference";

const DISPLAY_CORRIDORS = [10, 20, 30, 50] as const;
const MAX_SELECTED_STATIONS = MAX_SELECTED_STATIONS_PER_OPTIMIZATION;
const OPTIMIZATION_PHASES = [
  "Validating selected stations",
  "Loading road network costs",
  "Building travel-time matrix",
  "Assigning outbound and return stops",
  "Optimizing visit order",
  "Calculating final route",
  "Saving trip",
] as const;

interface CandidateResponse {
  candidates?: TripStationCandidate[];
  queryLimitReached?: boolean;
  maximumSelectableStations?: number;
  error?: string;
}

export function TripStationSelectionPanel({
  plan,
  origin,
  destination,
  baseSegments,
  plannedSegments,
  stops,
  hasBaseRoute,
  expectedRevision,
  onRouteUpdated,
  onPayToParkChanged,
}: {
  plan: TripRoutePlannerPlan;
  origin: TripEndpoint | null;
  destination: TripEndpoint | null;
  baseSegments: TripRouteSegment[];
  plannedSegments: TripRouteSegment[];
  stops: SuggestedTripStop[];
  hasBaseRoute: boolean;
  expectedRevision: number;
  onRouteUpdated: (result: Required<Pick<SelectedOutAndBackMutationState, "stops" | "summary" | "segments" | "routeInputRevision">>) => void;
  onPayToParkChanged: (stationId: string, payToPark: boolean) => void;
}) {
  const router = useRouter();
  const matrixApiEnabled = isMapboxMatrixFeatureEnabled();
  const [corridorMiles, setCorridorMiles] = useState(10);
  const [candidates, setCandidates] = useState<TripStationCandidate[]>([]);
  const [candidatePending, setCandidatePending] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [showVisited, setShowVisited] = useState(false);
  const [showCurrentStops, setShowCurrentStops] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(stops.map((stop) => stop.stationId)));
  const selectedIdsRef = useRef(selectedIds);
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const [fitRequest, setFitRequest] = useState<{ key: number; target: "base" | "selected" }>({ key: 0, target: "base" });
  const [pending, setPending] = useState(false);
  const [phase, setPhase] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreachableIds, setUnreachableIds] = useState<string[]>([]);
  const [result, setResult] = useState<SelectedOutAndBackMutationState["summary"]>(undefined);
  const [resultStationSignature, setResultStationSignature] = useState<string | null>(null);
  const [preferencePendingStationId, setPreferencePendingStationId] = useState<string | null>(null);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);
  const [activeStationId, setActiveStationId] = useState<string | null>(null);
  const preferenceOverridesRef = useRef(new Map<string, boolean>());

  const savedStationSignature = useMemo(
    () => stops.map((stop) => stop.stationId).sort().join(","),
    [stops],
  );
  const savedRouteSignature = useMemo(
    () => JSON.stringify(stops.map((stop) => [stop.stationId, stop.sequence, stop.leg, stop.source, stop.isLocked])),
    [stops],
  );
  const [previousSavedStationSignature, setPreviousSavedStationSignature] = useState(savedStationSignature);
  if (previousSavedStationSignature !== savedStationSignature) {
    setPreviousSavedStationSignature(savedStationSignature);
    setSelectedIds(new Set(stops.map((stop) => stop.stationId)));
  }
  if (result && resultStationSignature !== savedRouteSignature) {
    setResult(undefined);
    setResultStationSignature(null);
  }

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    if (!hasBaseRoute || !origin || !destination) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCandidatePending(true);
      setCandidateError(null);
      const params = new URLSearchParams({ corridorMiles: String(corridorMiles), visited: "all" });
      void fetch(`/api/admin/trips/${plan.id}/station-candidates?${params}`, {
        cache: "no-store",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      }).then(async (response) => {
        const payload = await response.json() as CandidateResponse;
        if (!response.ok || !payload.candidates) throw new Error(payload.error ?? "Station candidates are unavailable.");
        setCandidates((current) => {
          const merged = new Map(payload.candidates?.map((candidate) => [candidate.stationId, candidate]));
          for (const candidate of current) {
            if (selectedIdsRef.current.has(candidate.stationId) && !merged.has(candidate.stationId)) {
              merged.set(candidate.stationId, candidate);
            }
          }
          return [...merged.values()].map((candidate) => preferenceOverridesRef.current.has(candidate.stationId)
            ? { ...candidate, payToPark: preferenceOverridesRef.current.get(candidate.stationId) ?? false }
            : candidate);
        });
      }).catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setCandidateError(caught instanceof Error ? caught.message : "Station candidates are unavailable.");
        }
      }).finally(() => { if (!controller.signal.aborted) setCandidatePending(false); });
    }, 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [corridorMiles, destination, hasBaseRoute, origin, plan.id]);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => setPhase((value) => Math.min(value + 1, OPTIMIZATION_PHASES.length - 1)), 1500);
    return () => window.clearInterval(timer);
  }, [pending]);

  const listedCandidates = useMemo(() => candidates.filter((candidate) => {
    if (selectedIds.has(candidate.stationId)) return true;
    if (candidate.isAlreadyInTrip) return showCurrentStops;
    if (candidate.isVisited && !showVisited) return false;
    return true;
  }), [candidates, selectedIds, showCurrentStops, showVisited]);
  const mapCandidates = listedCandidates;
  const selectedCandidates = useMemo(() => [...selectedIds].map((stationId) =>
    candidates.find((candidate) => candidate.stationId === stationId)).filter((candidate): candidate is TripStationCandidate => Boolean(candidate)),
  [candidates, selectedIds]);
  const activeCandidate = useMemo(
    () => candidates.find((candidate) => candidate.stationId === activeStationId) ?? null,
    [activeStationId, candidates],
  );
  const selectedCount = selectedIds.size;
  const disabled = pending || !hasBaseRoute;

  const toggle = useCallback((stationId: string) => {
    if (pending) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(stationId)) next.delete(stationId);
      else if (next.size < MAX_SELECTED_STATIONS) next.add(stationId);
      return next;
    });
  }, [pending]);
  const requestToggle = useCallback((stationId: string) => {
    const willSelect = !selectedIds.has(stationId);
    setActiveStationId((current) => willSelect ? stationId : current === stationId ? null : current);
    toggle(stationId);
  }, [selectedIds, toggle]);
  const reportVisible = useCallback((stationIds: string[]) => setVisibleIds(stationIds), []);

  const changePayToPark = useCallback(async (stationId: string, payToPark: boolean) => {
    if (preferencePendingStationId) return;
    const previous = candidates.find((candidate) => candidate.stationId === stationId)?.payToPark ?? false;
    const removedFromSelection = payToPark && !previous && selectedIdsRef.current.has(stationId);
    if (removedFromSelection) {
      setSelectedIds((current) => {
        if (!current.has(stationId)) return current;
        const next = new Set(current);
        next.delete(stationId);
        selectedIdsRef.current = next;
        return next;
      });
      setActiveStationId((current) => current === stationId ? null : current);
      setSelectionMessage(null);
    }
    preferenceOverridesRef.current.set(stationId, payToPark);
    setCandidates((current) => current.map((candidate) => candidate.stationId === stationId
      ? { ...candidate, payToPark }
      : candidate));
    setPreferencePendingStationId(stationId);
    setPreferenceError(null);
    let response: Awaited<ReturnType<typeof setStationPayToParkAction>>;
    try {
      response = await setStationPayToParkAction({ stationId, payToPark });
    } catch {
      response = { ok: false, error: "The pay-to-park marker could not be saved. Check your connection and try again." };
    }
    setPreferencePendingStationId(null);
    if (!response.ok || response.payToPark === undefined) {
      preferenceOverridesRef.current.set(stationId, previous);
      setCandidates((current) => current.map((candidate) => candidate.stationId === stationId
        ? { ...candidate, payToPark: previous }
        : candidate));
      if (removedFromSelection) {
        setSelectedIds((current) => {
          if (current.has(stationId)) return current;
          const restored = new Set(current);
          restored.add(stationId);
          selectedIdsRef.current = restored;
          return restored;
        });
        setActiveStationId((current) => current ?? stationId);
      }
      setPreferenceError(response.error ?? "The pay-to-park marker could not be saved.");
      return;
    }
    preferenceOverridesRef.current.set(stationId, response.payToPark);
    setCandidates((current) => current.map((candidate) => candidate.stationId === stationId
      ? { ...candidate, payToPark: response.payToPark ?? false }
      : candidate));
    onPayToParkChanged(stationId, response.payToPark);
    router.refresh();
  }, [candidates, onPayToParkChanged, preferencePendingStationId, router]);

  function selectVisibleUnvisited() {
    const visible = new Set(visibleIds);
    let skippedPayToPark = 0;
    const next = new Set(selectedIds);
    for (const candidate of candidates) {
      if (!visible.has(candidate.stationId) || candidate.isVisited || !candidate.isSelectable) continue;
      if (candidate.payToPark) {
        if (!next.has(candidate.stationId)) skippedPayToPark += 1;
        continue;
      }
      if (next.size < MAX_SELECTED_STATIONS) next.add(candidate.stationId);
    }
    setSelectedIds(next);
    setSelectionMessage(`Selected ${next.size} stations. Skipped ${skippedPayToPark} marked pay-to-park ${skippedPayToPark === 1 ? "station" : "stations"}.`);
  }

  async function optimize() {
    if (!matrixApiEnabled) {
      setError("Matrix optimization is temporarily paused to prevent additional usage charges.");
      return;
    }
    setConfirmOpen(false);
    setPending(true);
    setPhase(0);
    setError(null);
    setUnreachableIds([]);
    const response = await optimizeSelectedOutAndBackStationsAction({
      tripPlanId: plan.id,
      expectedRevision,
      selectedStationIds: [...selectedIds],
    });
    setPending(false);
    if (!response.ok || !response.stops || !response.summary || !response.segments || response.routeInputRevision === undefined) {
      setError(response.error ?? "The selected route could not be optimized.");
      setUnreachableIds(response.unreachableStationIds ?? []);
      return;
    }
    setResult(response.summary);
    setResultStationSignature(JSON.stringify(response.stops.map((stop) => [
      stop.stationId, stop.sequence, stop.leg, stop.source, stop.isLocked,
    ])));
    setSelectedIds(new Set(response.stops.map((stop) => stop.stationId)));
    onRouteUpdated({
      stops: response.stops,
      summary: response.summary,
      segments: response.segments,
      routeInputRevision: response.routeInputRevision,
    });
    router.refresh();
  }

  function requestOptimization() {
    if (!matrixApiEnabled) {
      setError("Matrix optimization is temporarily paused to prevent additional usage charges.");
      return;
    }
    if (stops.length > 0 || selectedCount === 0) setConfirmOpen(true);
    else void optimize();
  }

  const unreachable = unreachableIds.map((id) =>
    candidates.find((candidate) => candidate.stationId === id)?.name ?? id);
  const summaryRows = result ? [
    ["Selected stations", String(result.selectedStopCount)],
    ["Expected new check-ins", String(result.expectedNewStopCount)],
    ["Already visited", String(result.alreadyVisitedStopCount)],
    ["Outbound / Return", `${result.outboundStopCount} / ${result.returnStopCount}`],
    ["Base distance", formatTripDistance(result.baseDistanceMeters)],
    ["Base drive time", formatTripDuration(result.baseDurationSeconds)],
    ["Optimized distance", formatTripDistance(result.plannedDistanceMeters)],
    ["Optimized drive time", formatTripDuration(result.plannedDriveSeconds)],
    ["Additional drive time", formatTripDuration(result.extraDriveSeconds)],
    ["Additional distance", formatTripDistance(result.extraDistanceMeters)],
  ] : [];

  if (plan.tripType !== "round_trip") return null;
  return <section className="mt-5 rounded-[28px] border border-[#bcdcd5] bg-white p-5 shadow-sm sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="flex items-center gap-3"><MapIcon size={23} className="text-action-blue" /><h2 className="text-2xl font-semibold">Select Stations on Map</h2></div><p className="mt-2 max-w-3xl text-sm leading-6 text-[#486d69]">Select every Supercharger you want to visit. The planner assigns outbound and return legs and finds a fast delivery-style visit order using real road travel times.</p></div>
      <div className="rounded-full bg-[#e7f5ef] px-4 py-2 text-sm font-semibold text-[#245e52]">{selectedCount} selected</div>
    </div>
    <p className="mt-4 rounded-2xl bg-[#f2f6f3] p-4 text-sm leading-6 text-[#486d69]">Every selected Station is kept. The planner only assigns legs and optimizes visit order.</p>
    {!hasBaseRoute || !origin || !destination ? <p className="mt-4 rounded-2xl bg-[#fffdf2] p-4 text-sm text-[#725d30]">Calculate a round-trip Base Route before selecting Stations.</p> : <>
      <div className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        <TripStationSelectionMap
          origin={origin}
          destination={destination}
          baseSegments={baseSegments}
          plannedSegments={plannedSegments}
          candidates={mapCandidates}
          selectedStationIds={selectedIds}
          savedStops={stops}
          disabled={pending}
          fitRequest={fitRequest}
          onToggle={requestToggle}
          preferencePendingStationId={preferencePendingStationId}
          onPayToParkChange={changePayToPark}
          onVisibleCandidateIdsChange={reportVisible}
        />
        <div className="flex flex-col gap-4 lg:min-h-[620px]">
          {activeCandidate ? <div className="rounded-2xl border border-[#bcdcd5] bg-[#f7faf8] p-3" aria-label="Map Station parking preference">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#67817e]">Pay to park marker</p>
            <div className="mt-2"><p className="font-semibold leading-5">{activeCandidate.name}</p><p className="mt-1 text-xs text-[#67817e]">{activeCandidate.city}, {activeCandidate.state}</p><div className="mt-3"><PayToParkToggleButton payToPark={activeCandidate.payToPark} pending={preferencePendingStationId === activeCandidate.stationId} onChange={(next) => void changePayToPark(activeCandidate.stationId, next)} /></div></div>
          </div> : null}
          <label className="block text-sm font-semibold" htmlFor="station-display-corridor">Display corridor</label>
          <select id="station-display-corridor" disabled={pending} value={corridorMiles} onChange={(event) => setCorridorMiles(Number(event.target.value))} className="min-h-12 w-full rounded-full border border-[#bedbd5] bg-white px-4 disabled:opacity-50">{DISPLAY_CORRIDORS.map((miles) => <option key={miles} value={miles}>{miles} miles</option>)}</select>
          <p className="text-xs leading-5 text-[#67817e]">This only controls which nearby stations are shown on the map.</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={pending} checked={showVisited} onChange={(event) => setShowVisited(event.target.checked)} />Show visited Stations</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={pending} checked={showCurrentStops} onChange={(event) => setShowCurrentStops(event.target.checked)} />Show current Trip Stops</label>
          <div className="flex flex-wrap gap-3 text-xs text-[#67817e]" aria-label="Station map legend"><span>○ Unvisited</span><span>● Selected</span><span className="font-semibold text-[#594609]">$ Pay to park — personal marker</span></div>
          <p className="rounded-2xl bg-[#fff9db] p-3 text-xs leading-5 text-[#594609]">Stations marked pay to park are skipped by Select all visible, but you can still select them individually.</p>
          <div className="grid gap-2">
            <button type="button" disabled={disabled} onClick={selectVisibleUnvisited} className="min-h-11 rounded-full border border-[#bedbd5] px-4 text-sm font-semibold disabled:opacity-40">Select all visible unvisited</button>
            <button type="button" disabled={disabled || selectedCount === 0} onClick={() => { setSelectedIds(new Set()); setActiveStationId(null); setSelectionMessage(null); }} className="min-h-11 rounded-full border border-[#d9a8aa] px-4 text-sm font-semibold text-[#8d2930] disabled:opacity-40">Clear selection</button>
            <div className="grid grid-cols-2 gap-2"><button type="button" disabled={disabled} onClick={() => setFitRequest((value) => ({ key: value.key + 1, target: "base" }))} className="min-h-10 rounded-full border border-[#bedbd5] text-xs font-semibold">Fit base route</button><button type="button" disabled={disabled || selectedCount === 0} onClick={() => setFitRequest((value) => ({ key: value.key + 1, target: "selected" }))} className="min-h-10 rounded-full border border-[#bedbd5] text-xs font-semibold disabled:opacity-40">Fit selected</button></div>
          </div>
          {candidatePending ? <p role="status" className="flex items-center gap-2 text-sm text-[#486d69]"><LoaderCircle size={16} className="animate-spin" />Loading Station candidates…</p> : null}
          {candidateError ? <p role="alert" className="rounded-2xl bg-[#fff1f1] p-3 text-sm text-[#8d2930]">{candidateError}</p> : null}
          {preferenceError ? <p role="alert" className="rounded-2xl bg-[#fff1f1] p-3 text-sm text-[#8d2930]">{preferenceError}</p> : null}
          {selectionMessage ? <p role="status" className="rounded-2xl bg-[#e7f5ef] p-3 text-sm text-[#245e52]">{selectionMessage}</p> : null}
        </div>
      </div>
      {pending ? <p role="status" className="mt-5 flex items-center gap-2 rounded-2xl bg-[#e7f5ef] p-4 text-sm font-semibold text-[#245e52]"><LoaderCircle size={18} className="animate-spin" />{OPTIMIZATION_PHASES[phase]}…</p> : null}
      {error ? <div role="alert" className="mt-5 rounded-2xl bg-[#fff1f1] p-4 text-sm text-[#8d2930]"><p>{error}</p>{unreachable.length > 0 ? <ul className="mt-2 list-disc pl-5">{unreachable.map((name) => <li key={name}>{name}</li>)}</ul> : null}</div> : null}
      <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" disabled={!matrixApiEnabled || pending || candidatePending || selectedCount > MAX_SELECTED_STATIONS} onClick={requestOptimization} className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 font-semibold text-white disabled:opacity-40">{pending ? <LoaderCircle size={18} className="animate-spin" /> : <Sparkles size={18} />}{matrixApiEnabled ? "Optimize Selected Stations" : "Matrix Optimization Paused"}</button><span className="text-xs text-[#67817e]">{matrixApiEnabled ? "Optimized using real road travel times. Actual traffic and driving conditions may vary." : "Maps, address search, and standard route calculation remain available."}</span></div>
      {selectedCandidates.length > 0 ? <div className="mt-5 rounded-[22px] border border-[#bcdcd5] bg-[#f7faf8] p-4"><h3 className="font-semibold">Selected Stations</h3><ul className="mt-3 grid gap-3 md:grid-cols-2">{selectedCandidates.map((candidate) => <li key={candidate.stationId} className="rounded-2xl border border-[#d5e6df] bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{candidate.name}</p><p className="mt-1 text-xs text-[#67817e]">{candidate.address} · {candidate.city}, {candidate.state}</p></div><button type="button" disabled={pending} onClick={() => requestToggle(candidate.stationId)} aria-label={`Remove ${candidate.name} from selection`} className="flex min-h-10 shrink-0 items-center gap-1 rounded-full border border-[#d9a8aa] px-3 text-xs font-semibold text-[#8d2930] disabled:opacity-40"><Trash2 size={14} />Remove</button></div><div className="mt-3 flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${candidate.isVisited ? "bg-[#f3e8d2] text-[#725d30]" : "bg-[#e7f5ef] text-[#245e52]"}`}>{candidate.isVisited ? "Visited" : "Expected new"}</span>{candidate.payToPark ? <PayToParkBadge /> : null}</div></li>)}</ul></div> : null}
    </>}
    {result ? <div className="mt-6"><h3 className="text-xl font-semibold">Optimized route</h3><dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{summaryRows.map(([label, value]) => <div key={label} className="rounded-2xl bg-[#f2f6f3] p-4"><dt className="text-xs text-[#67817e]">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}</dl></div> : null}
    {confirmOpen ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#102d2a]/55 p-4 sm:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmOpen(false); }}><div role="dialog" aria-modal="true" aria-labelledby="optimize-selected-title" className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h2 id="optimize-selected-title" className="text-2xl font-semibold">{selectedCount === 0 ? "Clear every Trip Stop?" : "Replace and reorder Trip Stops?"}</h2><p className="mt-3 text-sm leading-6 text-[#486d69]">{selectedCount === 0 ? "Optimizing an empty selection removes all current Stops and restores the Base Route." : `All ${selectedCount} selected Stations will be saved as manually selected Stops. Existing leg assignments and order may change.`}</p></div><button type="button" onClick={() => setConfirmOpen(false)} aria-label="Close" className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[#bedbd5]"><X size={18} /></button></div><div className="mt-6 grid grid-cols-2 gap-3"><button type="button" onClick={() => setConfirmOpen(false)} className="min-h-12 rounded-full border border-[#bedbd5] font-semibold">Cancel</button><button type="button" onClick={() => void optimize()} className="min-h-12 rounded-full bg-ink px-3 font-semibold text-white">Continue</button></div></div></div> : null}
  </section>;
}
