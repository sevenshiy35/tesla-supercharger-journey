"use client";

import {
  ArrowDown, ArrowUp, Calculator, GripVertical, ListChecks, LoaderCircle,
  MapPinPlus, Search, Trash2, X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addTripPlanStopAction, recalculateTripRouteAction, removeTripPlanStopAction,
  reorderTripPlanStopsAction, searchTripStopStationsAction,
  type TripStopMutationState,
} from "@/app/admin/trip-actions";
import { setStationPayToParkAction } from "@/app/admin/station-preference-actions";
import { formatTripDistance, formatTripDuration } from "@/lib/trips/format";
import type {
  SuggestedTripStop, TripPlanStopLeg, TripRoutePlannerPlan, TripRouteSegment,
  TripStopSearchResult, TripSuggestionSummary,
} from "@/lib/trips/types";
import { PayToParkBadge, PayToParkToggleButton } from "./PayToParkPreference";

const STALE_MESSAGE = "The trip changed while this operation was running. Refresh and try again.";

function initialSummary(plan: TripRoutePlannerPlan, stops: SuggestedTripStop[]): TripSuggestionSummary | null {
  if (plan.baseDistanceMeters === null || plan.baseDurationSeconds === null || plan.plannedDistanceMeters === null ||
    plan.plannedDriveSeconds === null || plan.plannedStopSeconds === null || plan.extraDistanceMeters === null || plan.extraDurationSeconds === null) return null;
  const maxDistance = plan.maxExtraMiles === null ? null : plan.maxExtraMiles * 1609.344;
  const overTimeSeconds = Math.max(0, plan.extraDurationSeconds - plan.maxExtraMinutes * 60);
  const overDistanceMeters = maxDistance === null ? 0 : Math.max(0, plan.extraDistanceMeters - maxDistance);
  return {
    corridorCandidateCount: plan.corridorCandidateCount ?? 0, evaluatedCandidateCount: plan.evaluatedCandidateCount ?? 0,
    selectedStopCount: stops.length, unreachableCandidateCount: plan.unreachableCandidateCount ?? 0,
    baseDistanceMeters: plan.baseDistanceMeters, baseDurationSeconds: plan.baseDurationSeconds,
    plannedDistanceMeters: plan.plannedDistanceMeters, plannedDriveSeconds: plan.plannedDriveSeconds,
    plannedStopSeconds: plan.plannedStopSeconds, extraDistanceMeters: plan.extraDistanceMeters,
    extraDriveSeconds: plan.extraDurationSeconds, remainingExtraDriveSeconds: Math.max(0, plan.maxExtraMinutes * 60 - plan.extraDurationSeconds),
    remainingExtraDistanceMeters: maxDistance === null ? null : Math.max(0, maxDistance - plan.extraDistanceMeters),
    outboundStopCount: stops.filter((stop) => stop.leg === "outbound").length, returnStopCount: stops.filter((stop) => stop.leg === "return").length,
    algorithmVersion: plan.algorithmVersion ?? "Not calculated", technicalLimitReached: plan.technicalLimitReached,
    technicalLimitReason: plan.technicalLimitReason, preOptimizationDriveSeconds: plan.plannedDriveSeconds,
    postOptimizationDriveSeconds: plan.plannedDriveSeconds, optimizationImprovementSeconds: 0,
    expectedNewStopCount: stops.filter((stop) => !stop.isVisited).length, alreadyVisitedStopCount: stops.filter((stop) => stop.isVisited).length,
    manualStopCount: stops.filter((stop) => stop.source === "manual").length, lockedStopCount: stops.filter((stop) => stop.isLocked).length,
    overTimeSeconds, overDistanceMeters,
    budgetStatus: overTimeSeconds && overDistanceMeters ? "over_both" : overTimeSeconds ? "over_time" : overDistanceMeters ? "over_distance" : "within",
    plannedRouteStale: plan.plannedRouteStale,
  };
}

function ordered(stops: SuggestedTripStop[]) {
  return [...stops].sort((a, b) => a.sequence - b.sequence).map((stop, sequence) => ({ ...stop, sequence }));
}

