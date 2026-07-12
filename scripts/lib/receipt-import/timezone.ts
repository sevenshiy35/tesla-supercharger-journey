import tzLookup from "tz-lookup";

interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function parseLocalDateTime(value: string): LocalDateTimeParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) {
    throw new Error("localStartedAt must use YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss.");
  }
  const parts = match.slice(1).map(Number);
  const parsed = {
    year: parts[0] ?? 0,
    month: parts[1] ?? 0,
    day: parts[2] ?? 0,
    hour: parts[3] ?? 0,
    minute: parts[4] ?? 0,
    second: parts[5] ?? 0,
  };
  const date = new Date(Date.UTC(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    parsed.hour,
    parsed.minute,
    parsed.second,
  ));
  if (
    date.getUTCFullYear() !== parsed.year
    || date.getUTCMonth() + 1 !== parsed.month
    || date.getUTCDate() !== parsed.day
    || date.getUTCHours() !== parsed.hour
    || date.getUTCMinutes() !== parsed.minute
    || date.getUTCSeconds() !== parsed.second
  ) {
    throw new Error("localStartedAt is not a valid calendar date and time.");
  }
  return parsed;
}

function formattedParts(instant: Date, timezone: string): LocalDateTimeParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

function partsAsUtcMilliseconds(parts: LocalDateTimeParts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function partsEqual(left: LocalDateTimeParts, right: LocalDateTimeParts) {
  return left.year === right.year
    && left.month === right.month
    && left.day === right.day
    && left.hour === right.hour
    && left.minute === right.minute
    && left.second === right.second;
}

export function lookupTimezone(latitude: number, longitude: number) {
  return tzLookup(latitude, longitude);
}

export function localDateTimeToUtc(localStartedAt: string, timezone: string) {
  const target = parseLocalDateTime(localStartedAt);
  const targetMilliseconds = partsAsUtcMilliseconds(target);
  let candidateMilliseconds = targetMilliseconds;

  try {
    formattedParts(new Date(candidateMilliseconds), timezone);
  } catch {
    throw new Error(`Invalid IANA timezone: ${timezone}`);
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = formattedParts(new Date(candidateMilliseconds), timezone);
    candidateMilliseconds += targetMilliseconds - partsAsUtcMilliseconds(current);
  }

  const candidate = new Date(candidateMilliseconds);
  if (!partsEqual(formattedParts(candidate, timezone), target)) {
    throw new Error("Local start time does not exist in this timezone because of a DST transition.");
  }

  const alternativeMatches = [-3_600_000, 3_600_000].some((delta) =>
    partsEqual(formattedParts(new Date(candidateMilliseconds + delta), timezone), target),
  );
  if (alternativeMatches) {
    throw new Error("Local start time is ambiguous in this timezone because of a DST transition.");
  }

  return candidate.toISOString();
}

export function localDateNoonToUtc(eventDate: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    throw new Error("eventDate must use YYYY-MM-DD.");
  }
  return localDateTimeToUtc(`${eventDate}T12:00:00`, timezone);
}
