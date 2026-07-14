import type { ExifTakenAtCandidate } from "@/types/photos";

interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}
export interface ResolvedTakenAt {
  takenAt: string | null;
  warning: string | null;
}

function parseLocalDateTime(value: string): LocalDateTimeParts | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day ||
    check.getUTCHours() !== hour || check.getUTCMinutes() !== minute || check.getUTCSeconds() !== second
  ) return null;
  return { year, month, day, hour, minute, second };
}

function formatterFor(timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

function wallParts(formatter: Intl.DateTimeFormat, date: Date): LocalDateTimeParts | null {
  const values = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  if (![values.year, values.month, values.day, values.hour, values.minute, values.second].every(Number.isFinite)) {
    return null;
  }
  return values as unknown as LocalDateTimeParts;
}

function sameWallTime(a: LocalDateTimeParts, b: LocalDateTimeParts) {
  return a.year === b.year && a.month === b.month && a.day === b.day &&
    a.hour === b.hour && a.minute === b.minute && a.second === b.second;
}

export function localDateTimeInTimezoneToUtc(value: string, timezone: string) {
  const requested = parseLocalDateTime(value);
  if (!requested) return null;
  let formatter: Intl.DateTimeFormat;
  try { formatter = formatterFor(timezone); formatter.format(new Date()); } catch { return null; }
  const wallAsUtc = Date.UTC(
    requested.year, requested.month - 1, requested.day,
    requested.hour, requested.minute, requested.second,
  );
  const offsets = new Set<number>();
  for (const hours of [-48, -24, 0, 24, 48]) {
    const sample = new Date(wallAsUtc + hours * 60 * 60 * 1000);
    const parts = wallParts(formatter, sample);
    if (!parts) continue;
    const displayedAsUtc = Date.UTC(
      parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second,
    );
    offsets.add(displayedAsUtc - sample.getTime());
  }
  const matches = [...offsets]
    .map((offset) => new Date(wallAsUtc - offset))
    .filter((candidate) => {
      const parts = wallParts(formatter, candidate);
      return parts ? sameWallTime(parts, requested) : false;
    });
  return matches.length === 1 ? matches[0] : null;
}

export function resolveExifTakenAt(
  candidate: ExifTakenAtCandidate | null,
  visitTimezone: string,
  visitCheckedInAt: string,
  now = new Date(),
): ResolvedTakenAt {
  if (!candidate) return { takenAt: null, warning: null };
  if (candidate.source !== "DateTimeOriginal" && candidate.source !== "CreateDate") {
    return { takenAt: null, warning: "The EXIF capture time was invalid and was ignored." };
  }
  const parts = parseLocalDateTime(candidate.localDateTime);
  if (!parts) return { takenAt: null, warning: "The EXIF capture time could not be parsed." };

  let instant: Date | null = null;
  if (candidate.offsetMinutes !== null) {
    if (!Number.isInteger(candidate.offsetMinutes) || Math.abs(candidate.offsetMinutes) > 14 * 60) {
      return { takenAt: null, warning: "The EXIF timezone offset was invalid and the capture time was ignored." };
    }
    instant = new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) -
      candidate.offsetMinutes * 60 * 1000,
    );
  } else {
    instant = localDateTimeInTimezoneToUtc(candidate.localDateTime, visitTimezone);
    if (!instant) {
      return {
        takenAt: null,
        warning: "The EXIF local time was ambiguous or invalid in the Visit timezone, so it was not saved.",
      };
    }
  }

  const earliest = Date.UTC(2000, 0, 1);
  const latest = now.getTime() + 48 * 60 * 60 * 1000;
  if (instant.getTime() < earliest || instant.getTime() > latest) {
    return { takenAt: null, warning: "The EXIF capture time was outside the supported range and was ignored." };
  }
  const visitInstant = new Date(visitCheckedInAt);
  const farFromVisit = !Number.isNaN(visitInstant.getTime()) &&
    Math.abs(instant.getTime() - visitInstant.getTime()) > 31 * 24 * 60 * 60 * 1000;
  return {
    takenAt: instant.toISOString(),
    warning: farFromVisit
      ? "The EXIF capture time is more than 31 days from the Visit date; review it if that seems unexpected."
      : null,
  };
}
