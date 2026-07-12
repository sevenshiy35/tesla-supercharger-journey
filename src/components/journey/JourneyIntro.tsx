"use client";

import { useLanguage } from "@/i18n/LanguageProvider";
import type { JourneySummary } from "@/types/journey";
import type { StationDataSource } from "@/types/station-data";
import { JourneyRoadAnimation } from "./JourneyRoadAnimation";

interface JourneyIntroProps {
  summary: JourneySummary;
  dataSource: StationDataSource;
}

export function JourneyIntro({ summary, dataSource }: JourneyIntroProps) {
  const { copy, language } = useLanguage();
  const locale = language === "zh" ? "zh-CN" : "en-US";
  const metrics = [
    { label: copy.journey.stationsVisited, value: summary.visitedStations.toLocaleString(locale) },
    { label: copy.journey.statesVisited, value: summary.statesVisited.toLocaleString(locale) },
    { label: copy.journey.milesDriven, value: dataSource === "sample" ? "8,420" : "--" },
  ];
  const sourceLabel = {
    sample: copy.journey.sampleData,
    nlr: copy.journey.nlrData,
    supabase: copy.journey.supabaseData,
  }[dataSource];

  return (
    <section
      id="journey-story"
      className="relative min-h-[720px] overflow-hidden bg-parchment px-5 py-24 sm:px-8 lg:px-12"
    >
      <JourneyRoadAnimation />
      <div className="relative z-10 mx-auto max-w-[980px] text-center">
        <p className="mx-auto max-w-[780px] rounded-[26px] border border-white/70 bg-[#fffdf2]/78 px-6 py-7 text-[24px] font-light leading-[1.5] text-ink shadow-[0_18px_50px_rgba(23,63,60,0.12)] backdrop-blur-xl sm:px-8 sm:text-[30px]">
          {copy.journey.introduction}
        </p>
        <div className="mt-28 grid gap-px overflow-hidden rounded-[22px] border border-white/68 bg-white/38 shadow-[0_20px_54px_rgba(23,63,60,0.14)] backdrop-blur-xl sm:mt-14 sm:grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="bg-[#fffdf2]/78 px-6 py-8 backdrop-blur-xl">
              <div className="text-[34px] font-semibold leading-none text-ink">{metric.value}</div>
              <div className="mt-3 text-[14px] leading-[1.4] text-[#3d625f]">{metric.label}</div>
            </div>
          ))}
        </div>
        <p className="mt-6 text-[14px] text-ink">{sourceLabel}</p>
      </div>
    </section>
  );
}
