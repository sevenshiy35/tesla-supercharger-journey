"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import mapboxgl, { type ErrorEvent as MapboxErrorEvent } from "mapbox-gl";
import { MapPinned, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { applyJourneyBaseMapStyle } from "@/lib/map/journey-map-style";
import { classifyTripMapFatalError, tripMapFatalErrorMessage } from "@/lib/mapbox/map-error";
import type { PublicHomepageTrip, PublicTripStop } from "@/types/public-trip";
import styles from "./CurrentTripSection.module.css";

type Coordinate = [number, number];

const FUTURE_ROUTE_LAYER_ID = "public-trip-future";
const CURRENT_ROUTE_LAYER_ID = "public-trip-current";
const ROUTE_DASH_SEQUENCE = [
  [0, 4, 3],
  [0.5, 4, 2.5],
  [1, 4, 2],
  [1.5, 4, 1.5],
  [2, 4, 1],
  [2.5, 4, 0.5],
  [3, 4, 0],
  [0, 0.5, 3, 3.5],
  [0, 1, 3, 3],
  [0, 1.5, 3, 2.5],
  [0, 2, 3, 2],
  [0, 2.5, 3, 1.5],
  [0, 3, 3, 1],
  [0, 3.5, 3, 0.5],
];

function routeCoordinates(trip: PublicHomepageTrip): Coordinate[] {
  const persisted = trip.segments
    .slice()
    .sort((a, b) => a.segmentIndex - b.segmentIndex)
    .flatMap((segment, index) => index === 0 ? segment.geometry.coordinates : segment.geometry.coordinates.slice(1));
  if (persisted.length >= 2) return persisted;
  return trip.stops.map((stop) => [stop.longitude, stop.latitude]);
}

function nearestForwardIndex(coordinates: Coordinate[], stop: PublicTripStop, start: number) {
  let bestIndex = Math.min(start, coordinates.length - 1);
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = bestIndex; index < coordinates.length; index += 1) {
    const [longitude, latitude] = coordinates[index];
    const distance = (longitude - stop.longitude) ** 2 + (latitude - stop.latitude) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function splitRoute(trip: PublicHomepageTrip) {
  const coordinates = routeCoordinates(trip);
  let cursor = 0;
  const stopIndexes = new Map<number, number>();
  for (const stop of trip.stops) {
    cursor = nearestForwardIndex(coordinates, stop, cursor);
    stopIndexes.set(stop.sequence, cursor);
  }
  const nextStop = trip.stops.find((stop) => stop.status !== "visited") ?? null;
  const visitedStops = trip.stops.filter((stop) => stop.status === "visited");
  const lastVisited = visitedStops.at(-1) ?? null;
  const completedEnd = nextStop === null
    ? coordinates.length - 1
    : lastVisited ? stopIndexes.get(lastVisited.sequence) ?? 0 : 0;
  const currentEnd = nextStop ? stopIndexes.get(nextStop.sequence) ?? completedEnd : coordinates.length - 1;
  const slice = (start: number, end: number) => {
    const result = coordinates.slice(start, end + 1);
    return result.length >= 2 ? result : [];
  };
  return {
    all: coordinates,
    completed: completedEnd > 0 ? slice(0, completedEnd) : [],
    current: nextStop ? slice(completedEnd, Math.max(completedEnd + 1, currentEnd)) : [],
    future: currentEnd < coordinates.length - 1 ? slice(currentEnd, coordinates.length - 1) : [],
    nextStop,
  };
}

function feature(coordinates: Coordinate[]) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates },
  };
}

