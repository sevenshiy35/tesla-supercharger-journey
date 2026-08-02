export function isMapboxMatrixFeatureEnabled() {
  return process.env.NEXT_PUBLIC_MAPBOX_MATRIX_API_ENABLED?.trim().toLowerCase() === "true";
}
