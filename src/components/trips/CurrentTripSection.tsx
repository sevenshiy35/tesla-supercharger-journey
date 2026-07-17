"use client";

import { Check, House } from "lucide-react";
import { useMemo } from "react";
import { useLanguage } from "@/i18n/LanguageProvider";
import { interpolateText } from "@/i18n/translations";
import type { PublicHomepageTrip, PublicTripStop } from "@/types/public-trip";
import { PublicTripMap } from "./PublicTripMap";
import styles from "./CurrentTripSection.module.css";

function dateValue(stop: PublicTripStop) {
  return stop.checkedInAt ?? stop.estimatedArrivalAt;
}

function formatTripDates(trip: PublicHomepageTrip, language: "en" | "zh") {
  const dates = trip.stops.flatMap((stop) => dateValue(stop) ? [new Date(dateValue(stop) as string)] : []);
  const valid = dates.filter((date) => Number.isFinite(date.getTime())).sort((a, b) => a.getTime() - b.getTime());
  if (valid.length === 0) return language === "zh" ? "行程日期待定" : "Trip dates to be announced";
  const locale = language === "zh" ? "zh-CN" : "en-US";
  const first = valid[0];
  const last = valid.at(-1) as Date;
  if (first.toDateString() === last.toDateString()) return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(first);
  if (first.getFullYear() === last.getFullYear() && first.getMonth() === last.getMonth()) {
    const month = new Intl.DateTimeFormat(locale, { month: "short" }).format(first);
    return language === "zh" ? `${first.getFullYear()}年${first.getMonth() + 1}月${first.getDate()}–${last.getDate()}日` : `${month} ${first.getDate()}–${last.getDate()}, ${first.getFullYear()}`;
  }
  const format = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" });
  return `${format.format(first)} – ${format.format(last)}`;
}

function stopStatus(stop: PublicTripStop, currentId: string | null, language: "en" | "zh") {
  if (stop.status === "visited") return language === "zh" ? "已打卡" : "Checked in";
  if (stop.id === currentId) return language === "zh" ? "下一站" : "Next stop";
  return language === "zh" ? "计划中" : "Planned";
}

