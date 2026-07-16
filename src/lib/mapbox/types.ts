export interface MapboxCoordinate {
  longitude: number;
  latitude: number;
}
export interface GeocodingResult {
  providerId: string;
  label: string;
  fullAddress: string;
  longitude: number;
  latitude: number;
  featureType: string;
  attribution: "Mapbox";
}

export interface LineStringGeometry {
  type: "LineString";
  coordinates: [number, number][];
}

export interface SafeDirectionsRoute {
  distanceMeters: number;
  durationSeconds: number;
  geometry: LineStringGeometry;
}
