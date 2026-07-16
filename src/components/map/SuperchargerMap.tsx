"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import mapboxgl, {
  type CameraOptions,
  type ExpressionSpecification,
  type FilterSpecification,
  type GeoJSONSource,
  type LngLatBoundsLike,
  type MapLayerMouseEvent,
  type PaddingOptions,
} from "mapbox-gl";
import { BatteryCharging, CircleDot, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ProgressStats } from "@/components/statistics/ProgressStats";
import { US_STATE_BOUNDS } from "@/data/us-state-bounds";
import { getStateName } from "@/data/us-states";
import { useLanguage } from "@/i18n/LanguageProvider";
import { getLocalizedStateName } from "@/i18n/state-names";
import { interpolateText } from "@/i18n/translations";
import { formatDisplayDate } from "@/lib/journey/calculations";
import {
  applyJourneyBaseMapStyle,
  journeyMapColors as templateMapColors,
} from "@/lib/map/journey-map-style";
import { stationsToGeoJson } from "@/lib/map/stations-geojson";
import { selectedStateToGeoJson } from "@/lib/map/selected-state-geojson";
import { CONTIGUOUS_US_BOUNDS, CONTIGUOUS_US_MAX_BOUNDS } from "@/lib/map/us-map-bounds";
import type { StationDataErrorView, StationDataSource } from "@/types/station-data";
import type { SuperchargerStation } from "@/types/station";
import { ConfigurationNotice } from "./ConfigurationNotice";
import { StateSelector } from "./StateSelector";

interface SuperchargerMapProps {
  stations: SuperchargerStation[];
  dataSource: StationDataSource;
  dataError?: StationDataErrorView;
}

const sourceId = "supercharger-stations";
const selectedStateBoundarySourceId = "selected-state-boundary-source";
const selectedStateBoundaryLayerId = "selected-state-boundary";
const hitAreaLayerId = "station-hit-area";
const visitedLayerId = "visited-stations";
const unvisitedLayerId = "unvisited-stations";
const selectedStationOuterHaloLayerId = "selected-station-outer-halo";
const selectedStationHaloLayerId = "selected-station-halo";
const selectedStationMarkerLayerId = "selected-station-marker";
const unvisitedStationImageId = "station-star-fill-red";
const visitedStationImageId = "station-star-fill-blue";

const stationIconSizeExpression: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  3,
  0.27,
  5,
  0.32,
  8,
  0.4,
  12,
  0.52,
];

const selectedStationIconSizeExpression: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  3,
  0.5,
  5,
  0.58,
  8,
  0.7,
  12,
  0.86,
];

const selectedStationHaloRadiusExpression: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  3,
  13,
  5,
  16,
  8,
  20,
  12,
  25,
];

const selectedStationOuterHaloRadiusExpression: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  3,
  18,
  5,
  21,
  8,
  25,
  12,
  30,
];

const stationHitAreaExpression: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  3,
  8,
  5,
  9,
  8,
  11,
  12,
  14,
];

const stationStatusColors = {
  visited: "#1F6F9A",
  unvisited: "#C9323B",
  stroke: "#FFFDF2",
} as const;

const emptySelectedStationFilter: FilterSpecification = ["==", ["get", "id"], ""];

function loadMapImage(map: mapboxgl.Map, url: string) {
  return new Promise<ImageBitmap | HTMLImageElement | ImageData>((resolve, reject) => {
    map.loadImage(url, (error, image) => {
      if (error || !image) {
        reject(error ?? new Error(`Map marker image could not be loaded: ${url}`));
        return;
      }

      resolve(image);
    });
  });
}

async function addStationMarkerImages(map: mapboxgl.Map) {
  const markerImages = await Promise.all([
    loadMapImage(map, "/images/map/station-star-fill-red.png"),
    loadMapImage(map, "/images/map/station-star-fill-blue.png"),
  ]);

  map.addImage(unvisitedStationImageId, markerImages[0], { pixelRatio: 3 });
  map.addImage(visitedStationImageId, markerImages[1], { pixelRatio: 3 });
}