function orderPayload(stops: SuggestedTripStop[]) {
  return ordered(stops).map((stop, sequence) => ({ stopId: stop.id, sequence, leg: stop.leg }));
}

function StopCard({ stop, disabled, canMoveEarlier, canMoveLater, roundTrip, onMove, onMoveLeg, onRemove, onDragStart, onDrop }: {
  stop: SuggestedTripStop; disabled: boolean; canMoveEarlier: boolean; canMoveLater: boolean; roundTrip: boolean;
  onMove: (direction: -1 | 1) => void; onMoveLeg: () => void; onRemove: () => void;
  onDragStart: () => void; onDrop: () => void;
}) {
  return <li draggable={!disabled} onDragStart={onDragStart} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onDrop(); }} className={`rounded-[22px] border p-4 sm:p-5 ${stop.source === "manual" ? "border-[#e5c982] bg-[#fffdf5]" : "border-[#d5e6df] bg-white"}`}>
    <div className="flex items-start gap-3">
      <button type="button" disabled={disabled} aria-label={`Drag Stop ${stop.sequence + 1}`} className="flex min-h-11 min-w-11 cursor-grab items-center justify-center rounded-full text-[#67817e] disabled:opacity-40"><GripVertical size={20} /></button>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-action-blue">Stop {stop.sequence + 1} · {stop.leg === "return" ? "Return" : "Outbound"}</p>
        <h3 className="mt-1 text-lg font-semibold">{stop.stationName}</h3>
        <p className="mt-1 text-sm text-[#486d69]">{stop.address} · {stop.city}, {stop.state}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${stop.isVisited ? "bg-[#f3e8d2] text-[#725d30]" : "bg-[#e7f5ef] text-[#245e52]"}`}>{stop.isVisited ? "Visited" : "Expected new"}</span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${stop.source === "manual" ? "bg-[#fff0c8] text-[#725d30]" : "bg-[#eaf1fb] text-[#315f92]"}`}>{stop.source === "manual" ? "Manually added" : "Legacy saved Stop"}</span>
          {stop.payToPark ? <PayToParkBadge /> : null}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 font-data text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-[#67817e]">Estimated detour</dt><dd className="mt-1 font-semibold">{formatTripDuration(stop.estimatedDetourSeconds)}</dd></div>
          <div><dt className="text-xs text-[#67817e]">Added distance</dt><dd className="mt-1 font-semibold">{formatTripDistance(stop.estimatedDetourMeters)}</dd></div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={disabled || !canMoveEarlier} onClick={() => onMove(-1)} className="flex min-h-11 items-center gap-1 rounded-full border border-[#bedbd5] px-3 text-sm font-semibold disabled:opacity-40"><ArrowUp size={16} />Earlier</button>
          <button type="button" disabled={disabled || !canMoveLater} onClick={() => onMove(1)} className="flex min-h-11 items-center gap-1 rounded-full border border-[#bedbd5] px-3 text-sm font-semibold disabled:opacity-40"><ArrowDown size={16} />Later</button>
          {roundTrip ? <button type="button" disabled={disabled} onClick={onMoveLeg} className="min-h-11 rounded-full border border-[#bedbd5] px-3 text-sm font-semibold">Move to {stop.leg === "outbound" ? "Return" : "Outbound"}</button> : null}
          <button type="button" disabled={disabled} onClick={onRemove} className="flex min-h-11 items-center gap-1 rounded-full border border-[#d9a8aa] px-3 text-sm font-semibold text-[#8d2930]"><Trash2 size={16} />Remove</button>
        </div>
      </div>
    </div>
  </li>;
}

