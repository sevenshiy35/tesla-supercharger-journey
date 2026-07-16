"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import mapboxgl, { type ErrorEvent as MapboxErrorEvent } from "mapbox-gl";
import { MapPinned, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { applyJourneyBaseMapStyle, journeyMapColors } from "@/lib/map/journey-map-style";
import { classifyTripMapFatalError, tripMapFatalErrorMessage } from "@/lib/mapbox/map-error";
import type {
  SuggestedTripStop,
  TripEndpoint,
  TripRouteSegment,
  TripStationCandidate,
} from "@/lib/trips/types";

interface FitData {
  candidates: TripStationCandidate[];
  selectedStationIds: ReadonlySet<string>;
  baseSegments: TripRouteSegment[];
}

export function TripStationSelectionMap({
  origin,
  destination,
  baseSegments,
  plannedSegments,
  candidates,
  selectedStationIds,
  savedStops,
  disabled,
  fitRequest,
  onToggle,
  preferencePendingStationId,
  onPayToParkChange,
  onVisibleCandidateIdsChange,
}: {
  origin: TripEndpoint;
  destination: TripEndpoint;
  baseSegments: TripRouteSegment[];
  plannedSegments: TripRouteSegment[];
  candidates: TripStationCandidate[];
  selectedStationIds: ReadonlySet<string>;
  savedStops: SuggestedTripStop[];
  disabled: boolean;
  fitRequest: { key: number; target: "base" | "selected" };
  onToggle: (stationId: string) => void;
  preferencePendingStationId: string | null;
  onPayToParkChange: (stationId: string, payToPark: boolean) => void;
  onVisibleCandidateIdsChange: (stationIds: string[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const candidateRef = useRef<TripStationCandidate[]>([]);
  const visibleCallbackRef = useRef(onVisibleCandidateIdsChange);
  const stationMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const fitDataRef = useRef<FitData>({ candidates, selectedStationIds, baseSegments });
  const lastFitRef = useRef("");
  const [mapError, setMapError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [mapReady, setMapReady] = useState(0);

  useEffect(() => {
    candidateRef.current = candidates;
    visibleCallbackRef.current = onVisibleCandidateIdsChange;
    fitDataRef.current = { candidates, selectedStationIds, baseSegments };
  }, [baseSegments, candidates, onVisibleCandidateIdsChange, selectedStationIds]);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const container = containerRef.current;
    if (!token || !container) return;
    mapboxgl.accessToken = token;
    let map: mapboxgl.Map;
    let active = true;
    let resizeFrame: number | null = null;
    try {
      map = new mapboxgl.Map({
        container,
        style: "mapbox://styles/mapbox/light-v11",
        center: [(origin.longitude + destination.longitude) / 2, (origin.latitude + destination.latitude) / 2],
        zoom: 6,
        attributionControl: false,
        projection: "mercator",
        bearing: 0,
        pitch: 0,
        minPitch: 0,
        maxPitch: 0,
        cooperativeGestures: false,
        dragRotate: false,
        touchPitch: false,
      });
    } catch {
      queueMicrotask(() => setMapError("The Station selection map could not be initialized."));
      return;
    }
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    const resizeObserver = new ResizeObserver(() => {
      if (!active) return;
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        if (active) map.resize();
      });
    });
    resizeObserver.observe(container);
    map.on("error", (event: MapboxErrorEvent) => {
      const fatal = classifyTripMapFatalError(event.error?.message ?? "");
      if (fatal && active) setMapError(tripMapFatalErrorMessage(fatal));
    });
    map.on("webglcontextlost", () => {
      if (active) setMapError(tripMapFatalErrorMessage("webgl"));
    });
    const reportVisible = () => {
      const bounds = map.getBounds();
      if (!bounds) return;
      visibleCallbackRef.current(candidateRef.current
        .filter((candidate) => bounds.contains([candidate.longitude, candidate.latitude]))
        .map((candidate) => candidate.stationId));
    };
    map.on("moveend", reportVisible);
    map.on("load", () => {
      try {
        applyJourneyBaseMapStyle(map);
        const bounds = new mapboxgl.LngLatBounds();
        for (const endpoint of [origin, destination]) {
          bounds.extend([endpoint.longitude, endpoint.latitude]);
          new mapboxgl.Marker({
            color: endpoint === origin
              ? journeyMapColors.selectedStateBoundary
              : journeyMapColors.highwayStroke,
            scale: 0.55,
          })
            .setLngLat([endpoint.longitude, endpoint.latitude])
            .setPopup(new mapboxgl.Popup({ offset: 14 }).setText(endpoint.label))
            .addTo(map);
        }
        for (const segment of baseSegments) {
          const id = `selection-base-${segment.leg}-${segment.segmentIndex}`;
          map.addSource(id, { type: "geojson", data: { type: "Feature", properties: {}, geometry: segment.geometry } });
          map.addLayer({
            id,
            source: id,
            type: "line",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": segment.leg === "outbound"
                ? journeyMapColors.countryBoundary
                : journeyMapColors.stateBoundary,
              "line-width": 3,
              "line-opacity": 0.52,
              ...(segment.leg === "return" ? { "line-dasharray": [2, 2] } : {}),
            },
          });
          for (const coordinate of segment.geometry.coordinates) bounds.extend(coordinate);
        }
        for (const segment of plannedSegments) {
          const id = `selection-planned-${segment.leg}-${segment.segmentIndex}`;
          map.addSource(id, { type: "geojson", data: { type: "Feature", properties: {}, geometry: segment.geometry } });
          map.addLayer({
            id,
            source: id,
            type: "line",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": segment.leg === "outbound"
                ? journeyMapColors.selectedStateBoundary
                : journeyMapColors.highwayStroke,
              "line-width": 5,
              "line-opacity": 0.9,
              ...(segment.leg === "return" ? { "line-dasharray": [2, 1.4] } : {}),
            },
          });
        }
        if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 0 });
        reportVisible();
        if (active) {
          setMapError(null);
          setMapReady((value) => value + 1);
        }
      } catch {
        if (active) setMapError("The route layers could not be displayed safely.");
      }
    });
    return () => {
      active = false;
      resizeObserver.disconnect();
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      stationMarkersRef.current = [];
      if (mapRef.current === map) mapRef.current = null;
      map.remove();
    };
  }, [baseSegments, destination, origin, plannedSegments, retryKey]);

  // Candidate markers update independently so selecting a Station does not
  // recreate or recenter the whole map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded()) return;
    for (const marker of stationMarkersRef.current) marker.remove();
    const markers: mapboxgl.Marker[] = [];
    const stopByStation = new Map(savedStops.map((stop) => [stop.stationId, stop]));
    for (const candidate of candidates) {
      const selected = selectedStationIds.has(candidate.stationId);
      const saved = stopByStation.get(candidate.stationId);
      const marker = document.createElement("button");
      marker.type = "button";
      marker.disabled = disabled || (!candidate.isSelectable && !selected);
      marker.className = `flex size-7 relative items-center justify-center rounded-full bg-transparent p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#173f3c] disabled:cursor-not-allowed ${selected ? "ring-2 ring-[#167d73] ring-offset-1" : ""}`;
      const markerVisual = document.createElement("span");
      markerVisual.className = `pointer-events-none flex items-center justify-center rounded-full font-bold shadow-sm transition ${
        saved || selected || candidate.payToPark ? "size-[18px] border-2 text-[10px]" : "size-3 border text-[7px]"
      } ${
        candidate.payToPark ? "border-[#8b6a0a] bg-[#f7d65c] text-[#3d3008]" :
        !candidate.isSelectable ? "border-[#999] bg-[#ddd] text-[#666]" :
        saved ? "border-white bg-[#315f92] text-white" :
        selected && candidate.isVisited ? "border-[#7c5d1f] bg-[#f3c85f] text-[#32230a]" :
        selected ? "border-white bg-[#167d73] text-white" :
        candidate.isVisited ? "border-[#b79b62] bg-[#f3e8d2] text-[#725d30]" :
        "border-[#8abeb7] bg-white text-[#245e52]"
      }`;
      markerVisual.textContent = candidate.payToPark ? "$" : saved ? String(saved.sequence + 1) : selected ? "✓" : "";
      marker.append(markerVisual);
      marker.setAttribute("aria-label", `${selected ? "Deselect" : "Select"} ${candidate.payToPark ? "Pay to park Supercharger" : "Supercharger"}: ${candidate.name}`);
      marker.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!disabled && (candidate.isSelectable || selected)) onToggle(candidate.stationId);
      });
      const popup = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = saved ? `Stop ${saved.sequence + 1}: ${candidate.name}` : candidate.name;
      const details = document.createElement("div");
      details.textContent = `${candidate.address} · ${candidate.city}, ${candidate.state} · ${candidate.isVisited ? "Visited" : "Unvisited"} · ${selected ? "Selected" : "Not selected"}${saved ? ` · ${saved.leg === "return" ? "Return" : "Outbound"}` : ""}${candidate.payToPark ? " · $ Pay to park" : ""}`;
      popup.append(title, details);
      if (candidate.payToPark) {
        const personal = document.createElement("div");
        personal.textContent = "Personal marker based on your Tesla app review.";
        personal.className = "mt-1 text-xs text-[#594609]";
        popup.append(personal);
      }
      if (candidate.warning) {
        const warning = document.createElement("div");
        warning.textContent = candidate.warning;
        popup.append(warning);
      }
      const preferenceButton = document.createElement("button");
      preferenceButton.type = "button";
      preferenceButton.disabled = preferencePendingStationId === candidate.stationId;
      preferenceButton.textContent = preferenceButton.disabled
        ? "Saving…"
        : candidate.payToPark ? "Remove pay-to-park mark" : "Mark pay to park";
      preferenceButton.className = "mt-2 min-h-10 rounded-full border border-[#d7ad34] bg-[#fff9db] px-3 text-xs font-semibold text-[#594609] disabled:opacity-50";
      preferenceButton.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!preferenceButton.disabled) onPayToParkChange(candidate.stationId, !candidate.payToPark);
      });
      popup.append(preferenceButton);
      markers.push(new mapboxgl.Marker({ element: marker, anchor: "center" })
        .setLngLat([candidate.longitude, candidate.latitude])
        .setPopup(new mapboxgl.Popup({ offset: 14 }).setDOMContent(popup))
        .addTo(map));
    }
    stationMarkersRef.current = markers;
    const bounds = map.getBounds();
    if (bounds) {
      onVisibleCandidateIdsChange(candidates
        .filter((candidate) => bounds.contains([candidate.longitude, candidate.latitude]))
        .map((candidate) => candidate.stationId));
    }
    return () => {
      for (const marker of markers) marker.remove();
      if (stationMarkersRef.current === markers) stationMarkersRef.current = [];
    };
  }, [candidates, disabled, mapReady, onPayToParkChange, onToggle, onVisibleCandidateIdsChange, preferencePendingStationId, savedStops, selectedStationIds]);

  useEffect(() => {
    const requestIdentity = `${mapReady}:${fitRequest.key}`;
    if (lastFitRef.current === requestIdentity) return;
    const map = mapRef.current;
    if (!map || !map.loaded()) return;
    lastFitRef.current = requestIdentity;
    const data = fitDataRef.current;
    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend([origin.longitude, origin.latitude]);
    bounds.extend([destination.longitude, destination.latitude]);
    if (fitRequest.target === "selected") {
      for (const candidate of data.candidates) {
        if (data.selectedStationIds.has(candidate.stationId)) {
          bounds.extend([candidate.longitude, candidate.latitude]);
        }
      }
    } else {
      for (const segment of data.baseSegments) {
        for (const coordinate of segment.geometry.coordinates) bounds.extend(coordinate);
      }
    }
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 300 });
  }, [destination.latitude, destination.longitude, fitRequest.key, fitRequest.target, mapReady, origin.latitude, origin.longitude]);

  if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
    return <div className="flex h-[480px] items-center justify-center rounded-[24px] bg-[#fffdf2] p-8 text-center text-sm text-[#725d30] lg:h-[620px]">Add NEXT_PUBLIC_MAPBOX_TOKEN to display the private Station selection map.</div>;
  }
  return <div className="journey-trip-map relative h-[480px] self-start overflow-hidden rounded-[18px] border border-brand-soft/30 bg-parchment shadow-[0_18px_50px_rgba(12,48,45,0.16)] lg:h-[620px]">
    <div className="absolute inset-0">
      <div ref={containerRef} aria-label="Round-trip Station selection map" className="h-full w-full" />
    </div>
    {mapError ? <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#fff6f6]/95 p-8 text-center text-sm text-[#8d2930]"><MapPinned size={28} /><p className="mt-3">{mapError}</p><button type="button" onClick={() => { setMapError(null); setRetryKey((value) => value + 1); }} className="mt-4 flex min-h-11 items-center gap-2 rounded-full border border-[#d9a8aa] bg-white px-5 font-semibold"><RotateCcw size={17} />Retry Map</button></div> : null}
  </div>;
}