function getMapPadding(container: HTMLElement): PaddingOptions {
  const padding = container.clientWidth < 640 ? 16 : 30;
  return { top: padding, right: padding, bottom: padding, left: padding };
}

function getMinimumZoom(container: HTMLElement) {
  return container.clientWidth < 640 ? 2.2 : 2.8;
}

const asMapboxBounds = (bounds: readonly [readonly [number, number], readonly [number, number]]) =>
  bounds as LngLatBoundsLike;

function easeMapToBounds(
  map: mapboxgl.Map,
  bounds: readonly [readonly [number, number], readonly [number, number]],
  padding: PaddingOptions,
) {
  const camera = map.cameraForBounds(asMapboxBounds(bounds), { padding });

  if (!camera) {
    return;
  }

  map.stop();
  map.easeTo({
    ...(camera as CameraOptions),
    duration: 850,
    easing: (time) => time,
    essential: true,
  });
}

export function SuperchargerMap({ stations, dataSource, dataError }: SuperchargerMapProps) {
  const { copy, language } = useLanguage();
  const locale = language === "zh" ? "zh-CN" : "en-US";
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const stationLookupRef = useRef(new Map<string, SuperchargerStation>());
  const geoJsonRef = useRef(stationsToGeoJson(stations));
  const selectedStateGeoJsonRef = useRef(selectedStateToGeoJson(""));
  const [selectedState, setSelectedState] = useState("");
  const [selectedStation, setSelectedStation] = useState<SuperchargerStation | null>(null);
  const [loadError, setLoadError] = useState("");
  const [mapLoaded, setMapLoaded] = useState(false);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const filteredStations = useMemo(
    () => (selectedState ? stations.filter((station) => station.state === selectedState) : stations),
    [selectedState, stations],
  );
  const stationLookup = useMemo(
    () => new Map(filteredStations.map((station) => [station.id, station])),
    [filteredStations],
  );
  const geoJson = useMemo(() => stationsToGeoJson(filteredStations), [filteredStations]);
  const selectedStateGeoJson = useMemo(() => selectedStateToGeoJson(selectedState), [selectedState]);
  const localizedDataError = dataError
    ? dataError.kind === "empty"
      ? {
          ...dataError,
          title: copy.map.stationDataEmpty,
          message: copy.map.stationDataEmptyMessage,
        }
      : dataError.kind === "configuration"
        ? {
            ...dataError,
            title: copy.map.stationDataNotConfigured,
            message:
              dataSource === "supabase"
                ? copy.map.supabaseDataNotConfiguredMessage
                : copy.map.stationDataNotConfiguredMessage,
          }
        : {
            ...dataError,
            title: copy.map.stationDataUnavailable,
            message: copy.map.stationDataUnavailableMessage,
          }
    : undefined;

  useEffect(() => {
    stationLookupRef.current = stationLookup;
  }, [stationLookup]);

  useEffect(() => {
    geoJsonRef.current = geoJson;
  }, [geoJson]);

  useEffect(() => {
    selectedStateGeoJsonRef.current = selectedStateGeoJson;
  }, [selectedStateGeoJson]);

  useEffect(() => {
    const container = mapContainerRef.current;

    if (!token || !container || mapRef.current) {
      return;
    }

    mapboxgl.accessToken = token;

    let map: mapboxgl.Map;

    try {
      map = new mapboxgl.Map({
        container,
        style: "mapbox://styles/mapbox/light-v11",
        attributionControl: false,
        bounds: asMapboxBounds(CONTIGUOUS_US_BOUNDS),
        fitBoundsOptions: { padding: getMapPadding(container) },
        maxBounds: asMapboxBounds(CONTIGUOUS_US_MAX_BOUNDS),
        minZoom: getMinimumZoom(container),
        maxZoom: 16,
        projection: "mercator",
        bearing: 0,
        pitch: 0,
        minPitch: 0,
        maxPitch: 0,
        cooperativeGestures: window.matchMedia("(hover: hover) and (pointer: fine)").matches,
        dragRotate: false,
        touchPitch: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mapbox could not initialize the map.";
      queueMicrotask(() => setLoadError(message));
      return;
    }

    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");

    map.on("load", async () => {
      applyJourneyBaseMapStyle(map);

      try {
        await addStationMarkerImages(map);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Map marker images could not be loaded.");
        return;
      }

      map.addSource(selectedStateBoundarySourceId, {
        type: "geojson",
        data: selectedStateGeoJsonRef.current,
      });

      map.addLayer({
        id: selectedStateBoundaryLayerId,
        type: "line",
        source: selectedStateBoundarySourceId,
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": templateMapColors.selectedStateBoundary,
          "line-opacity": 0.9,
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.8, 6, 3, 9, 4],
        },
      });

      map.addSource(sourceId, {
        type: "geojson",
        data: geoJsonRef.current,
        cluster: false,
      });

      map.addLayer({
        id: hitAreaLayerId,
        type: "circle",
        source: sourceId,
        paint: {
          "circle-color": "rgba(0, 0, 0, 0)",
          "circle-radius": stationHitAreaExpression,
        },
      });

      map.addLayer({
        id: unvisitedLayerId,
        type: "symbol",
        source: sourceId,
        filter: ["==", ["get", "visited"], false],
        layout: {
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-image": unvisitedStationImageId,
          "icon-size": stationIconSizeExpression,
        },
        paint: {
          "icon-opacity": 0.96,
        },
      });

      map.addLayer({
        id: visitedLayerId,
        type: "symbol",
        source: sourceId,
        filter: ["==", ["get", "visited"], true],
        layout: {
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-image": visitedStationImageId,
          "icon-size": stationIconSizeExpression,
        },
        paint: {
          "icon-opacity": 0.98,
        },
      });

      map.addLayer({
        id: selectedStationOuterHaloLayerId,
        type: "circle",
        source: sourceId,
        filter: emptySelectedStationFilter,
        paint: {
          "circle-color": stationStatusColors.stroke,
          "circle-opacity": 0.42,
          "circle-radius": selectedStationOuterHaloRadiusExpression,
          "circle-stroke-color": templateMapColors.countryBoundary,
          "circle-stroke-opacity": 0.66,
          "circle-stroke-width": 1.4,
        },
      });

      map.addLayer({
        id: selectedStationHaloLayerId,
        type: "circle",
        source: sourceId,
        filter: emptySelectedStationFilter,
        paint: {
          "circle-color": stationStatusColors.stroke,
          "circle-opacity": 0.9,
          "circle-radius": selectedStationHaloRadiusExpression,
          "circle-stroke-color": [
            "case",
            ["==", ["get", "visited"], true],
            stationStatusColors.visited,
            stationStatusColors.unvisited,
          ],
          "circle-stroke-opacity": 0.48,
          "circle-stroke-width": 1.5,
        },
      });

      map.addLayer({
        id: selectedStationMarkerLayerId,
        type: "symbol",
        source: sourceId,
        filter: emptySelectedStationFilter,
        layout: {
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-image": [
            "case",
            ["==", ["get", "visited"], true],
            visitedStationImageId,
            unvisitedStationImageId,
          ],
          "icon-size": selectedStationIconSizeExpression,
        },
      });

      setLoadError("");
      setMapLoaded(true);
      requestAnimationFrame(() => map.resize());
    });

    map.on("error", (event) => {
      setLoadError(event.error?.message ?? "Mapbox could not load the map.");
    });

    const handleStationClick = (event: MapLayerMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, {
        layers: [visitedLayerId, unvisitedLayerId, hitAreaLayerId],
      })[0];
      const stationId = feature?.properties?.id as string | undefined;
      const station = stationId ? stationLookupRef.current.get(stationId) : undefined;

      if (station) {
        setSelectedStation(station);
      }
    };

    const handleMapClick = (event: mapboxgl.MapMouseEvent) => {
      const stationFeatures = map.queryRenderedFeatures(event.point, {
        layers: [visitedLayerId, unvisitedLayerId, hitAreaLayerId],
      });

      if (stationFeatures.length === 0) {
        setSelectedStation(null);
      }
    };

    const handleStationEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };

    const handleStationLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", hitAreaLayerId, handleStationClick);
    map.on("click", handleMapClick);
    map.on("mouseenter", hitAreaLayerId, handleStationEnter);
    map.on("mouseleave", hitAreaLayerId, handleStationLeave);

    return () => {
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, [token]);

  useEffect(() => {
    if (!mapContainerRef.current || !token) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => mapRef.current?.resize());
    resizeObserver.observe(mapContainerRef.current);

    return () => resizeObserver.disconnect();
  }, [token]);

  useEffect(() => {
    const source = mapRef.current?.getSource(sourceId) as GeoJSONSource | undefined;

    if (mapLoaded && source) {
      source.setData(geoJson);
    }
  }, [geoJson, mapLoaded]);

  useEffect(() => {
    const source = mapRef.current?.getSource(selectedStateBoundarySourceId) as GeoJSONSource | undefined;

    if (mapLoaded && source) {
      source.setData(selectedStateGeoJson);
    }
  }, [mapLoaded, selectedStateGeoJson]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapLoaded || !map) {
      return;
    }

    const selectedStateName = selectedState ? getStateName(selectedState) : "";
    const selectedStateMatch: ExpressionSpecification = [
      "any",
      ["==", ["get", "iso_3166_2"], selectedState ? `US-${selectedState}` : ""],
      ["==", ["get", "abbr"], selectedState],
      ["==", ["get", "name_en"], selectedStateName],
      ["==", ["get", "name"], selectedStateName],
    ];

    for (const layer of map.getStyle().layers ?? []) {
      const sourceLayer = "source-layer" in layer ? layer["source-layer"] : "";
      const isStateLabel =
        layer.type === "symbol" &&
        sourceLayer?.toLowerCase() === "place_label" &&
        layer.id.toLowerCase().includes("state-label");

      if (!isStateLabel) {
        continue;
      }

      map.setPaintProperty(layer.id, "text-color", [
        "case",
        selectedStateMatch,
        templateMapColors.selectedStateBoundary,
        templateMapColors.label,
      ]);
      map.setPaintProperty(layer.id, "text-opacity", ["case", selectedStateMatch, 1, 0.5]);
      map.setPaintProperty(layer.id, "text-halo-color", [
        "case",
        selectedStateMatch,
        "rgba(255, 253, 242, 0.98)",
        templateMapColors.labelHalo,
      ]);
    }
  }, [mapLoaded, selectedState]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapLoaded || !map) {
      return;
    }

    const selectedStationFilter: FilterSpecification = [
      "==",
      ["get", "id"],
      selectedStation?.id ?? "",
    ];

    map.setFilter(selectedStationOuterHaloLayerId, selectedStationFilter);
    map.setFilter(selectedStationHaloLayerId, selectedStationFilter);
    map.setFilter(selectedStationMarkerLayerId, selectedStationFilter);
  }, [mapLoaded, selectedStation]);

  useEffect(() => {
    const map = mapRef.current;
    const container = mapContainerRef.current;

    if (!map || !container || !mapLoaded) {
      return;
    }

    const bounds = selectedState ? US_STATE_BOUNDS[selectedState] : CONTIGUOUS_US_BOUNDS;

    map.setMinZoom(getMinimumZoom(container));
    map.setMaxBounds(asMapboxBounds(CONTIGUOUS_US_MAX_BOUNDS));
    easeMapToBounds(map, bounds, getMapPadding(container));
  }, [mapLoaded, selectedState]);

  const mapConfigurationMessage =
    process.env.NODE_ENV === "development"
      ? copy.map.mapTokenMessage
      : copy.map.mapTokenProduction;
  const handleStateChange = (stateCode: string) => {
    setSelectedStation(null);
    setSelectedState(stateCode);
  };

  return (
    <section id="map" className="bg-tile px-5 py-20 font-ui text-white sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1440px]">
        <div className="min-w-0">
          <h2 className="text-[40px] font-semibold leading-[1.1] sm:text-[56px]">
            {copy.map.title}
          </h2>
          <p className="mt-4 max-w-[720px] text-[21px] leading-[1.38] text-white/76">
            {copy.map.description}
          </p>

          <div className="mt-8">
            <StateSelector selectedState={selectedState} onChange={handleStateChange} />
          </div>

          {localizedDataError ? (
            <div className="mt-5">
              <ConfigurationNotice {...localizedDataError} surface="dark" />
            </div>
          ) : null}

          <div className="relative mt-5 h-[620px] w-full overflow-hidden rounded-[18px] border border-brand-soft/30 bg-parchment shadow-[0_22px_70px_rgba(12,48,45,0.28)] lg:h-[720px]">
            {token ? (
              <>
                <div
                  ref={mapContainerRef}
                  className="absolute inset-0 h-full w-full"
                  aria-label={copy.map.interactiveLabel}
                />
                {loadError ? (
                  <div className="absolute inset-0 bg-parchment">
                    <ConfigurationNotice
                      title={copy.map.mapLoadFailed}
                      message={language === "zh" ? copy.map.mapLoadFailedMessage : loadError}
                      canRetry
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <ConfigurationNotice
                title={copy.map.mapNotConfigured}
                message={mapConfigurationMessage}
              />
            )}

            {selectedStation ? (
              <StationPanel station={selectedStation} onClose={() => setSelectedStation(null)} />
            ) : null}
          </div>

          <div
            className="mt-4 flex flex-wrap gap-4 text-[14px] text-white/70"
            aria-label={copy.map.legendLabel}
          >
            <span className="inline-flex items-center gap-2">
              <CircleDot aria-hidden size={16} className="text-visited" /> {copy.map.visited}
            </span>
            <span className="inline-flex items-center gap-2">
              <CircleDot aria-hidden size={16} className="text-unvisited" /> {copy.map.notVisited}
            </span>
          </div>
          <div className="mt-8">
            <ProgressStats stations={stations} selectedState={selectedState} />
          </div>
        </div>
        <p className="sr-only">
          {interpolateText(copy.map.screenReaderSummary, {
            count: filteredStations.length.toLocaleString(locale),
            region: selectedState
              ? getLocalizedStateName(selectedState, language)
              : copy.map.unitedStatesRegion,
          })}
        </p>
      </div>
    </section>
  );
}

function StationPanel({
  station,
  onClose,
}: {
  station: SuperchargerStation;
  onClose: () => void;
}) {
  const { copy, language } = useLanguage();
  const statusLabel = station.status === "visited" ? copy.map.visited : copy.map.notVisited;

  return (
    <aside className="absolute inset-x-3 bottom-3 max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-[18px] border border-border bg-canvas p-5 text-ink shadow-xl sm:left-auto sm:right-4 sm:top-4 sm:bottom-auto sm:w-[340px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[14px] text-ink-muted">
            {station.city}, {getLocalizedStateName(station.state, language)}
          </p>
          <h3 className="mt-1 text-[24px] font-semibold leading-[1.15]">{station.name}</h3>
        </div>
        <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-parchment" onClick={onClose} aria-label={copy.map.closeDetails}>
          <X aria-hidden size={18} />
        </button>
      </div>
      <div className="mt-4 flex items-center gap-2 text-[15px]">
        <span className={station.status === "visited" ? "text-visited" : "text-unvisited"}>
          <BatteryCharging aria-hidden size={17} />
        </span>
        <span>{statusLabel}</span>
      </div>
      <dl className="mt-5 grid gap-3 text-[15px] leading-[1.4]">
        <div>
          <dt className="text-ink-muted">{copy.map.address}</dt>
          <dd>{station.address}{station.postalCode ? `, ${station.postalCode}` : ""}</dd>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-ink-muted">{copy.map.stallCount}</dt>
            <dd className="font-data">{station.stallCount ?? copy.map.unknown}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">{copy.map.maxPower}</dt>
            <dd className="font-data">{station.maxPowerKw ? `${station.maxPowerKw} kW` : copy.map.unknown}</dd>
          </div>
        </div>
        <div>
          <dt className="text-ink-muted">{copy.map.lastUpdated}</dt>
          <dd className="font-data">{formatDisplayDate(station.lastUpdated, language)}</dd>
        </div>
      </dl>
    </aside>
  );
}
