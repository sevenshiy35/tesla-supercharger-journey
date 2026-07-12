import { createHash } from "node:crypto";

export const RECEIPT_VISIT_UUID_NAMESPACE = "7d949b6c-0862-5f03-a8e5-5d0f4cf3a58b";

export function normalizeDecimal(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "null";
  }
  const raw = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) {
    throw new Error(`Invalid decimal value: ${raw}`);
  }
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [wholeRaw, fractionRaw = ""] = unsigned.split(".");
  const whole = (wholeRaw ?? "0").replace(/^0+(?=\d)/, "") || "0";
  const fraction = fractionRaw.replace(/0+$/, "");
  const normalized = fraction ? `${whole}.${fraction}` : whole;
  return negative && normalized !== "0" ? `-${normalized}` : normalized;
}

export interface ReceiptFingerprintInput {
  sourceReceiptId?: string | null;
  stationExternalId: string;
  startedAtUtc: string;
  energyKwh?: number | null;
  costUsd?: number | null;
  chargingMinutes?: number | null;
  sourceFile: string;
  sourcePage?: number;
}

export function createReceiptFingerprint(input: ReceiptFingerprintInput) {
  const sourceReceiptId = input.sourceReceiptId?.trim().toUpperCase();
  if (sourceReceiptId) {
    return `tesla:invoice:${sourceReceiptId}`;
  }

  const canonical = [
    input.stationExternalId.trim(),
    input.startedAtUtc.trim(),
    normalizeDecimal(input.energyKwh),
    normalizeDecimal(input.costUsd),
    normalizeDecimal(input.chargingMinutes),
    input.sourceFile.trim(),
    String(input.sourcePage ?? 1),
  ].join("\n");
  return `tesla:sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

function uuidToBytes(value: string) {
  const normalized = value.replaceAll("-", "");
  if (!/^[0-9a-f]{32}$/i.test(normalized)) {
    throw new Error("UUID namespace must be a valid UUID.");
  }
  return Buffer.from(normalized, "hex");
}

export function createUuidV5(name: string, namespace = RECEIPT_VISIT_UUID_NAMESPACE) {
  const digest = createHash("sha1")
    .update(Buffer.concat([uuidToBytes(namespace), Buffer.from(name, "utf8")]))
    .digest();
  digest[6] = ((digest[6] ?? 0) & 0x0f) | 0x50;
  digest[8] = ((digest[8] ?? 0) & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createReceiptVisitId(receiptFingerprint: string) {
  return createUuidV5(receiptFingerprint);
}
