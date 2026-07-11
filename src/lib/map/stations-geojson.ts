import type { Feature, FeatureCollection, Point } from "geojson";
import type { StationStatus, SuperchargerStation } from "@/types/station";

export interface StationFeatureProperties {
  id: string;
  externalId: string;
  name: string;
  address: string;
  city: string;
  state: string;
  status: StationStatus;
  visited: boolean;
  stallCount: number | null;
  maxPowerKw: number | null;
  lastUpdated: string;
}

export type StationFeature = Feature<Point, StationFeatureProperties>;

export function stationsToGeoJson(
  stations: SuperchargerStation[],
): FeatureCollection<Point, StationFeatureProperties> {
  return {
    type: "FeatureCollection",
    features: stations.map((station) => ({
      type: "Feature",
      id: station.id,
      geometry: {
        type: "Point",
        coordinates: [station.longitude, station.latitude],
      },
      properties: {
        id: station.id,
        externalId: station.externalId,
        name: station.name,
        address: station.address,
        city: station.city,
        state: station.state,
        status: station.status,
        visited: station.status === "visited",
        stallCount: station.stallCount ?? null,
        maxPowerKw: station.maxPowerKw ?? null,
        lastUpdated: station.lastUpdated,
      },
    })),
  };
}
