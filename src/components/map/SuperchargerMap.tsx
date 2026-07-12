"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import mapboxgl, {
  type CameraOptions,
  type ExpressionSpecification,
  type GeoJSONSource,
  type LayerSpecification,
  type LngLatBoundsLike,
  type MapLayerMouseEvent,
  type PaddingOptions,
  type PaintSpecification,
} from "mapbox-gl";
import { BatteryCharging, CircleDot, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ProgressStats } from "@/components/statistics/ProgressStats";
import { US_STATE_BOUNDS } from "@/data/us-state-bounds";
import { useLanguage } from "@/i18n/LanguageProvider";
import { getLocalizedStateName } from "@/i18n/state-names";
import { interpolateText } from "@/i18n/translations";
import { formatDisplayDate } from "@/lib/journey/calculations";
import { stationsToGeoJson } from "@/lib/map/stations-geojson";
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
const hitAreaLayerId = "station-hit-area";
const visitedLayerId = "visited-stations";
const unvisitedLayerId = "unvisited-stations";

const stationRadiusExpression: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  3,
  2.4,
  5,
  3.2,
  8,
  4.5,
  12,
  6,
];

const stationStrokeWidthExpression: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  3,
  0.5,
  8,
  0.9,
  12,
  1.2,
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

const templateMapColors = {
  land: "#f5e4c0",
  landMuted: "#f5ecdb",
  water: "#a3c0b1",
  road: "#7c4d35",
  roadMuted: "#797162",
  highwayStroke: "#99282f",
  boundary: "#c9323b",
  label: "#ffffff",
} as const;

const stationStatusColors = {
  visited: "#1F6F9A",
  unvisited: "#C9323B",
  stroke: "#FFFDF2",
} as const;

function getMapPadding(container: HTMLElement): PaddingOptions {
  const padding = container.clientWidth < 640 ? 16 : 30;
  return { top: padding, right: padding, bottom: padding, left: padding };
}

function getMinimumZoom(container: HTMLElement) {
  return container.clientWidth < 640 ? 2.2 : 2.8;
}

const asMapboxBounds = (bounds: readonly [readonly [number, number], readonly [number, number]]) =>
  bounds as LngLatBoundsLike;

function setPaintIfPresent(
  map: mapboxgl.Map,
  layer: LayerSpecification,
  property: keyof PaintSpecification,
  value: PaintSpecification[keyof PaintSpecification],
) {
  const paint = "paint" in layer ? layer.paint : undefined;

  if (paint && property in paint) {
    map.setPaintProperty(layer.id, property, value);
  }
}

function setVisibility(map: mapboxgl.Map, layerId: string, visibility: "visible" | "none") {
  map.setLayoutProperty(layerId, "visibility", visibility);
}

