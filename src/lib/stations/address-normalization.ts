const DASH_PATTERN = /[\u2010-\u2015\u2212]/g;

const STREET_SUFFIXES: ReadonlyArray<[RegExp, string]> = [
  [/\bAVENUE\b|\bAVE\b/g, "AVE"],
  [/\bSTREET\b|\bST\b/g, "ST"],
  [/\bROAD\b|\bRD\b/g, "RD"],
  [/\bBOULEVARD\b|\bBLVD\b/g, "BLVD"],
  [/\bDRIVE\b|\bDR\b/g, "DR"],
  [/\bLANE\b|\bLN\b/g, "LN"],
  [/\bHIGHWAY\b|\bHWY\b/g, "HWY"],
];

/**
 * Produces a stable comparison key for receipt aliases and station addresses.
 * It intentionally does not remove house numbers or reorder tokens.
 */
export function normalizeAddress(value: string): string {
  let normalized = value
    .normalize("NFKC")
    .replace(DASH_PATTERN, "-")
    .toUpperCase()
    .replace(/\b(\d{5})-\d{4}\b/g, "$1")
    .replace(/\bNEW\s+JERSEY\b/g, "NJ")
    .replace(/[.,;:#()]/g, " ")
    .replace(/\s*-\s*/g, "-");

  for (const [pattern, replacement] of STREET_SUFFIXES) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized.replace(/\s+/g, " ").trim();
}

export interface StreetAddressIdentity {
  normalized: string;
  houseNumber: string | null;
  street: string | null;
}

export function getStreetAddressIdentity(value: string): StreetAddressIdentity {
  const normalized = normalizeAddress(value);
  const match = /^(\d+(?:-\d+)?)\s+(.+)$/.exec(normalized);

  return {
    normalized,
    houseNumber: match?.[1] ?? null,
    street: match?.[2] ?? null,
  };
}

export function haveSameHouseAndStreet(left: string, right: string): boolean {
  const leftIdentity = getStreetAddressIdentity(left);
  const rightIdentity = getStreetAddressIdentity(right);

  return Boolean(
    leftIdentity.houseNumber
      && leftIdentity.street
      && leftIdentity.houseNumber === rightIdentity.houseNumber
      && leftIdentity.street === rightIdentity.street,
  );
}
