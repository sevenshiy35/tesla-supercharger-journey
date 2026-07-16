"use client";

import { Crosshair, LoaderCircle, MapPin, Search, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { searchStationsAction, selectStationAction } from "@/app/admin/visit-actions";
import type { GeocodingResult } from "@/lib/mapbox/types";
import type { TripEndpoint, TripEndpointSource } from "@/lib/trips/types";
import type { AdminStationResult } from "@/types/admin";

const modes: Array<{ value: TripEndpointSource; label: string }> = [
  { value: "mapbox", label: "Address" },
  { value: "current_location", label: "My location" },
  { value: "station", label: "Supercharger" },
];

export function TripEndpointPicker({
  id,
  title,
  value,
  disabled,
  allowCurrentLocation = true,
  onChange,
}: {
  id: string;
  title: string;
  value: TripEndpoint | null;
  disabled?: boolean;
  allowCurrentLocation?: boolean;
  onChange: (endpoint: TripEndpoint | null) => void;
}) {
  const [choosing, setChoosing] = useState(!value);
  const [mode, setMode] = useState<TripEndpointSource>("mapbox");
  const [query, setQuery] = useState("");
  const [geocodingResults, setGeocodingResults] = useState<GeocodingResult[]>([]);
  const [stations, setStations] = useState<AdminStationResult[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [locationLabel, setLocationLabel] = useState("Current location");
  const sequence = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const availableModes = allowCurrentLocation
    ? modes
    : modes.filter((item) => item.value !== "current_location");
  const modeColumns = availableModes.length === 3
    ? "grid-cols-2 sm:grid-cols-3"
    : "grid-cols-2";
  const modeButtonColumns = availableModes.length === 3
    ? "last:col-span-2 sm:last:col-span-1"
    : "";

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setActiveIndex(-1);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  useEffect(() => {
    if (!choosing || mode !== "mapbox" || query.trim().length < 3) {
      return;
    }
    const requestSequence = ++sequence.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPending(true);
      setError(null);
      try {
        const response = await fetch(`/api/admin/trips/geocode?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = await response.json() as { results?: GeocodingResult[]; error?: string };
        if (requestSequence !== sequence.current) return;
        if (!response.ok) throw new Error(payload.error ?? "Address search failed.");
        setGeocodingResults(payload.results ?? []);
        setActiveIndex(-1);
      } catch (caught) {
        if (controller.signal.aborted || requestSequence !== sequence.current) return;
        setError(caught instanceof Error ? caught.message : "Address search failed.");
        setGeocodingResults([]);
      } finally {
        if (requestSequence === sequence.current) setPending(false);
      }
    }, 400);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [choosing, mode, query]);

  useEffect(() => {
    if (!choosing || mode !== "station" || query.trim().length < 2) {
      return;
    }
    const requestSequence = ++sequence.current;
    const timer = window.setTimeout(async () => {
      setPending(true);
      setError(null);
      const result = await searchStationsAction(query.trim());
      if (requestSequence !== sequence.current) return;
      setPending(false);
      if (!result.ok) setError(result.error ?? "Station search failed.");
      setStations(result.stations ?? []);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [choosing, mode, query]);

  function chooseMapbox(result: GeocodingResult) {
    onChange({
      source: "mapbox",
      label: result.label,
      fullAddress: result.fullAddress,
      latitude: result.latitude,
      longitude: result.longitude,
      stationId: null,
      providerId: result.providerId,
    });
    setChoosing(false);
    setGeocodingResults([]);
  }

  async function chooseStation(station: AdminStationResult) {
    setPending(true);
    setError(null);
    const result = await selectStationAction(station.id);
    setPending(false);
    if (!result.ok || !result.station) {
      setError(result.error ?? "The station could not be selected.");
      return;
    }
    const selected = result.station;
    onChange({
      source: "station",
      label: selected.name,
      fullAddress: `${selected.address}, ${selected.city}, ${selected.state}${selected.postalCode ? ` ${selected.postalCode}` : ""}`,
      latitude: selected.latitude,
      longitude: selected.longitude,
      stationId: selected.id,
      providerId: null,
    });
    setChoosing(false);
  }

  function requestLocation() {
    setError(null);
    if (!("geolocation" in navigator)) {
      setError("This browser does not support location. Search for an address or Supercharger instead.");
      return;
    }
    setPending(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPending(false);
        onChange({
          source: "current_location",
          label: locationLabel.trim() || "Current location",
          fullAddress: null,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          stationId: null,
          providerId: null,
        });
        setChoosing(false);
      },
      (locationError) => {
        setPending(false);
        setError(locationError.code === locationError.PERMISSION_DENIED
          ? "Location permission was denied. Address and Supercharger search are still available."
          : locationError.code === locationError.TIMEOUT
            ? "Location timed out. Try again or use another endpoint source."
            : "Your location could not be determined. Use another endpoint source.");
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  }

  const resultCount = mode === "mapbox" ? geocodingResults.length : stations.length;
  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setActiveIndex(-1);
      setGeocodingResults([]);
      setStations([]);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(resultCount - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      if (mode === "mapbox") chooseMapbox(geocodingResults[activeIndex]);
      else void chooseStation(stations[activeIndex]);
    }
  }

  return (
    <section ref={containerRef} className="rounded-[24px] border border-[#d5e6df] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        {value ? (
          <div className="flex gap-1">
            <button type="button" disabled={disabled} onClick={() => setChoosing(true)} className="min-h-11 rounded-full px-3 text-sm font-semibold text-action-blue">Change</button>
            <button type="button" disabled={disabled} onClick={() => { onChange(null); setChoosing(true); }} className="min-h-11 rounded-full px-3 text-sm font-semibold text-[#8d2930]">Clear</button>
          </div>
        ) : null}
      </div>

      {value && !choosing ? (
        <div className="mt-4 rounded-[20px] bg-[#f2f6f3] p-4">
          <p className="font-semibold">{value.label}</p>
          {value.fullAddress ? <p className="mt-1 text-sm leading-5 text-[#67817e]">{value.fullAddress}</p> : null}
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#67817e]">Source: {value.source.replace("_", " ")}</p>
          <details className="mt-3 text-xs text-[#67817e]">
            <summary className="cursor-pointer font-semibold">Advanced details</summary>
            <p className="mt-2 font-data">{value.latitude.toFixed(6)}, {value.longitude.toFixed(6)}</p>
          </details>
        </div>
      ) : (
        <>
          <div className={`mt-4 grid ${modeColumns} gap-1 rounded-[18px] bg-[#edf1ed] p-1`} role="tablist">
            {availableModes.map((item) => (
              <button
                key={item.value}
                type="button"
                disabled={disabled}
                role="tab"
                aria-selected={mode === item.value}
                onClick={() => { sequence.current += 1; setMode(item.value); setQuery(""); setError(null); setPending(false); setGeocodingResults([]); setStations([]); }}
                className={`min-h-11 min-w-0 whitespace-nowrap rounded-[14px] px-1.5 text-[12px] font-semibold sm:px-2 sm:text-sm ${modeButtonColumns} ${mode === item.value ? "bg-white shadow-sm" : "text-[#67817e]"}`}
              >{item.label}</button>
            ))}
          </div>

          {mode === "current_location" ? (
            <div className="mt-4 rounded-[20px] bg-[#f2f6f3] p-4">
              <label htmlFor={`${id}-location-label`} className="text-sm font-semibold">Display label</label>
              <input id={`${id}-location-label`} value={locationLabel} maxLength={300} onChange={(event) => setLocationLabel(event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl border border-[#bedbd5] px-4" />
              <p className="mt-3 text-xs leading-5 text-[#67817e]">This location is stored privately as part of this trip plan.</p>
              <button type="button" disabled={pending || disabled} onClick={requestLocation} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 font-semibold text-white disabled:opacity-60">
                {pending ? <LoaderCircle size={18} className="animate-spin" aria-hidden /> : <Crosshair size={18} aria-hidden />}
                {pending ? "Locating…" : "Use My Location"}
              </button>
            </div>
          ) : (
            <div className="relative mt-4">
              {mode === "mapbox" ? <Search size={18} className="absolute left-4 top-4 text-[#67817e]" aria-hidden /> : <Zap size={18} className="absolute left-4 top-4 text-[#67817e]" aria-hidden />}
              <label htmlFor={`${id}-search`} className="sr-only">{mode === "mapbox" ? "Search address" : "Search Superchargers"}</label>
              <input
                id={`${id}-search`}
                type="search"
                disabled={disabled}
                value={query}
                autoComplete="off"
                onKeyDown={onSearchKeyDown}
                onChange={(event) => { sequence.current += 1; setQuery(event.target.value); setError(null); setPending(false); setGeocodingResults([]); setStations([]); }}
                placeholder={mode === "mapbox" ? "Address or place" : "Name, city, state, or ZIP"}
                className="min-h-12 min-w-0 w-full rounded-2xl border border-[#bedbd5] py-3 pl-11 pr-4 text-sm sm:text-base"
              />
            </div>
          )}

          {error ? <p role="alert" className="mt-3 rounded-2xl bg-[#fff1f1] px-4 py-3 text-sm text-[#8d2930]">{error}</p> : null}
          {pending && mode !== "current_location" ? <p className="mt-3 flex items-center gap-2 text-sm text-[#67817e]"><LoaderCircle size={17} className="animate-spin" /> Searching…</p> : null}
          <div className="mt-3 space-y-2" role="listbox">
            {mode === "mapbox" ? geocodingResults.map((result, index) => (
              <button key={result.providerId} type="button" disabled={disabled} role="option" aria-selected={activeIndex === index} onClick={() => chooseMapbox(result)} className={`min-h-14 w-full rounded-2xl border p-3 text-left disabled:opacity-50 ${activeIndex === index ? "border-action-blue bg-[#edf7f5]" : "border-[#d5e6df]"}`}>
                <span className="block font-semibold">{result.label}</span><span className="mt-1 block text-xs text-[#67817e]">{result.fullAddress} · {result.featureType}</span>
              </button>
            )) : stations.map((station, index) => (
              <button key={station.id} type="button" disabled={disabled} role="option" aria-selected={activeIndex === index} onClick={() => void chooseStation(station)} className={`min-h-[72px] w-full rounded-2xl border p-3 text-left disabled:opacity-50 ${activeIndex === index ? "border-action-blue bg-[#edf7f5]" : "border-[#d5e6df]"}`}>
                <span className="flex items-center gap-2 font-semibold"><MapPin size={16} />{station.name}<span className="ml-auto text-xs text-[#67817e]">{station.visited ? "Visited" : "Not visited"}</span></span>
                <span className="mt-1 block text-xs text-[#67817e]">{station.address}, {station.city}, {station.state}{station.postalCode ? ` ${station.postalCode}` : ""}</span>
                <span className="mt-1 block font-data text-[11px] text-[#67817e]">{station.latitude.toFixed(5)}, {station.longitude.toFixed(5)} · Latest visit: {station.latestVisitAt ? new Date(station.latestVisitAt).toLocaleDateString() : "None"}</span>
              </button>
            ))}
          </div>
          {!pending && query.trim().length >= (mode === "mapbox" ? 3 : 2) && resultCount === 0 ? <p className="mt-3 rounded-2xl bg-[#f2f6f3] p-4 text-sm text-[#67817e]">No matching results.</p> : null}
          {mode === "mapbox" ? <p className="mt-3 text-right text-xs font-semibold text-[#67817e]">Search results © Mapbox</p> : null}
        </>
      )}
    </section>
  );
}
