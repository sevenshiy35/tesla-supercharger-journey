"use client";

import { useLanguage } from "@/i18n/LanguageProvider";
import type { JourneySummary } from "@/types/journey";
import type { StationDataSource } from "@/types/station-data";

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

  return (
    <section className="relative overflow-hidden bg-parchment px-5 py-20 sm:px-8 lg:px-12">
      <div
        aria-hidden
        className="absolute inset-0 scale-110 bg-[url('/images/hero/tesla.png')] bg-cover bg-center opacity-75 blur-2xl"
      />
      <div aria-hidden className="absolute inset-0 bg-[#fdf4af]/45" />
      <div className="relative z-10 mx-auto max-w-[980px] text-center">
        <p className="mx-auto max-w-[780px] rounded-[26px] border border-white/48 bg-[#fffdf2]/42 px-6 py-7 text-[24px] font-light leading-[1.5] text-ink shadow-[0_20px_60px_rgba(23,63,60,0.16)] backdrop-blur-2xl sm:px-8 sm:text-[30px]">
          {copy.journey.introduction}
        </p>
        <div className="mt-14 grid gap-px overflow-hidden rounded-[22px] border border-white/48 bg-white/28 shadow-[0_24px_70px_rgba(23,63,60,0.2)] backdrop-blur-xl sm:grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="bg-[#fffdf2]/58 px-6 py-8 backdrop-blur-xl">
              <div className="text-[34px] font-semibold leading-none text-ink">{metric.value}</div>
              <div className="mt-3 text-[14px] leading-[1.4] text-[#3d625f]">{metric.label}</div>
            </div>
          ))}
        </div>
        {dataSource === "sample" ? (
          <p className="mt-6 text-[14px] text-ink">{copy.journey.sampleData}</p>
        ) : null}
      </div>
    </section>
  );
}
