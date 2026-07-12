import { normalizeAddress } from "../../src/lib/stations/address-normalization";
import {
  JERSEY_CITY_MANUAL_EXTERNAL_ID,
  PISCATAWAY_MANUAL_EXTERNAL_ID,
} from "../../src/lib/stations/station-aliases";

export interface ConfirmedReceiptLocationMapping {
  locationName: string;
  streetAddress: string;
  city: string;
  state: string;
  postalCode: string;
  stationExternalId: string;
  receiptCount: number;
}

export function receiptLocationKey(
  value: Pick<
    ConfirmedReceiptLocationMapping,
    "locationName" | "streetAddress" | "city" | "state" | "postalCode"
  >,
) {
  return [
    value.locationName,
    value.streetAddress,
    value.city,
    value.state,
    value.postalCode,
  ].map(normalizeAddress).join("|");
}

export const CURRENT_RECEIPT_LOCATION_COUNTS = [
  1, 1, 1, 1, 14, 2, 2, 2, 1, 1, 31, 4, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1,
] as const;

export const CONFIRMED_RECEIPT_LOCATION_MAPPINGS = [
  ["Allamuchy, NJ", "PV Mall 517", "Allamuchy", "NJ", "07820", "327429"],
  ["Avenel, NJ", "US-1 930", "Avenel", "NJ", "07001", "225837"],
  ["Basking Ridge, NJ", "King George Road 415", "Basking Ridge", "NJ", "07920", "149295"],
  ["Bennington, VT - North Street", "North St 237", "Bennington", "VT", "05201", "326663"],
  ["Carteret, NJ", "Roosevelt Ave 793", "Carteret", "NJ", "07008", "440460"],
  ["Clark, NJ", "Valley Rd 36", "Clark", "NJ", "07066", "330974"],
  ["Edison, NJ", "Parsonage Rd. 55", "Edison", "NJ", "08837", "102293"],
  ["Edison, NJ - U.S. Route 1", "U.S. Route 1 580", "Edison", "NJ", "08817", "238208"],
  ["Elizabeth, NJ - Spring Street", "Spring St 595", "Elizabeth", "NJ", "07201", "374342"],
  ["Foxborough, MA", "Fisher St 4", "Foxborough", "MA", "02035", "332095"],
  ["Jersey City, NJ", "Garfield Ave 2-36", "Jersey City", "NJ", "07305", JERSEY_CITY_MANUAL_EXTERNAL_ID],
  ["Jersey City, NJ - Mall Drive West", "Mall Drive West 30", "Jersey City", "NJ", "07310", "102300"],
  ["Kearny, NJ", "200 Harrison Avenue 200", "Kearny", "NJ", "07032", "118950"],
  ["Lagrangeville, NY", "John J Wagner Way 16", "Lagrangeville", "NY", "12540", "346540"],
  ["Madison, CT - Northbound", "North Avenue 1-95", "Madison", "CT", "06443", "153822"],
  ["Madison, CT - Southbound", "South Street 1-95", "Madison", "CT", "06443", "153823"],
  ["Middletown, NY", "East Main Street 601", "Middletown", "NY", "10941", "150207"],
  ["New London, CT", "North Frontage Road 351", "New London", "CT", "06320", "154662"],
  ["New York JFK, NY", "150th Ave and 147th St", "Queens", "NY", "11430", "102341"],
  ["Newark, NJ", "Ferry St 281", "Newark", "NJ", "07105", "422574"],
  ["North Bergen, NJ - John F. Kennedy Boulevard", "John F. Kennedy Boulevard 2819", "North Bergen", "NJ", "07047", "238574"],
  ["Parsippany, NJ", "New Road 350", "Parsippany", "NJ", "07054", "122344"],
  ["Piscataway, NJ", "Centennial Avenue 88", "Piscataway", "NJ", "08854", PISCATAWAY_MANUAL_EXTERNAL_ID],
  ["Rutland, VT", "Woodstock Ave 194", "Rutland", "VT", "05701", "166865"],
  ["Saugerties, NY", "Ulster Ave 138", "Saugerties", "NY", "12477", "422193"],
].map(([locationName, streetAddress, city, state, postalCode, stationExternalId], index) => ({
  locationName,
  streetAddress,
  city,
  state,
  postalCode,
  stationExternalId,
  receiptCount: CURRENT_RECEIPT_LOCATION_COUNTS[index] ?? 0,
})) satisfies ConfirmedReceiptLocationMapping[];

export const CONFIRMED_RECEIPT_MAPPING_INDEX = new Map(
  CONFIRMED_RECEIPT_LOCATION_MAPPINGS.map((mapping) => [
    receiptLocationKey(mapping),
    mapping.stationExternalId,
  ]),
);
