import type {
  ExpressionSpecification,
  LayerSpecification,
  Map as MapboxMap,
  PaintSpecification,
} from "mapbox-gl";

const geographicLabelHaloWidthExpression: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  3,
  0,
  4.25,
  0,
  5.5,
  0.55,
  8,
  0.8,
  12,
  1,
];

const geographicLabelHaloBlurExpression: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  3,
  0.05,
  6,
  0.15,
  12,
  0.25,
];

export const journeyMapColors = {
  land: "#f5e4c0",
  landMuted: "#f5ecdb",
  water: "#a3c0b1",
  road: "#7c4d35",
  roadMuted: "#797162",
  highwayStroke: "#99282f",
  countryBoundary: "#789087",
  stateBoundary: "#b5aa94",
  selectedStateBoundary: "#234f47",
  label: "#a3c0b1",
  labelHalo: "rgba(255, 253, 242, 0.68)",
} as const;

function setPaintIfPresent(
  map: MapboxMap,
  layer: LayerSpecification,
  property: keyof PaintSpecification,
  value: PaintSpecification[keyof PaintSpecification],
) {
  const paint = "paint" in layer ? layer.paint : undefined;

  if (paint && property in paint) {
    map.setPaintProperty(layer.id, property, value);
  }
}

function setVisibility(map: MapboxMap, layerId: string, visibility: "visible" | "none") {
  map.setLayoutProperty(layerId, "visibility", visibility);
}

export function applyJourneyBaseMapStyle(map: MapboxMap) {
  for (const layer of map.getStyle().layers ?? []) {
    const sourceLayer = "source-layer" in layer ? layer["source-layer"] : "";
    const layerId = layer.id.toLowerCase();
    const sourceLayerName = sourceLayer?.toLowerCase() ?? "";
    const layerName = `${layerId} ${sourceLayerName}`;

    if (layer.type === "symbol") {
      const isGeographicLabel =
        sourceLayerName === "place_label" ||
        sourceLayerName === "natural_label" ||
        layerName.includes("country-label") ||
        layerName.includes("state-label") ||
        layerName.includes("settlement") ||
        layerName.includes("continent-label");

      if (isGeographicLabel) {
        setPaintIfPresent(map, layer, "text-color", journeyMapColors.label);
        setPaintIfPresent(map, layer, "text-halo-width", geographicLabelHaloWidthExpression);
        setPaintIfPresent(map, layer, "text-halo-blur", geographicLabelHaloBlurExpression);
        setPaintIfPresent(map, layer, "text-halo-color", journeyMapColors.labelHalo);
        continue;
      }

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

      setPaintIfPresent(map, layer, "text-color", journeyMapColors.label);
      setPaintIfPresent(map, layer, "text-halo-width", 0);
      setPaintIfPresent(map, layer, "text-halo-color", "rgba(255, 255, 255, 0)");
      continue;
    }

    if (layerName.includes("water")) {
      setPaintIfPresent(map, layer, "fill-color", journeyMapColors.water);
      setPaintIfPresent(map, layer, "line-color", journeyMapColors.water);
      continue;
    }

    if (layerName.includes("land") || layerName.includes("national-park")) {
      setPaintIfPresent(map, layer, "fill-color", journeyMapColors.land);
      setPaintIfPresent(map, layer, "background-color", journeyMapColors.landMuted);
      continue;
    }

    if (layerName.includes("building") || layerName.includes("landuse")) {
      setPaintIfPresent(map, layer, "fill-color", journeyMapColors.landMuted);
      continue;
    }

    if (layerName.includes("road")) {
      const isHighway = layerName.includes("motorway") || layerName.includes("trunk");
      const isMinorRoad = layerName.includes("street") || layerName.includes("service");

      setPaintIfPresent(
        map,
        layer,
        "line-color",
        isHighway
          ? journeyMapColors.road
          : isMinorRoad
            ? journeyMapColors.roadMuted
            : journeyMapColors.road,
      );
      setPaintIfPresent(map, layer, "line-opacity", 0.82);
      setPaintIfPresent(map, layer, "line-emissive-strength", 0);
      continue;
    }

    if (layerName.includes("admin") || layerName.includes("boundary")) {
      const isCountryBoundary = layerName.includes("admin-0") || layerName.includes("country-boundary");

      setPaintIfPresent(
        map,
        layer,
        "line-color",
        isCountryBoundary ? journeyMapColors.countryBoundary : journeyMapColors.stateBoundary,
      );
      setPaintIfPresent(map, layer, "line-width", isCountryBoundary ? 1.05 : 0.75);
      setPaintIfPresent(map, layer, "line-opacity", isCountryBoundary ? 0.62 : 0.46);
      continue;
    }

    if (layerName.includes("transit") || layerName.includes("airport")) {
      setVisibility(map, layer.id, "none");
    }
  }
}
