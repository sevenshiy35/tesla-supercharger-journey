export type TripMapFatalError = "webgl" | "style_access" | "style_load";

export function classifyTripMapFatalError(message: string): TripMapFatalError | null {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return null;
  if (/webgl|webgl2|context\s+(?:was\s+)?lost|failed to initialize.*gl/.test(normalized)) {
    return "webgl";
  }
  if (/401|403|unauthori[sz]ed|forbidden|access token|not authorized/.test(normalized)) {
    return "style_access";
  }
  if (/style[^.]*?(?:failed|could not|unable|not found)|failed to load (?:the )?style/.test(normalized)) {
    return "style_load";
  }
  return null;
}
export function tripMapFatalErrorMessage(kind: TripMapFatalError) {
  if (kind === "webgl") {
    return "The browser lost the map graphics context. Reload the page or restart the browser.";
  }
  if (kind === "style_access") {
    return "The map style could not be authorized. Check the public Mapbox token and its URL restrictions.";
  }
  return "The map style could not be loaded. Please retry in a moment.";
}