function applyTemplateBaseMapStyle(map: mapboxgl.Map) {
  for (const layer of map.getStyle().layers ?? []) {
    const sourceLayer = "source-layer" in layer ? layer["source-layer"] : "";
    const layerId = layer.id.toLowerCase();
    const sourceLayerName = sourceLayer?.toLowerCase() ?? "";
    const layerName = `${layerId} ${sourceLayerName}`;

    if (layer.type === "symbol") {
      if (
        layerName.includes("poi") ||
        layerName.includes("transit") ||
        layerName.includes("road-label") ||
        layerName.includes("road_number") ||
        layerName.includes("airport")
      ) {
        setVisibility(map, layer.id, "none");
        continue;
      }

      setPaintIfPresent(map, layer, "text-color", templateMapColors.label);
      setPaintIfPresent(map, layer, "text-halo-width", 0);
      setPaintIfPresent(map, layer, "text-halo-color", "rgba(255, 255, 255, 0)");
      continue;
    }

    if (layerName.includes("water")) {
      setPaintIfPresent(map, layer, "fill-color", templateMapColors.water);
      setPaintIfPresent(map, layer, "line-color", templateMapColors.water);
      continue;
    }

    if (layerName.includes("land") || layerName.includes("national-park")) {
      setPaintIfPresent(map, layer, "fill-color", templateMapColors.land);
      setPaintIfPresent(map, layer, "background-color", templateMapColors.landMuted);
      continue;
    }

    if (layerName.includes("building") || layerName.includes("landuse")) {
      setPaintIfPresent(map, layer, "fill-color", templateMapColors.landMuted);
      continue;
    }

    if (layerName.includes("road")) {
      const isHighway = layerName.includes("motorway") || layerName.includes("trunk");
      const isMinorRoad = layerName.includes("street") || layerName.includes("service");

      setPaintIfPresent(
        map,
        layer,
        "line-color",
        isHighway ? templateMapColors.road : isMinorRoad ? templateMapColors.roadMuted : templateMapColors.road,
      );
      setPaintIfPresent(map, layer, "line-opacity", 0.82);
      setPaintIfPresent(map, layer, "line-emissive-strength", 0);
      continue;
    }

    if (layerName.includes("admin") || layerName.includes("boundary")) {
      setPaintIfPresent(map, layer, "line-color", templateMapColors.boundary);
      setPaintIfPresent(map, layer, "line-width", 1.2);
      continue;
    }

    if (layerName.includes("transit") || layerName.includes("airport")) {
      setVisibility(map, layer.id, "none");
    }
  }
}

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

    map.on("load", () => {
      applyTemplateBaseMapStyle(map);

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
        type: "circle",
        source: sourceId,
        filter: ["==", ["get", "visited"], false],
        paint: {
          "circle-color": stationStatusColors.unvisited,
          "circle-opacity": 0.94,
          "circle-radius": stationRadiusExpression,
          "circle-stroke-color": stationStatusColors.stroke,
          "circle-stroke-width": stationStrokeWidthExpression,
        },
      });

      map.addLayer({
        id: visitedLayerId,
        type: "circle",
        source: sourceId,
        filter: ["==", ["get", "visited"], true],
        paint: {
          "circle-color": stationStatusColors.visited,
          "circle-opacity": 0.94,
          "circle-radius": stationRadiusExpression,
          "circle-stroke-color": stationStatusColors.stroke,
          "circle-stroke-width": stationStrokeWidthExpression,
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
    <section id="map" className="bg-tile px-5 py-20 text-white sm:px-8 lg:px-12">
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

          <div className="relative mt-5 h-[620px] w-full overflow-hidden rounded-[18px] border border-[#a5e9dd]/28 bg-[#fdf4af] shadow-[0_22px_70px_rgba(12,48,45,0.28)] lg:h-[720px]">
            {token ? (
              <>
                <div
                  ref={mapContainerRef}
                  className="absolute inset-0 h-full w-full"
                  aria-label={copy.map.interactiveLabel}
                />
                {loadError ? (
                  <div className="absolute inset-0 bg-[#fdf4af]">
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
    <aside className="absolute inset-x-3 bottom-3 max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-[18px] border border-[#6fbeb2]/32 bg-[#fffdf2] p-5 text-ink shadow-xl sm:left-auto sm:right-4 sm:top-4 sm:bottom-auto sm:w-[340px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[14px] text-[#3d625f]">
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
          <dt className="text-[#3d625f]">{copy.map.address}</dt>
          <dd>{station.address}{station.postalCode ? `, ${station.postalCode}` : ""}</dd>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-[#3d625f]">{copy.map.stallCount}</dt>
            <dd>{station.stallCount ?? copy.map.unknown}</dd>
          </div>
          <div>
            <dt className="text-[#3d625f]">{copy.map.maxPower}</dt>
            <dd>{station.maxPowerKw ? `${station.maxPowerKw} kW` : copy.map.unknown}</dd>
          </div>
        </div>
        <div>
          <dt className="text-[#3d625f]">{copy.map.lastUpdated}</dt>
          <dd>{formatDisplayDate(station.lastUpdated, language)}</dd>
        </div>
      </dl>
    </aside>
  );
}
