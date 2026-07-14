import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import stateTopologyJson from "us-atlas/states-10m.json";
import { getStateName } from "@/data/us-states";

interface StateProperties {
  name: string;
}

type StateGeometry = Polygon | MultiPolygon;

const stateTopology = stateTopologyJson as unknown as Topology<{
  states: GeometryCollection<StateProperties>;
}>;

const stateFeatures = feature<StateProperties>(
  stateTopology,
  stateTopology.objects.states,
) as FeatureCollection<StateGeometry, StateProperties>;

const emptyFeatureCollection: FeatureCollection<StateGeometry, StateProperties> = {
  type: "FeatureCollection",
  features: [],
};

export function selectedStateToGeoJson(
  stateCode: string,
): FeatureCollection<StateGeometry, StateProperties> {
  if (!stateCode) {
    return emptyFeatureCollection;
  }

  const stateName = stateCode === "DC" ? "District of Columbia" : getStateName(stateCode);
  const selectedFeature = stateFeatures.features.find(
    (candidate) => candidate.properties?.name === stateName,
  );

  return {
    type: "FeatureCollection",
    features: selectedFeature ? [selectedFeature] : [],
  };
}