export function PublicTripMap({ trip, label }: { trip: PublicHomepageTrip; label: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const route = useMemo(() => splitRoute(trip), [trip]);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const container = containerRef.current;
    if (!token || !container || route.all.length < 2) return;
    mapboxgl.accessToken = token;
    let map: mapboxgl.Map;
    let resizeFrame: number | null = null;
    let routeAnimationFrame: number | null = null;
    let active = true;
    const markers: mapboxgl.Marker[] = [];
    try {
      map = new mapboxgl.Map({
        container,
        style: "mapbox://styles/mapbox/light-v11",
        center: route.all[Math.floor(route.all.length / 2)],
        zoom: 6,
        attributionControl: false,
        projection: "mercator",
        interactive: false,
      });
    } catch {
      queueMicrotask(() => setMapError("The Trip map could not be initialized."));
      return;
    }
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    const observer = new ResizeObserver(() => {
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => { if (active) map.resize(); });
    });
    observer.observe(container);
    map.on("error", (event: MapboxErrorEvent) => {
      const fatalKind = classifyTripMapFatalError(event.error?.message ?? "");
      if (fatalKind) setMapError(tripMapFatalErrorMessage(fatalKind));
    });
    map.on("load", () => {
      try {
        applyJourneyBaseMapStyle(map);
        const addRoute = (id: string, coordinates: Coordinate[], color: string, dashed = false, width = 5) => {
          if (coordinates.length < 2) return;
          map.addSource(id, { type: "geojson", lineMetrics: true, data: feature(coordinates) });
          map.addLayer({
            id,
            source: id,
            type: "line",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": color,
              "line-width": width,
              "line-opacity": 0.96,
              ...(dashed ? { "line-dasharray": [1.4, 1.4] } : {}),
            },
          });
        };
        addRoute(FUTURE_ROUTE_LAYER_ID, route.future, "#c9323b", true, 4);
        addRoute("public-trip-completed", route.completed, "#1f6f9a");
        addRoute(CURRENT_ROUTE_LAYER_ID, route.current, "#34908b", true, 5);

        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (!reducedMotion) {
          let animationStartedAt: number | null = null;
          let previousFrame = -1;
          const animateRoute = (timestamp: number) => {
            if (!active) return;
            animationStartedAt ??= timestamp;
            const elapsed = timestamp - animationStartedAt;
            const frame = Math.floor(elapsed / 42);
            if (frame !== previousFrame) {
              previousFrame = frame;
              const dash = ROUTE_DASH_SEQUENCE[Math.floor(elapsed / 90) % ROUTE_DASH_SEQUENCE.length];
              for (const layerId of [FUTURE_ROUTE_LAYER_ID, CURRENT_ROUTE_LAYER_ID]) {
                if (map.getLayer(layerId)) map.setPaintProperty(layerId, "line-dasharray", dash);
              }
            }
            routeAnimationFrame = requestAnimationFrame(animateRoute);
          };
          routeAnimationFrame = requestAnimationFrame(animateRoute);
        }

        const bounds = new mapboxgl.LngLatBounds();
        for (const coordinate of route.all) bounds.extend(coordinate);
        for (const stop of trip.stops) {
          const isCurrent = route.nextStop?.id === stop.id;
          const element = document.createElement("div");
          element.className = `${styles.mapMarker} ${stop.status === "visited" ? styles.mapMarkerVisited : isCurrent ? styles.mapMarkerCurrent : styles.mapMarkerPlanned}`;
          element.setAttribute("aria-label", `${stop.stationName}: ${stop.status === "visited" ? "checked in" : isCurrent ? "next stop" : "planned"}`);
          const popup = document.createElement("div");
          const title = document.createElement("strong");
          title.textContent = stop.stationName;
          const detail = document.createElement("span");
          detail.textContent = stop.status === "visited" ? "Checked in" : isCurrent ? "Next stop" : "Planned stop";
          popup.append(title, detail);
          const marker = new mapboxgl.Marker({ element, anchor: "center" })
            .setLngLat([stop.longitude, stop.latitude])
            .setPopup(new mapboxgl.Popup({ offset: 18 }).setDOMContent(popup))
            .addTo(map);
          markers.push(marker);
          bounds.extend([stop.longitude, stop.latitude]);
        }
        if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 58, maxZoom: 10, duration: 0 });
        setMapError(null);
      } catch {
        setMapError("The Trip route could not be displayed.");
      }
    });
    return () => {
      active = false;
      observer.disconnect();
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      if (routeAnimationFrame !== null) cancelAnimationFrame(routeAnimationFrame);
      for (const marker of markers) marker.remove();
      map.remove();
    };
  }, [retryKey, route, trip.stops]);

  if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN || route.all.length < 2) {
    return <div className="flex h-[340px] items-center justify-center rounded-[26px] border border-border-soft bg-surface-warm/55 p-8 text-center text-sm text-ink-muted sm:h-[500px]"><MapPinned className="mr-2" size={20} aria-hidden />Map preview is unavailable.</div>;
  }

  return (
    <div className="journey-trip-map relative h-[340px] overflow-hidden rounded-[26px] border border-border-soft bg-parchment sm:h-[500px]">
      <div ref={containerRef} className="h-full w-full" aria-label={label} />
      {mapError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-canvas/95 p-8 text-center text-sm text-[#8d2930]">
          <p>{mapError}</p>
          <button type="button" onClick={() => { setMapError(null); setRetryKey((value) => value + 1); }} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d9a8aa] bg-white px-5 font-semibold"><RotateCcw size={17} aria-hidden />Retry map</button>
        </div>
      ) : null}
    </div>
  );
}
