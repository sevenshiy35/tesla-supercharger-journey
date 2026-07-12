import {
  CONFIRMED_RECEIPT_MAPPING_INDEX,
  receiptLocationKey,
} from "../../data/receipt-station-mappings";
import {
  normalizeAddress,
} from "../../../src/lib/stations/address-normalization";
import { matchManualStationAlias } from "../../../src/lib/stations/station-aliases";
import type {
  ParsedReceiptRecord,
  ReceiptStationMatch,
  ReceiptStationRow,
} from "./types";

export function canonicalizeReceiptStreetAddress(value: string) {
  const trimmed = value.trim();
  if (/^\d/.test(trimmed)) {
    return trimmed;
  }
  const reversed = /^(.+?)\s+(\d+(?:-\d+)?)$/.exec(trimmed);
  return reversed ? `${reversed[2]} ${reversed[1]}` : trimmed;
}

function stationCandidatesByExternalId(stations: ReceiptStationRow[], externalId: string) {
  return stations.filter((station) => station.external_id === externalId);
}

function resultFromExpectedExternalId(
  stations: ReceiptStationRow[],
  externalId: string,
  method: NonNullable<ReceiptStationMatch["method"]>,
): ReceiptStationMatch {
  const candidates = stationCandidatesByExternalId(stations, externalId);

  if (candidates.length === 1) {
    return {
      status: "matched",
      method,
      expectedExternalId: externalId,
      candidates,
      error: null,
    };
  }

  return {
    status: candidates.length === 0 ? "unmatched" : "ambiguous",
    method,
    expectedExternalId: externalId,
    candidates,
    error: candidates.length === 0
      ? `Confirmed station external_id ${externalId} is missing from Supabase.`
      : `Confirmed station external_id ${externalId} returned multiple station rows.`,
  };
}

export function matchReceiptToStation(
  receipt: ParsedReceiptRecord,
  stations: ReceiptStationRow[],
): ReceiptStationMatch {
  const confirmedExternalId = CONFIRMED_RECEIPT_MAPPING_INDEX.get(receiptLocationKey({
    locationName: receipt.locationName,
    streetAddress: receipt.streetAddress,
    city: receipt.city,
    state: receipt.state,
    postalCode: receipt.postalCode,
  }));

  if (confirmedExternalId) {
    return resultFromExpectedExternalId(stations, confirmedExternalId, "confirmed_external_id");
  }

  const canonicalStreet = canonicalizeReceiptStreetAddress(receipt.streetAddress);
  const aliasExternalId = [
    receipt.streetAddress,
    canonicalStreet,
    `${canonicalStreet}, ${receipt.city}, ${receipt.state} ${receipt.postalCode}`,
    receipt.locationName,
  ].map(matchManualStationAlias).find((value) => value !== undefined);

  if (aliasExternalId) {
    return resultFromExpectedExternalId(stations, aliasExternalId, "receipt_alias");
  }

  const normalizedFullAddress = normalizeAddress(
    `${canonicalStreet} ${receipt.city} ${receipt.state} ${receipt.postalCode}`,
  );
  const fullAddressCandidates = stations.filter((station) => normalizeAddress(
    `${station.address} ${station.city} ${station.state} ${station.postal_code ?? ""}`,
  ) === normalizedFullAddress);

  if (fullAddressCandidates.length === 1) {
    return {
      status: "matched",
      method: "normalized_full_address",
      expectedExternalId: fullAddressCandidates[0]?.external_id ?? null,
      candidates: fullAddressCandidates,
      error: null,
    };
  }
  if (fullAddressCandidates.length > 1) {
    return {
      status: "ambiguous",
      method: "normalized_full_address",
      expectedExternalId: null,
      candidates: fullAddressCandidates,
      error: "Multiple stations share the same normalized full address.",
    };
  }

  const normalizedStreet = normalizeAddress(canonicalStreet);
  const normalizedCity = normalizeAddress(receipt.city);
  const state = receipt.state.toUpperCase();
  const addressCandidates = stations.filter((station) =>
    normalizeAddress(station.address) === normalizedStreet
    && normalizeAddress(station.city) === normalizedCity
    && station.state.toUpperCase() === state,
  );

  if (addressCandidates.length === 1) {
    return {
      status: "matched",
      method: "unique_address_city_state",
      expectedExternalId: addressCandidates[0]?.external_id ?? null,
      candidates: addressCandidates,
      error: null,
    };
  }

  return {
    status: addressCandidates.length > 1 ? "ambiguous" : "unmatched",
    method: addressCandidates.length > 1 ? "unique_address_city_state" : null,
    expectedExternalId: null,
    candidates: addressCandidates,
    error: addressCandidates.length > 1
      ? "Multiple stations share the same address, city, and state."
      : "No exact or explicitly reviewed station match was found.",
  };
}
