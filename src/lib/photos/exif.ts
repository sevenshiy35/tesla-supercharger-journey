import type { ExifTakenAtCandidate } from "@/types/photos";
import type { DetectedPhotoMime } from "./constants";

export interface SafeExifMetadata {
  orientation: number;
  takenAt: ExifTakenAtCandidate | null;
}

interface IfdEntry {
  tag: number;
  type: number;
  count: number;
  valueOffset: number;
}

const TYPE_SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

export function detectImageMimeType(bytes: Uint8Array): DetectedPhotoMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg" as const;
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png" as const;
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp" as const;
  }
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp") {
    const brands: string[] = [];
    for (let offset = 8; offset + 4 <= Math.min(bytes.length, 64); offset += 4) {
      brands.push(String.fromCharCode(...bytes.slice(offset, offset + 4)));
    }
    if (brands.some((brand) => brand === "avif" || brand === "avis")) return null;
    if (brands.some((brand) => ["heic", "heix", "hevc", "hevx"].includes(brand))) {
      return "image/heic";
    }
    if (brands.some((brand) => ["mif1", "msf1", "heim", "heis"].includes(brand))) {
      return "image/heif";
    }
  }
  return null;
}

function parseExifDate(value: string | null) {
  if (!value) return null;
  const match = value.trim().match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const parts = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const [year, month, day, hour, minute, second] = parts;
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day ||
    check.getUTCHours() !== hour || check.getUTCMinutes() !== minute || check.getUTCSeconds() !== second
  ) return null;
  return `${yearText}-${monthText}-${dayText}T${hourText}:${minuteText}:${secondText}`;
}

function parseOffsetMinutes(value: string | null) {
  if (!value) return null;
  const match = value.trim().match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) return null;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  if (minutes > 14 * 60 || Number(match[3]) > 59) return null;
  return match[1] === "-" ? -minutes : minutes;
}

export function readTakenAtCandidateFromFields(fields: Record<string, unknown> | null) {
  if (!fields) return null;
  const original = parseExifDate(typeof fields.DateTimeOriginal === "string" ? fields.DateTimeOriginal : null);
  const created = parseExifDate(typeof fields.CreateDate === "string" ? fields.CreateDate : null);
  const source = original ? "DateTimeOriginal" as const : created ? "CreateDate" as const : null;
  const localDateTime = original ?? created;
  if (!source || !localDateTime) return null;
  const offsetValue = source === "DateTimeOriginal" ? fields.OffsetTimeOriginal : fields.OffsetTimeDigitized;
  const offsetMinutes = parseOffsetMinutes(typeof offsetValue === "string" ? offsetValue : null);
  return { localDateTime, offsetMinutes, source } satisfies ExifTakenAtCandidate;
}

export function readJpegDimensions(bytes: Uint8Array) {
  if (detectImageMimeType(bytes) !== "image/jpeg") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = view.getUint16(offset + 2, false);
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if (sofMarkers.has(marker) && length >= 7) {
      return { height: view.getUint16(offset + 5, false), width: view.getUint16(offset + 7, false) };
    }
    offset += 2 + length;
  }
  return null;
}

export function readSafeJpegExif(bytes: Uint8Array): SafeExifMetadata {
  const empty: SafeExifMetadata = { orientation: 1, takenAt: null };
  if (detectImageMimeType(bytes) !== "image/jpeg") return empty;
  const jpegView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;

  while (offset + 10 <= bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const segmentLength = jpegView.getUint16(offset + 2, false);
    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) break;
    const dataStart = offset + 4;
    const isExif = marker === 0xe1 && segmentLength >= 8 &&
      String.fromCharCode(...bytes.slice(dataStart, dataStart + 6)) === "Exif\0\0";
    if (!isExif) { offset += 2 + segmentLength; continue; }

    try {
      const tiffStart = dataStart + 6;
      const byteOrder = String.fromCharCode(bytes[tiffStart], bytes[tiffStart + 1]);
      const littleEndian = byteOrder === "II";
      if (!littleEndian && byteOrder !== "MM") return empty;
      const tiff = new DataView(bytes.buffer, bytes.byteOffset + tiffStart, bytes.byteLength - tiffStart);
      if (tiff.getUint16(2, littleEndian) !== 42) return empty;

      const readEntries = (ifdOffset: number) => {
        if (ifdOffset < 0 || ifdOffset + 2 > tiff.byteLength) return [] as IfdEntry[];
        const count = tiff.getUint16(ifdOffset, littleEndian);
        const entries: IfdEntry[] = [];
        for (let index = 0; index < count; index += 1) {
          const entryOffset = ifdOffset + 2 + index * 12;
          if (entryOffset + 12 > tiff.byteLength) break;
          entries.push({
            tag: tiff.getUint16(entryOffset, littleEndian),
            type: tiff.getUint16(entryOffset + 2, littleEndian),
            count: tiff.getUint32(entryOffset + 4, littleEndian),
            valueOffset: entryOffset + 8,
          });
        }
        return entries;
      };

      const valuePosition = (entry: IfdEntry) => {
        const size = (TYPE_SIZES[entry.type] ?? 0) * entry.count;
        if (!size) return null;
        const position = size <= 4 ? entry.valueOffset : tiff.getUint32(entry.valueOffset, littleEndian);
        return position >= 0 && position + size <= tiff.byteLength ? position : null;
      };
      const readNumber = (entry: IfdEntry | undefined) => {
        if (!entry || entry.count < 1) return null;
        const position = valuePosition(entry);
        if (position === null) return null;
        if (entry.type === 3) return tiff.getUint16(position, littleEndian);
        if (entry.type === 4) return tiff.getUint32(position, littleEndian);
        return null;
      };
      const readAscii = (entry: IfdEntry | undefined) => {
        if (!entry || entry.type !== 2 || entry.count < 2) return null;
        const position = valuePosition(entry);
        if (position === null) return null;
        const raw = new Uint8Array(tiff.buffer, tiff.byteOffset + position, entry.count);
        return new TextDecoder("ascii").decode(raw).replace(/\0+$/, "").trim();
      };

      const ifd0 = readEntries(tiff.getUint32(4, littleEndian));
      const orientationValue = readNumber(ifd0.find((entry) => entry.tag === 0x0112));
      const orientation = orientationValue && orientationValue >= 1 && orientationValue <= 8
        ? orientationValue : 1;
      const exifIfdOffset = readNumber(ifd0.find((entry) => entry.tag === 0x8769));
      if (exifIfdOffset === null) return { orientation, takenAt: null };
      const exifIfd = readEntries(exifIfdOffset);
      const original = parseExifDate(readAscii(exifIfd.find((entry) => entry.tag === 0x9003)));
      const created = parseExifDate(readAscii(exifIfd.find((entry) => entry.tag === 0x9004)));
      const source = original ? "DateTimeOriginal" as const : created ? "CreateDate" as const : null;
      const localDateTime = original ?? created;
      if (!source || !localDateTime) return { orientation, takenAt: null };
      const offsetTag = source === "DateTimeOriginal" ? 0x9011 : 0x9012;
      const offsetMinutes = parseOffsetMinutes(readAscii(exifIfd.find((entry) => entry.tag === offsetTag)));
      return { orientation, takenAt: { localDateTime, offsetMinutes, source } };
    } catch {
      return empty;
    }
  }
  return empty;
}
