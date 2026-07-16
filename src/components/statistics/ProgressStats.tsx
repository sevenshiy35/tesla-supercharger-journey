"use client";

import { BatteryCharging, CalendarDays, Gauge, MapPinned } from "lucide-react";
import { useMemo } from "react";
import { useLanguage } from "@/i18n/LanguageProvider";
import { getLocalizedStateName } from "@/i18n/state-names";
import { interpolateText } from "@/i18n/translations";
import { formatDisplayDate, getJourneySummary, getStateSummary } from "@/lib/journey/calculations";
import type { SuperchargerStation } from "@/types/station";

interface ProgressStatsProps {
  stations: SuperchargerStation[];
  selectedState: string;
}

export function ProgressStats({ stations, selectedState }: ProgressStatsProps) {
  const { copy, language } = useLanguage();
  const locale = language === "zh" ? "zh-CN" : "en-US";
  const nationalSummary = useMemo(() => getJourneySummary(stations), [stations]);
  const stateSummary = useMemo(
    () => (selectedState ? getStateSummary(stations, selectedState) : null),
    [selectedState, stations],
  );
  const activeSummary = stateSummary ?? nationalSummary;
  const completeLabel = interpolateText(copy.progress.complete, {
    percentage: activeSummary.completionPercentage.toFixed(2),
  });

  const rows = stateSummary
    ? [
        { label: copy.progress.stateName, value: getLocalizedStateName(stateSummary.stateCode, language), icon: MapPinned },
        { label: copy.progress.totalStations, value: stateSummary.totalStations.toLocaleString(locale), icon: Gauge },
        { label: copy.progress.visited, value: stateSummary.visitedStations.toLocaleString(locale), icon: BatteryCharging },
        { label: copy.progress.remaining, value: stateSummary.remainingStations.toLocaleString(locale), icon: MapPinned },
        { label: copy.progress.completion, value: completeLabel, icon: Gauge },
        { label: copy.progress.firstCheckIn, value: formatDisplayDate(stateSummary.firstCheckIn, language), icon: CalendarDays },
        { label: copy.progress.lastUpdated, value: formatDisplayDate(stateSummary.lastUpdated, language), icon: CalendarDays },
      ]
    : [
        { label: copy.progress.totalSuperchargers, value: nationalSummary.totalStations.toLocaleString(locale), icon: Gauge },
        { label: copy.progress.visited, value: nationalSummary.visitedStations.toLocaleString(locale), icon: BatteryCharging },
        { label: copy.progress.remaining, value: nationalSummary.remainingStations.toLocaleString(locale), icon: MapPinned },
        { label: copy.progress.completion, value: completeLabel, icon: Gauge },
        { label: copy.progress.statesVisited, value: nationalSummary.statesVisited.toLocaleString(locale), icon: MapPinned },
        { label: copy.progress.lastUpdated, value: formatDisplayDate(nationalSummary.lastUpdated, language), icon: CalendarDays },
      ];

  return (
    <aside id="statistics" className="border border-[#a5e9dd]/24 bg-[#a5e9dd]/10 p-5 font-ui text-white sm:p-6">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <p className="text-[14px] text-white/66">{copy.progress.eyebrow}</p>
          <h3 className="mt-2 text-[32px] font-semibold leading-[1.1]">
            {stateSummary
              ? getLocalizedStateName(stateSummary.stateCode, language)
              : copy.progress.unitedStates}
          </h3>
        </div>
        <div className="border-t border-white/12 pt-5 md:min-w-[280px] md:border-t-0 md:border-l md:pt-0 md:pl-8">
          <div className="font-data text-[40px] font-semibold leading-none">
            {activeSummary.visitedStations.toLocaleString(locale)} /{" "}
            {activeSummary.totalStations.toLocaleString(locale)}
          </div>
          <p className="mt-3 text-[17px] text-white/72">{completeLabel}</p>
        </div>
      </div>
      <dl className="mt-7 grid gap-px overflow-hidden rounded-[18px] border border-[#a5e9dd]/22 bg-[#a5e9dd]/22 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => {
          const Icon = row.icon;

          return (
            <div key={row.label} className="grid min-h-[88px] grid-cols-[28px_1fr] gap-3 bg-tile-2 px-4 py-4">
              <Icon aria-hidden className="mt-0.5 text-action-blue-dark" size={18} />
              <div>
                <dt className="text-[13px] leading-[1.35] text-white/58">{row.label}</dt>
                <dd className="mt-1 font-data text-[17px] leading-[1.35] text-white">{row.value}</dd>
              </div>
            </div>
          );
        })}
      </dl>
    </aside>
  );
}