function formatStopDate(stop: PublicTripStop, language: "en" | "zh") {
  const value = dateValue(stop);
  if (!value) return `${stop.city}, ${stop.state}`;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return `${stop.city}, ${stop.state}`;
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

type TimelineItem =
  | { kind: "home"; id: "home" }
  | { kind: "stop"; id: string; stop: PublicTripStop };

function connectorState(item: TimelineItem, next: TimelineItem | undefined) {
  if (!next) return null;
  if (next.kind === "stop" && next.stop.status === "visited") return "completed" as const;
  if (item.kind === "home" || item.stop.status === "visited") return "current" as const;
  return "planned" as const;
}

function PixelModelY({ motion, label }: { motion: "parked" | "driving"; label: string }) {
  return (
    <span className={`${styles.timelineCar} ${motion === "parked" ? styles.timelineCarParked : styles.timelineCarDriving}`} role="img" aria-label={label}>
      <span className={styles.timelineRoad} aria-hidden>
        <span className={styles.timelineRoadMarkings} />
      </span>
      <span className={styles.timelineCarSprite} aria-hidden />
    </span>
  );
}

export function CurrentTripSection({ trip }: { trip: PublicHomepageTrip | null }) {
  const { copy, language } = useLanguage();
  const nextStop = trip?.stops.find((stop) => stop.status !== "visited") ?? null;
  const visitedCount = trip?.stops.filter((stop) => stop.status === "visited").length ?? 0;
  const displayItems = useMemo<TimelineItem[]>(() => {
    if (!trip) return [];
    const items: TimelineItem[] = [
      { kind: "home", id: "home" },
      ...trip.stops.map((stop) => ({ kind: "stop" as const, id: stop.id, stop })),
    ];
    if (items.length <= 6) return items;
    const pendingStopIndex = trip.stops.findIndex((stop) => stop.status !== "visited");
    const focusIndex = pendingStopIndex === -1 ? items.length - 1 : pendingStopIndex + 1;
    const start = Math.max(0, Math.min(items.length - 6, focusIndex - 2));
    return items.slice(start, start + 6);
  }, [trip]);

  if (!trip) {
    return (
      <section id="trip" className="bg-canvas px-5 py-20 text-ink sm:px-8 lg:px-12 lg:py-28">
        <div className="mx-auto max-w-[1180px] border-y border-border-soft py-14">
          <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-brand">{copy.trip.eyebrow}</p>
          <h2 className={`mt-5 text-[42px] font-normal sm:text-[58px] ${language === "zh" ? "font-story-cn leading-[1.16]" : "font-display-en leading-[1.02] tracking-[-0.035em]"}`}>{copy.trip.emptyTitle}</h2>
          <p className="mt-5 max-w-xl text-[18px] leading-8 text-ink-muted">{copy.trip.emptyDescription}</p>
        </div>
      </section>
    );
  }

  const narrative = nextStop
    ? visitedCount > 0
      ? interpolateText(copy.trip.nextNarrative, { count: String(visitedCount), station: nextStop.city })
      : interpolateText(copy.trip.firstNarrative, { station: nextStop.city })
    : copy.trip.completeNarrative;
  const progress = interpolateText(copy.trip.progress, { visited: String(visitedCount), total: String(trip.stops.length) });
  const pendingStopIndex = trip.stops.findIndex((stop) => stop.status !== "visited");
  const carAfterStopId = nextStop && pendingStopIndex > 0 ? trip.stops[pendingStopIndex - 1]?.id ?? null : null;
  const isComplete = trip.stops.length > 0 && nextStop === null;

  return (
    <section id="trip" className="bg-canvas px-5 py-20 text-ink sm:px-8 lg:px-12 lg:py-28">
      <div className="mx-auto max-w-[1320px]">
        <div className="grid items-center gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
          <header>
            <p className="text-[12px] font-bold uppercase tracking-[0.24em] text-brand">{isComplete ? copy.trip.completeEyebrow : copy.trip.eyebrow}</p>
            <h2 className={`mt-6 text-balance text-[52px] font-normal sm:text-[68px] lg:text-[76px] ${language === "zh" ? "font-story-cn leading-[1.12] tracking-[0.02em]" : "font-display-en leading-[0.98] tracking-[-0.045em]"}`}>{trip.name}</h2>
            <p className={`mt-7 text-[20px] text-ink ${language === "zh" ? "font-story-cn" : "font-display-en"}`}>{formatTripDates(trip, language)}</p>
            <p className="mt-5 max-w-[460px] text-[17px] leading-7 text-ink-muted">{narrative}</p>
          </header>
          <PublicTripMap trip={trip} label={copy.trip.mapLabel} />
        </div>

        <div className={`${styles.timelineViewport} mt-10 overflow-x-auto pb-4 pt-20 lg:mt-12`}>
          <ol className={styles.timeline} style={{ gridTemplateColumns: `repeat(${displayItems.length}, minmax(174px, 1fr))` }} aria-label={copy.trip.timelineLabel}>
            {displayItems.map((item, index) => {
              const state = connectorState(item, displayItems[index + 1]);
              const isHome = item.kind === "home";
              const stop = item.kind === "stop" ? item.stop : null;
              const visited = isHome ? visitedCount > 0 : stop?.status === "visited";
              const current = isHome ? visitedCount === 0 && nextStop !== null : stop?.id === nextStop?.id;
              const showParkedCar = isHome && visitedCount === 0 && nextStop !== null;
              const showDrivingCar = item.kind === "stop" && item.id === carAfterStopId;
              const markerState = isHome
                ? visited
                  ? styles.markerVisited
                  : styles.markerHome
                : visited
                  ? styles.markerVisited
                  : current
                    ? styles.markerCurrent
                    : styles.markerPlanned;
              return (
                <li key={item.id} className={styles.stop}>
                  {showParkedCar ? <PixelModelY motion="parked" label={copy.trip.timelineVehicleLabel} /> : null}
                  {state ? (
                    <span aria-hidden className={`${styles.connector} ${state === "completed" ? styles.connectorCompleted : state === "current" ? styles.connectorCurrent : styles.connectorPlanned}`}>
                      {showDrivingCar ? <PixelModelY motion="driving" label={copy.trip.timelineVehicleLabel} /> : null}
                    </span>
                  ) : null}
                  <span aria-hidden className={`${styles.marker} ${markerState}`}>
                    {isHome ? <House size={22} strokeWidth={2.4} /> : visited ? <Check size={24} strokeWidth={2.5} /> : null}
                  </span>
                  <p className={`mt-5 text-[19px] leading-6 ${language === "zh" ? "font-story-cn" : "font-display-en"}`}>{isHome ? copy.trip.homeLabel : `${stop?.city}, ${stop?.state}`}</p>
                  <p className={`mt-2 text-[13px] font-bold uppercase tracking-[0.08em] ${visited ? "text-visited" : current ? "text-brand" : "text-unvisited"}`}>{isHome ? copy.trip.homeStatus : stop ? stopStatus(stop, nextStop?.id ?? null, language) : null}</p>
                  <p className="mt-2 text-[13px] text-ink-subtle">{isHome ? copy.trip.homeLocation : stop ? formatStopDate(stop, language) : null}</p>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border-soft pt-7">
          <p className={`text-[21px] text-ink ${language === "zh" ? "font-story-cn" : "font-display-en"}`}>{progress}</p>
          <p className="font-data text-[12px] uppercase tracking-[0.12em] text-ink-subtle">{copy.trip.liveLabel}</p>
        </div>
      </div>
    </section>
  );
}
