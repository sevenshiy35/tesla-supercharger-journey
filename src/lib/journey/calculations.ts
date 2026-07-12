import { getStateName } from "@/data/us-states";
import type { Language } from "@/i18n/translations";
import type { JourneySummary, StateJourneySummary } from "@/types/journey";
import type { SuperchargerStation } from "@/types/station";

const toPercentage = (visited: number, total: number) =>
  total === 0 ? 0 : Number(((visited / total) * 100).toFixed(2));

const latestDate = (dates: string[]) =>
  dates.filter(Boolean).length > 0
    ? [...dates].filter(Boolean).sort((a, b) => b.localeCompare(a))[0]
    : "";

export function getJourneySummary(stations: SuperchargerStation[]): JourneySummary {
  const totalStations = stations.length;
  const visitedStations = stations.filter((station) => station.status === "visited").length;
  const remainingStations = totalStations - visitedStations;
  const statesVisited = new Set(
    stations.filter((station) => station.status === "visited").map((station) => station.state),
  ).size;

  return {
    totalStations,
    visitedStations,
    remainingStations,
    completionPercentage: toPercentage(visitedStations, totalStations),
    statesVisited,
    lastUpdated: latestDate(stations.map((station) => station.lastUpdated)),
  };
}

export function getStateSummary(
  stations: SuperchargerStation[],
  stateCode: string,
): StateJourneySummary {
  const stateStations = stations.filter((station) => station.state === stateCode);
  const visited = stateStations.filter((station) => station.status === "visited");
  const visitDates = visited
    .map((station) => station.visitDate)
    .filter((date): date is string => Boolean(date));

  return {
    stateCode,
    stateName: getStateName(stateCode),
    totalStations: stateStations.length,
    visitedStations: visited.length,
    remainingStations: stateStations.length - visited.length,
    completionPercentage: toPercentage(visited.length, stateStations.length),
    firstCheckIn: visitDates.length > 0 ? [...visitDates].sort()[0] : undefined,
    latestCheckIn: latestDate(visitDates) || undefined,
    lastUpdated: latestDate(stateStations.map((station) => station.lastUpdated)),
  };
}

export function formatDisplayDate(date?: string, language: Language = "en") {
  if (!date) {
    return language === "zh" ? "尚未记录" : "Not yet";
  }

  const parsedDate = new Date(date.includes("T") ? date : `${date}T00:00:00Z`);

  if (Number.isNaN(parsedDate.getTime())) {
    return language === "zh" ? "未知" : "Unknown";
  }

  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsedDate);
}

export function formatCheckInDisplayDate(
  date: string,
  language: Language = "en",
  precision: "exact" | "date_only" = "date_only",
  timezone = "UTC",
) {
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) {
    return language === "zh" ? "未知" : "Unknown";
  }

  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    ...(precision === "exact" ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: timezone,
  }).format(parsedDate);
}
