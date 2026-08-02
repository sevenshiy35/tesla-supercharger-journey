import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const serverClient = source("src/lib/mapbox/server-client.ts");
const matrix = source("src/lib/mapbox/matrix.ts");
const directions = source("src/lib/mapbox/directions.ts");
const geocoding = source("src/lib/mapbox/geocoding.ts");
const errors = source("src/lib/mapbox/errors.ts");
const clientConfig = source("src/lib/mapbox/client-config.ts");
const selectionPanel = source("src/components/admin/TripStationSelectionPanel.tsx");
const browserMaps = [
  "src/components/map/SuperchargerMap.tsx",
  "src/components/admin/TripRouteMap.tsx",
  "src/components/admin/TripStationSelectionMap.tsx",
  "src/components/trips/PublicTripMap.tsx",
].map(source);
const envExample = source(".env.example");

test("shared Mapbox client allows non-Matrix services to use the retained server token", () => {
  const tokenFunction = serverClient.slice(
    serverClient.indexOf("function serverToken"),
    serverClient.indexOf("function statusError"),
  );
  assert.match(tokenFunction, /MAPBOX_SERVER_ACCESS_TOKEN/);
  assert.doesNotMatch(serverClient, /MAPBOX_API_ENABLED/);
  assert.match(directions, /mapboxJsonRequest/);
  assert.match(geocoding, /mapboxJsonRequest/);
});

test("Matrix calls require their dedicated server flag before reaching the shared client", () => {
  assert.match(matrix, /MAPBOX_MATRIX_API_ENABLED[\s\S]+=== "true"/);
  for (const functionName of ["getDrivingMatrix", "getDrivingMatrixSubset"]) {
    const body = matrix.slice(matrix.indexOf(`export async function ${functionName}`));
    assert.ok(body.indexOf("requireMapboxMatrixApi();") < body.indexOf("mapboxJsonRequest("));
  }
  assert.match(errors, /case "disabled":[\s\S]+Matrix optimization is temporarily paused/);
});

test("browser maps are restored and only the Matrix optimization control is disabled", () => {
  for (const mapSource of browserMaps) {
    assert.doesNotMatch(mapSource, /isMapboxBrowserApiEnabled|NEXT_PUBLIC_MAPBOX_API_ENABLED/);
    assert.match(mapSource, /process\.env\.NEXT_PUBLIC_MAPBOX_TOKEN/);
  }
  assert.match(clientConfig, /NEXT_PUBLIC_MAPBOX_MATRIX_API_ENABLED[\s\S]+=== "true"/);
  assert.match(selectionPanel, /disabled=\{!matrixApiEnabled \|\| pending/);
  assert.match(selectionPanel, /Matrix Optimization Paused/);
});

test("documented defaults disable only Matrix", () => {
  assert.match(envExample, /^NEXT_PUBLIC_MAPBOX_MATRIX_API_ENABLED=false$/m);
  assert.match(envExample, /^MAPBOX_MATRIX_API_ENABLED=false$/m);
  assert.doesNotMatch(envExample, /^(?:NEXT_PUBLIC_)?MAPBOX_API_ENABLED=/m);
});
