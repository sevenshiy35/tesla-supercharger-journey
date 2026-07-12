import { readFile, readdir, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import AdmZip from "adm-zip";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { ParsedReceiptRecord, ReceiptTimeOverride } from "./types";

interface ReceiptPdfSource {
  sourceFile: string;
  bytes: Uint8Array;
}

function parseNumber(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalMatch(pattern: RegExp, text: string) {
  return pattern.exec(text)?.[1]?.trim() ?? null;
}

function normalizeDate(value: string) {
  return value.replaceAll("/", "-");
}

export function parseTeslaReceiptText(sourceFile: string, text: string): ParsedReceiptRecord {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const chargingLocationIndex = lines.findIndex((line) => line === "Charging Location");

  if (chargingLocationIndex < 0 || chargingLocationIndex + 3 >= lines.length) {
    throw new Error(`${sourceFile}: missing structured Charging Location block`);
  }

  const locationName = lines[chargingLocationIndex + 1];
  const streetAddress = lines[chargingLocationIndex + 2];
  const localityLine = lines[chargingLocationIndex + 3];
  const localityMatch = /^(\d{5}(?:-\d{4})?)\s+(.+?)\s+([A-Z]{2}),\s*US$/i.exec(localityLine);

  if (!locationName || !streetAddress || !localityMatch) {
    throw new Error(`${sourceFile}: invalid Charging Location address`);
  }

  const compact = lines.join(" ");
  const sourceReceiptId = optionalMatch(/\bInvoice Number\s+(3000P\d+)\b/i, compact);
  const referenceId = optionalMatch(/\bReference Number\s+([0-9a-f-]{36})\b/i, compact);
  const eventDate = optionalMatch(/\b(\d{4}\/\d{2}\/\d{2})\s+Energy fee\b/i, compact)
    ?? optionalMatch(/\bInvoice date\s+(\d{4}\/\d{2}\/\d{2})\b/i, compact);
  const pricePerKwh = optionalMatch(
    /\bEnergy fee\s+([0-9]+(?:\.[0-9]+)?)\s*\/\s*kWh\b/i,
    compact,
  );
  const energyKwh = optionalMatch(
    /\bEnergy fee\s+[0-9]+(?:\.[0-9]+)?\s*\/\s*kWh\s+([0-9]+(?:\.[0-9]+)?)\s*kWh\b/i,
    compact,
  );
  const costUsd = optionalMatch(/\bTotal Amount \(USD\)\s+([0-9]+(?:\.[0-9]+)?)\b/i, compact);

  return {
    sourceFile,
    sourcePage: 1,
    sourceReceiptId,
    referenceId,
    rawLocation: `${locationName}\n${streetAddress}\n${localityLine}`,
    locationName,
    streetAddress,
    city: localityMatch[2]?.trim() ?? "",
    state: localityMatch[3]?.toUpperCase() ?? "",
    postalCode: localityMatch[1] ?? "",
    country: "US",
    eventDate: eventDate ? normalizeDate(eventDate) : null,
    energyKwh: parseNumber(energyKwh ?? undefined),
    costUsd: parseNumber(costUsd ?? undefined),
    chargingMinutes: null,
    pricePerKwh: parseNumber(pricePerKwh ?? undefined),
  };
}

async function extractPdfText(bytes: Uint8Array) {
  const document = await getDocument({ data: bytes }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    let text = "";

    for (const item of content.items) {
      if (!("str" in item)) {
        continue;
      }
      text += item.str;
      text += item.hasEOL ? "\n" : " ";
    }
    pages.push(text);
  }

  return pages.join("\n");
}

async function readDirectoryPdfs(directory: string): Promise<ReceiptPdfSource[]> {
  const sources: ReceiptPdfSource[] = [];

  async function visit(current: string) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".pdf") {
        sources.push({ sourceFile: entry.name, bytes: new Uint8Array(await readFile(path)) });
      }
    }
  }

  await visit(directory);
  return sources;
}

async function readReceiptPdfSources(inputPath: string): Promise<ReceiptPdfSource[]> {
  const inputStat = await stat(inputPath);

  if (inputStat.isDirectory()) {
    return readDirectoryPdfs(inputPath);
  }

  if (extname(inputPath).toLowerCase() === ".zip") {
    const archive = new AdmZip(inputPath);
    return archive.getEntries()
      .filter((entry) => !entry.isDirectory && extname(entry.entryName).toLowerCase() === ".pdf")
      .map((entry) => ({
        sourceFile: basename(entry.entryName),
        bytes: new Uint8Array(entry.getData()),
      }));
  }

  if (extname(inputPath).toLowerCase() === ".pdf") {
    return [{ sourceFile: basename(inputPath), bytes: new Uint8Array(await readFile(inputPath)) }];
  }

  throw new Error("Receipt input must be a ZIP file, PDF file, or directory of PDFs.");
}

export async function parseTeslaReceiptInput(inputPath: string) {
  const sources = await readReceiptPdfSources(inputPath);
  const records: ParsedReceiptRecord[] = [];
  const errors: Array<{ sourceFile: string; error: string }> = [];

  for (const source of sources.sort((left, right) => left.sourceFile.localeCompare(right.sourceFile))) {
    try {
      records.push(parseTeslaReceiptText(source.sourceFile, await extractPdfText(source.bytes)));
    } catch (error) {
      errors.push({
        sourceFile: source.sourceFile,
        error: error instanceof Error ? error.message : "Unknown PDF parsing error",
      });
    }
  }

  return { records, errors, loaded: sources.length };
}

export async function readReceiptTimeOverrides(path: string | undefined) {
  if (!path) {
    return new Map<string, ReceiptTimeOverride>();
  }

  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Receipt time override file must be a JSON array.");
  }

  const overrides = new Map<string, ReceiptTimeOverride>();
  for (const value of parsed) {
    if (
      typeof value !== "object"
      || value === null
      || !("sourceReceiptId" in value)
      || !("localStartedAt" in value)
      || typeof value.sourceReceiptId !== "string"
      || typeof value.localStartedAt !== "string"
      || ("timezone" in value && value.timezone !== undefined && typeof value.timezone !== "string")
    ) {
      throw new Error("Receipt time override entries require sourceReceiptId and localStartedAt strings.");
    }
    if (overrides.has(value.sourceReceiptId)) {
      throw new Error(`Duplicate time override for ${value.sourceReceiptId}.`);
    }
    overrides.set(value.sourceReceiptId, value as ReceiptTimeOverride);
  }

  return overrides;
}
