export type MapboxErrorCode =
  | "invalid_request"
  | "missing_token"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "provider_unavailable"
  | "timeout"
  | "invalid_response"
  | "no_route";

export class MapboxServerError extends Error {
  constructor(
    readonly code: MapboxErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MapboxServerError";
  }
}

export function safeMapboxErrorMessage(error: unknown) {
  if (!(error instanceof MapboxServerError)) {
    return "The route provider could not complete this request. Please try again.";
  }
  switch (error.code) {
    case "invalid_request":
      return "The route request contains invalid coordinates or too many waypoints.";
    case "missing_token":
      return "Mapbox server access is not configured.";
    case "unauthorized":
      return "Mapbox rejected the server token. Check its API access.";
    case "forbidden":
      return "Mapbox access is unavailable for this request. Permanent Geocoding may require account eligibility.";
    case "rate_limited":
      return "Mapbox is receiving too many requests. Wait a moment and try again.";
    case "timeout":
      return "Mapbox took too long to respond. Please try again.";
    case "no_route":
      return "Mapbox could not calculate a route between these endpoints.";
    case "invalid_response":
      return "Mapbox returned route data that could not be safely used.";
    default:
      return "Mapbox is temporarily unavailable. Please try again.";
  }
}
