"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import mapboxgl, { type ErrorEvent as MapboxErrorEvent } from "mapbox-gl";
import { LoaderCircle, MapPinned, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { applyJourneyBaseMapStyle, journeyMapColors } from "@/lib/map/journey-map-style";
import { classifyTripMapFatalError, tripMapFatalErrorMessage } from "@/lib/mapbox/map-error";
import type { SuggestedTripStop, TripEndpoint, TripRouteSegment } from "@/lib/trips/types";

export function TripRouteMap({
  origin,
  destination,
  baseSegments,
  plannedSegments,
  plannedRouteStale,
  stops,
  loading,
  routeError,
}: {
  origin: TripEndpoint | null;
  destination: TripEndpoint | null;
  baseSegments: TripRouteSegment[];
  plannedSegments?: TripRouteSegment[];
  plannedRouteStale?: boolean;
  stops?: SuggestedTripStop[];
  loading?: boolean;
  routeError?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const container = containerRef.current;
    if (!token || !container || (!origin && !destination)) return;
    mapboxgl.accessToken = token;
    let map: mapboxgl.Map;
    let resizeFrame: number | null = null;
    let active = true;
    try {
      map = new mapboxgl.Map({
        container,
        style: "mapbox://styles/mapbox/light-v11",
        center: [origin?.longitude ?? destination?.longitude ?? -98.5, origin?.latitude ?? destination?.latitude ?? 39.5],
        zoom: 5,
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
      queueMicrotask(() => setMapError("The route map could not be initialized. Reload the page and try again."));
      return;
    }
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
      const fatalKind = classifyTripMapFatalError(event.error?.message ?? "");
      if (fatalKind) setMapError(tripMapFatalErrorMessage(fatalKind));
    });
    map.on("webglcontextlost", () => {
      setMapError(tripMapFatalErrorMessage("webgl"));
    });
    map.on("load", () => {
      try {
        applyJourneyBaseMapStyle(map);
        const bounds = new mapboxgl.LngLatBounds();
        for (const endpoint of [origin, destination]) {
          if (!endpoint) continue;
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
        const routeLayers = [
          ...baseSegments.map((segment) => ({ segment, kind: "base" as const })),
          ...(plannedSegments ?? []).map((segment) => ({ segment, kind: "planned" as const })),
        ];
        for (const { segment, kind } of routeLayers) {
          const sourceId = `trip-route-${kind}-${segment.leg}-${segment.segmentIndex}`;
          map.addSource(sourceId, { type: "geojson", data: { type: "Feature", properties: {}, geometry: segment.geometry } });
          map.addLayer({
            id: sourceId,
            source: sourceId,
            type: "line",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": kind === "base"
                ? journeyMapColors.countryBoundary
                : segment.leg === "outbound"
                  ? journeyMapColors.selectedStateBoundary
                  : journeyMapColors.highwayStroke,
              "line-width": kind === "base" ? 3 : 5,
              "line-opacity": kind === "base" ? ((plannedSegments?.length ?? 0) > 0 ? 0.35 : 0.85) : plannedRouteStale ? 0.25 : segment.leg === "outbound" ? 0.94 : 0.82,
              ...(kind === "planned" && plannedRouteStale ? { "line-dasharray": [1, 2] } : {}),
              ...(segment.leg === "return" && kind === "planned" ? { "line-dasharray": [2, 1.5] } : {}),
            },
          });
          for (const coordinate of segment.geometry.coordinates) bounds.extend(coordinate);
        }
        for (const stop of stops ?? []) {
          const element = document.createElement("div");
          const checkedIn = stop.status === "visited";
          element.className = `relative flex size-5 items-center justify-center rounded-full border-2 text-[9px] font-bold shadow-sm ${checkedIn ? "border-white bg-[#2f8f78] text-white ring-2 ring-[#b9ded1]" : stop.source === "manual" ? "border-[#8b651d] bg-[#f3c85f] text-[#32230a]" : stop.isLocked ? "border-white bg-[#315f92] text-white" : stop.isVisited ? "border-[#b79b62] bg-[#f3e8d2] text-[#725d30]" : "border-white bg-[#167d73] text-white"}`;
          element.textContent = String(stop.sequence + 1);
          if (stop.payToPark) {
            const payBadge = document.createElement("span");
            payBadge.className = "absolute -right-2 -top-2 flex size-4 items-center justify-center rounded-full border border-[#8b6a0a] bg-[#f7d65c] text-[9px] font-bold text-[#3d3008]";
            payBadge.textContent = "$";
            element.append(payBadge);
          }
          element.setAttribute("aria-label", `${checkedIn ? "Checked-in" : "Planned"} Stop ${stop.sequence + 1}: ${stop.stationName}${stop.payToPark ? ", Pay to park" : ""}`);
          const popupContent = document.createElement("div");
          const title = document.createElement("strong");
          title.textContent = `Stop ${stop.sequence + 1}: ${stop.stationName}`;
          const details = document.createElement("div");
          details.textContent = `${stop.address} · ${stop.city}, ${stop.state} · ${stop.leg === "return" ? "Return" : "Outbound"} · ${stop.source === "manual" ? "Manual" : "Legacy saved Stop"} · ${checkedIn ? "Checked in on this Trip" : stop.isVisited ? "Previously visited" : "Expected new"}${stop.payToPark ? " · $ Pay to park" : ""}`;
          popupContent.append(title, details);
          if (stop.payToPark) {
            const personal = document.createElement("div");
            personal.textContent = "Personal marker based on your Tesla app review.";
            popupContent.append(personal);
          }
          new mapboxgl.Marker({ element, anchor: "center" })
            .setLngLat([stop.longitude, stop.latitude])
            .setPopup(new mapboxgl.Popup({ offset: 14 }).setDOMContent(popupContent))
            .addTo(map);
          bounds.extend([stop.longitude, stop.latitude]);
        }
        if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 46, maxZoom: 13, duration: 0 });
        setMapError(null);
      } catch {
        setMapError("The route layer could not be displayed safely. Recalculate the route and try again.");
      }
    });
    return () => {
      active = false;
      resizeObserver.disconnect();
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      map.remove();
    };
  }, [baseSegments, destination, origin, plannedRouteStale, plannedSegments, retryKey, stops]);

  if (!origin && !destination) return <div className="flex h-[360px] flex-col items-center justify-center rounded-[28px] border border-dashed border-[#bedbd5] bg-[#f2f6f3] p-8 text-center xl:h-[620px]"><MapPinned size={30} className="text-action-blue" /><p className="mt-3 font-semibold">Choose route endpoints</p><p className="mt-1 text-sm text-[#67817e]">The private route map will appear here.</p></div>;
  if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) return <div className="flex h-[360px] items-center justify-center rounded-[28px] bg-[#fffdf2] p-8 text-center text-sm text-[#725d30] xl:h-[620px]">Add NEXT_PUBLIC_MAPBOX_TOKEN to display the map. Endpoint selection and server route calculation remain separate.</div>;
  return <div className="journey-trip-map relative h-[360px] self-start overflow-hidden rounded-[18px] border border-brand-soft/30 bg-parchment shadow-[0_18px_50px_rgba(12,48,45,0.16)] xl:h-[620px]">
    <div className="absolute inset-0">
      <div ref={containerRef} aria-label="Trip route map with origin, destination, planned stops, outbound route, and optional return route" className="h-full w-full" />
    </div>
    {loading ? <div className="absolute inset-0 flex animate-pulse items-center justify-center gap-2 bg-[#dfe9e4]/90 text-sm font-semibold text-[#486d69]"><LoaderCircle size={18} className="animate-spin" aria-hidden />Calculating route…</div> : null}
    {routeError || mapError ? <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#fff6f6]/95 p-8 text-center text-sm text-[#8d2930]">
      <p>{routeError ?? mapError}</p>
      {!routeError ? <button type="button" onClick={() => { setMapError(null); setRetryKey((value) => value + 1); }} className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#d9a8aa] bg-white px-5 font-semibold"><RotateCcw size={17} aria-hidden />Retry Map</button> : null}
    </div> : null}
  </div>;
}
