import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ReceiptImportPlanRecord } from "./types";

function csvCell(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export interface ReceiptImportReport {
  generatedAt: string;
  mode: "dry-run" | "apply";
  inputPath: string;
  summary: Record<string, number | boolean>;
  records: ReceiptImportPlanRecord[];
  parserErrors: Array<{ sourceFile: string; error: string }>;
}

export async function writeReceiptImportReports(
  jsonPath: string,
  csvPath: string,
  report: ReceiptImportReport,
) {
  await mkdir(dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const headers = [
    "sourceFile",
    "sourcePage",
    "sourceReceiptId",
    "rawLocation",
    "eventDate",
    "normalizedAddress",
    "stationExternalId",
    "stationId",
    "localStartedAt",
    "timezone",
    "startedAtUtc",
    "visitAnchorAtUtc",
    "checkedInTimePrecision",
    "energyKwh",
    "costUsd",
    "chargingMinutes",
    "pricePerKwh",
    "receiptFingerprint",
    "visitId",
    "status",
    "visitExists",
    "chargingSessionExists",
    "error",
  ] as const;
  const rows = report.records.map((record) => headers.map((header) => csvCell(record[header])));
  const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
  await writeFile(csvPath, `${csv}\n`, "utf8");
}
