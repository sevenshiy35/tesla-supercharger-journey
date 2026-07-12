import { z } from "zod";
import type { SuperchargerStation } from "@/types/station";
import { StationDataRequestError, StationDataValidationError } from "./errors";
import {
  nlrStationSchema,
  normalizeNlrStationsDetailed,
  type NlrStation,
} from "./mappers";

export const NLR_STATIONS_ENDPOINT = "https://developer.nlr.gov/api/alt-fuel-stations/v1.json";

const nlrEnvelopeSchema = z.object({
  total_results: z.number().int().nonnegative().optional(),
  fuel_stations: z.array(z.unknown()),
});

export interface NlrStationDirectoryResult {
  stations: SuperchargerStation[];
  received: number;
  normalized: number;
  rejected: number;
  duplicatesRemoved: number;
  rejectionExamples: string[];
}

interface FetchNlrStationDirectoryOptions {
  apiKey: string;
  fetcher?: typeof fetch;
}

function summarizeZodIssue(error: z.ZodError) {
  const issue = error.issues[0];
  return issue ? `${issue.path.join(".") || "record"}: ${issue.message}` : "invalid structure";
}

export async function fetchNlrStationDirectory({
  apiKey,
  fetcher = fetch,
}: FetchNlrStationDirectoryOptions): Promise<NlrStationDirectoryResult> {
  if (!apiKey.trim()) {
    throw new StationDataRequestError("The NLR API key is not configured.");
  }

  const url = new URL(NLR_STATIONS_ENDPOINT);
  url.search = new URLSearchParams({
    api_key: apiKey,
    fuel_type: "ELEC",
    country: "US",
    ev_network: "Tesla",
    access: "public",
    status: "E",
    limit: "all",
  }).toString();

  let response: Response;

  try {
    response = await fetcher(url, { cache: "no-store" });
  } catch {
    throw new StationDataRequestError("The NLR station request could not be completed.");
  }

  if (!response.ok) {
    throw new StationDataRequestError(`The NLR station request failed with status ${response.status}.`);
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new StationDataValidationError("The NLR response was not valid JSON.");
  }

  const envelope = nlrEnvelopeSchema.safeParse(payload);

  if (!envelope.success) {
    throw new StationDataValidationError("The NLR response did not contain a station array.");
  }

  const parsedStations: NlrStation[] = [];
  const rejectionExamples: string[] = [];
  let schemaRejected = 0;

  for (const [index, rawStation] of envelope.data.fuel_stations.entries()) {
    const parsed = nlrStationSchema.safeParse(rawStation);

    if (!parsed.success) {
      schemaRejected += 1;
      if (rejectionExamples.length < 10) {
        rejectionExamples.push(`NLR record ${index + 1}: ${summarizeZodIssue(parsed.error)}`);
      }
      continue;
    }

    parsedStations.push(parsed.data);
  }

  const normalized = normalizeNlrStationsDetailed(parsedStations, []);
  const stations = normalized.stations;

  if (envelope.data.fuel_stations.length > 0 && stations.length === 0) {
    throw new StationDataValidationError("The NLR response contained no valid stations.");
  }

  return {
    stations,
    received: envelope.data.fuel_stations.length,
    normalized: stations.length,
    rejected: schemaRejected + normalized.rejected,
    duplicatesRemoved: normalized.duplicatesRemoved,
    rejectionExamples: [...rejectionExamples, ...normalized.rejectionExamples].slice(0, 10),
  };
}