function AddStopDialog({ plan, revision, onClose, onAdded, onPreferenceChanged }: { plan: TripRoutePlannerPlan; revision: number; onClose: () => void; onAdded: (result: TripStopMutationState) => void; onPreferenceChanged: (stationId: string, payToPark: boolean) => void }) {
  const [query, setQuery] = useState(""); const [results, setResults] = useState<TripStopSearchResult[]>([]);
  const [searching, setSearching] = useState(false); const [adding, setAdding] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  const [preferencePendingId, setPreferencePendingId] = useState<string | null>(null);
  useEffect(() => {
    if (query.trim().length < 2) return;
    let active = true;
    const timer = window.setTimeout(() => { setSearching(true); setError(null); void searchTripStopStationsAction(plan.id, query).then((result) => {
      if (!active) return;
      setSearching(false); if (!result.ok) setError(result.error ?? "Search failed."); else setResults(result.stations ?? []);
    }); }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [plan.id, query]);
  async function add(station: TripStopSearchResult, leg: TripPlanStopLeg) {
    setAdding(`${station.id}:${leg}`); setError(null);
    const result = await addTripPlanStopAction(plan.id, station.id, leg, revision);
    setAdding(null); if (!result.ok) { setError(result.error ?? "The Stop could not be added."); return; }
    onAdded(result); onClose();
  }
  async function changePreference(station: TripStopSearchResult, payToPark: boolean) {
    if (preferencePendingId) return;
    setPreferencePendingId(station.id); setError(null);
    setResults((current) => current.map((item) => item.id === station.id ? { ...item, payToPark } : item));
    let result: Awaited<ReturnType<typeof setStationPayToParkAction>>;
    try {
      result = await setStationPayToParkAction({ stationId: station.id, payToPark });
    } catch {
      result = { ok: false, error: "The pay-to-park marker could not be saved. Check your connection and try again." };
    }
    setPreferencePendingId(null);
    if (!result.ok || result.payToPark === undefined) {
      setResults((current) => current.map((item) => item.id === station.id ? { ...item, payToPark: station.payToPark } : item));
      setError(result.error ?? "The pay-to-park marker could not be saved.");
      return;
    }
    setResults((current) => current.map((item) => item.id === station.id ? { ...item, payToPark: result.payToPark ?? false } : item));
    onPreferenceChanged(station.id, result.payToPark);
  }
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#102d2a]/55 p-3 sm:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget && !adding) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="add-stop-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[28px] bg-white p-5 shadow-2xl sm:p-6">
      <div className="flex items-center justify-between gap-3"><div><h2 id="add-stop-title" className="text-2xl font-semibold">Add a Supercharger Stop</h2><p className="mt-1 text-sm text-[#486d69]">Search the Station directory, including previously visited locations.</p></div><button type="button" onClick={onClose} className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#bedbd5]" aria-label="Close Add Stop"><X size={19} /></button></div>
      <label className="mt-5 block text-sm font-semibold" htmlFor="trip-stop-search">Search by station, address, city, state, or ZIP</label>
      <div className="relative mt-2"><Search className="absolute left-4 top-3.5 text-[#67817e]" size={19} /><input id="trip-stop-search" value={query} onChange={(event) => { const value = event.target.value; setQuery(value); if (value.trim().length < 2) { setResults([]); setSearching(false); setError(null); } }} autoFocus maxLength={100} className="min-h-12 w-full rounded-full border border-[#bedbd5] pl-11 pr-4 outline-none focus:border-action-blue" placeholder="Type at least 2 characters" /></div>
      {searching ? <p role="status" className="mt-4 flex items-center gap-2 text-sm"><LoaderCircle size={17} className="animate-spin" />Searching…</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-2xl bg-[#fff1f1] p-3 text-sm text-[#8d2930]">{error}</p> : null}
      {!searching && query.trim().length >= 2 && results.length === 0 && !error ? <p className="mt-4 rounded-2xl bg-[#f2f6f3] p-4 text-sm">No matching Superchargers.</p> : null}
      <ul className="mt-4 space-y-3">{results.map((station) => <li key={station.id} className="rounded-[20px] border border-[#d5e6df] p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{station.name}</h3><p className="mt-1 text-sm text-[#486d69]">{station.address}, {station.city}, {station.state} {station.postalCode}</p></div><div className="flex flex-wrap gap-1.5"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${station.isVisited ? "bg-[#f3e8d2] text-[#725d30]" : "bg-[#e7f5ef] text-[#245e52]"}`}>{station.isVisited ? "Visited" : "Unvisited"}</span><span className="rounded-full bg-[#edf0ef] px-2 py-1 text-xs font-semibold">{station.operationalStatus}</span>{station.payToPark ? <PayToParkBadge /> : null}</div></div>
        {station.warning ? <p className="mt-2 text-xs text-[#8d2930]">{station.warning}</p> : null}
        {station.isEndpoint ? <p className="mt-2 text-xs text-[#67817e]">Already used as an endpoint.</p> : station.isExistingStop ? <p className="mt-2 text-xs text-[#67817e]">Already in this Trip Plan.</p> : null}
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={!station.canAdd || adding !== null} onClick={() => void add(station, "outbound")} className="flex min-h-11 items-center gap-2 rounded-full bg-action-blue px-4 text-sm font-semibold text-white disabled:opacity-40">{adding === `${station.id}:outbound` ? <LoaderCircle size={16} className="animate-spin" /> : null}Add Outbound</button>{plan.tripType === "round_trip" ? <button type="button" disabled={!station.canAdd || adding !== null} onClick={() => void add(station, "return")} className="flex min-h-11 items-center gap-2 rounded-full border border-[#bedbd5] px-4 text-sm font-semibold disabled:opacity-40">{adding === `${station.id}:return` ? <LoaderCircle size={16} className="animate-spin" /> : null}Add Return</button> : null}<PayToParkToggleButton payToPark={station.payToPark} pending={preferencePendingId === station.id} onChange={(next) => void changePreference(station, next)} /></div>
      </li>)}</ul>
    </div>
  </div>;
}

export function TripStopsPanel({ plan, stops, hasBaseRoute, onRouteUpdated, onStopsEdited, onPayToParkChanged }: {
  plan: TripRoutePlannerPlan; stops: SuggestedTripStop[]; hasBaseRoute: boolean;
  onRouteUpdated: (result: { stops: SuggestedTripStop[]; summary: TripSuggestionSummary; segments: TripRouteSegment[]; routeInputRevision?: number }) => void;
  onStopsEdited: (stops: SuggestedTripStop[], stale: boolean, revision?: number) => void;
  onPayToParkChanged: (stationId: string, payToPark: boolean) => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState(() => ordered(stops));
  const [summary, setSummary] = useState(() => initialSummary(plan, stops));
  const [revision, setRevision] = useState(plan.routeInputRevision);
  const [stale, setStale] = useState(plan.plannedRouteStale);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false); const [removeStop, setRemoveStop] = useState<SuggestedTripStop | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const incomingStateKey = JSON.stringify({
    revision: plan.routeInputRevision,
    stale: plan.plannedRouteStale,
    metrics: [plan.plannedDistanceMeters, plan.plannedDriveSeconds, plan.plannedStopSeconds, plan.extraDistanceMeters, plan.extraDurationSeconds],
    stops: stops.map((stop) => [stop.id, stop.stationId, stop.sequence, stop.leg, stop.source, stop.isLocked, stop.isVisited, stop.payToPark]),
  });
  const [previousIncomingStateKey, setPreviousIncomingStateKey] = useState(incomingStateKey);
  if (previousIncomingStateKey !== incomingStateKey) {
    setPreviousIncomingStateKey(incomingStateKey);
    setItems(ordered(stops));
    setSummary(initialSummary(plan, stops));
    setRevision(plan.routeInputRevision);
    setStale(plan.plannedRouteStale);
  }
  const outbound = items.filter((stop) => stop.leg === "outbound"); const returning = items.filter((stop) => stop.leg === "return");

  function acceptMutation(result: TripStopMutationState) {
    if (!result.ok || !result.stops || result.routeInputRevision === undefined) { setError(result.error ?? "The Trip Stop change failed."); return false; }
    const next = ordered(result.stops); setItems(next); setRevision(result.routeInputRevision); setStale(Boolean(result.plannedRouteStale));
    if (result.summary !== undefined) setSummary(result.summary); onStopsEdited(next, Boolean(result.plannedRouteStale), result.routeInputRevision); router.refresh(); return true;
  }
  async function mutate(label: string, operation: () => Promise<TripStopMutationState>, success: string) {
    setPending(label); setError(null); setMessage(null); const result = await operation(); setPending(null);
    if (acceptMutation(result)) setMessage(success);
  }
  async function saveOrder(next: SuggestedTripStop[], success = "Stop order saved. Recalculate the route to refresh exact metrics.") {
    const normalized = ordered(next); await mutate("order", () => reorderTripPlanStopsAction(plan.id, revision, orderPayload(normalized)), success);
  }
  function move(stop: SuggestedTripStop, direction: -1 | 1) {
    const sameLeg = items.filter((item) => item.leg === stop.leg); const local = sameLeg.findIndex((item) => item.id === stop.id); const swap = sameLeg[local + direction]; if (!swap) return;
    const next = [...items]; const a = next.findIndex((item) => item.id === stop.id); const b = next.findIndex((item) => item.id === swap.id); [next[a], next[b]] = [next[b], next[a]]; void saveOrder(next);
  }
  function moveLeg(stop: SuggestedTripStop) {
    const target: TripPlanStopLeg = stop.leg === "outbound" ? "return" : "outbound";
    const without = items.filter((item) => item.id !== stop.id); const changed = { ...stop, leg: target };
    const targetLast = without.map((item) => item.leg).lastIndexOf(target);
    without.splice(targetLast < 0 ? (target === "outbound" ? 0 : without.length) : targetLast + 1, 0, changed);
    void saveOrder(without, `Moved ${stop.stationName} to the ${target === "return" ? "Return" : "Outbound"} leg.`);
  }
  function dropOn(target: SuggestedTripStop) {
    if (!dragId || dragId === target.id) return; const dragged = items.find((item) => item.id === dragId); if (!dragged) return;
    const without = items.filter((item) => item.id !== dragId); const index = without.findIndex((item) => item.id === target.id);
    without.splice(index, 0, { ...dragged, leg: target.leg }); setDragId(null); void saveOrder(without);
  }
  async function recalculateRoute() {
    setPending("recalculate"); setError(null); setMessage(null);
    const result = await recalculateTripRouteAction(plan.id); setPending(null);
    if (!result.ok || !result.stops || !result.summary || !result.segments) { setError(result.error ?? "The route operation failed."); return; }
    const next = ordered(result.stops); setItems(next); setSummary(result.summary); setStale(false); onRouteUpdated({ stops: next, summary: result.summary, segments: result.segments, routeInputRevision: result.routeInputRevision });
    if (result.routeInputRevision !== undefined) setRevision(result.routeInputRevision);
    setMessage("Route recalculated with the exact current Stop set and order."); router.refresh();
  }
  const rows = useMemo(() => summary ? [
    ["Total stops", String(items.length)], ["Expected new check-ins", String(items.filter((stop) => !stop.isVisited).length)],
    ["Already visited", String(items.filter((stop) => stop.isVisited).length)], ["Manual / Legacy", `${items.filter((stop) => stop.source === "manual").length} / ${items.filter((stop) => stop.source === "algorithm").length}`],
    ["Outbound / Return", `${outbound.length} / ${returning.length}`], ["Base distance", formatTripDistance(summary.baseDistanceMeters)],
    ["Optimized distance", formatTripDistance(summary.plannedDistanceMeters)], ["Base drive time", formatTripDuration(summary.baseDurationSeconds)],
    ["Optimized drive time", formatTripDuration(summary.plannedDriveSeconds)],
    ["Additional drive time", formatTripDuration(summary.extraDriveSeconds)], ["Additional distance", formatTripDistance(summary.extraDistanceMeters)],
    ["Route status", stale ? "Needs recalculation" : "Up to date"],
  ] : [], [items, outbound.length, returning.length, stale, summary]);
  const renderLeg = (legStops: SuggestedTripStop[]) => <ol className="mt-4 space-y-3">{legStops.map((stop, index) => <StopCard key={stop.id} stop={stop} disabled={pending !== null} canMoveEarlier={index > 0} canMoveLater={index < legStops.length - 1} roundTrip={plan.tripType === "round_trip"} onMove={(direction) => move(stop, direction)} onMoveLeg={() => moveLeg(stop)} onRemove={() => setRemoveStop(stop)} onDragStart={() => setDragId(stop.id)} onDrop={() => dropOn(stop)} />)}</ol>;

  return <section className="mt-5 rounded-[28px] border border-[#d5e6df] bg-white p-5 shadow-sm sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-3"><ListChecks size={22} className="text-action-blue" /><h2 className="text-2xl font-semibold">Planned Stops</h2></div><p className="mt-2 max-w-2xl text-sm leading-6 text-[#486d69]">Add, remove, reorder, or move Supercharger Stops yourself, then recalculate the exact route.</p></div><button type="button" disabled={!hasBaseRoute || pending !== null} onClick={() => setAddOpen(true)} className="flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 font-semibold text-white disabled:opacity-40"><MapPinPlus size={18} />Add Stop</button></div>
    {!hasBaseRoute ? <p className="mt-4 rounded-2xl bg-[#fffdf2] p-4 text-sm text-[#725d30]">Calculate the Base Route before planning Stops.</p> : null}
    {stale ? <p role="status" className="mt-4 rounded-2xl border border-[#e5c982] bg-[#fffaf0] p-4 text-sm font-semibold text-[#725d30]">Route needs recalculation. The old route line is not current.</p> : null}
    {message ? <p role="status" className="mt-4 rounded-2xl bg-[#e7f5ef] p-4 text-sm text-[#245e52]">{message}</p> : null}{error ? <p role="alert" className="mt-4 rounded-2xl bg-[#fff1f1] p-4 text-sm text-[#8d2930]">{error.includes("changed while") ? STALE_MESSAGE : error}</p> : null}
    <div className="mt-5 grid gap-3 sm:max-w-md">
      <button type="button" disabled={!hasBaseRoute || pending !== null} onClick={() => void recalculateRoute()} className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-action-blue px-4 font-semibold text-white disabled:opacity-40">{pending === "recalculate" ? <LoaderCircle size={18} className="animate-spin" /> : <Calculator size={18} />}Recalculate Route</button>
    </div>
    {summary ? <dl className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{rows.map(([label, value]) => <div key={label} className="rounded-2xl bg-[#f2f6f3] p-4"><dt className="text-xs text-[#67817e]">{label}</dt><dd className="mt-1 font-data font-semibold">{value}</dd></div>)}</dl> : null}
    <div className="mt-7"><h3 className="text-xl font-semibold">Outbound Stops</h3>{outbound.length ? renderLeg(outbound) : <p className="mt-3 rounded-2xl bg-[#f2f6f3] p-4 text-sm text-[#486d69]">No outbound Stops.</p>}</div>
    <div className="my-6 rounded-[22px] border-2 border-dashed border-[#bedbd5] bg-[#f7faf8] p-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-action-blue">Destination</p><p className="mt-1 text-lg font-semibold">{plan.destinationLabel ?? "Not selected"}</p><p className="mt-1 text-sm text-[#486d69]">Fixed route endpoint</p></div>
    {plan.tripType === "round_trip" ? <div><h3 className="text-xl font-semibold">Return Stops</h3>{returning.length ? renderLeg(returning) : <p className="mt-3 rounded-2xl bg-[#f2f6f3] p-4 text-sm text-[#486d69]">No return Stops.</p>}</div> : null}
    {addOpen ? <AddStopDialog plan={plan} revision={revision} onClose={() => setAddOpen(false)} onAdded={(result) => { if (acceptMutation(result)) setMessage("Manual Stop added. Recalculate when ready."); }} onPreferenceChanged={onPayToParkChanged} /> : null}
    {removeStop ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#102d2a]/55 p-4 sm:items-center"><div role="dialog" aria-modal="true" aria-labelledby="remove-stop-title" className="w-full max-w-md rounded-[28px] bg-white p-6"><h2 id="remove-stop-title" className="text-2xl font-semibold">Remove {removeStop.stationName}?</h2><p className="mt-3 text-sm text-[#486d69]">This removes the Stop from this Draft only. It does not change Station or Visit data.</p><div className="mt-6 grid grid-cols-2 gap-3"><button type="button" disabled={pending !== null} onClick={() => setRemoveStop(null)} className="min-h-12 rounded-full border border-[#bedbd5] font-semibold">Cancel</button><button type="button" disabled={pending !== null} onClick={() => void mutate("remove", () => removeTripPlanStopAction(plan.id, removeStop.id, revision), `${removeStop.stationName} removed.`).then(() => setRemoveStop(null))} className="min-h-12 rounded-full bg-[#9d3037] font-semibold text-white">Remove Stop</button></div></div></div> : null}
  </section>;
}
