"use client";

import { useLanguage } from "@/i18n/LanguageProvider";
import type { JourneySummary } from "@/types/journey";
import type { StationDataSource } from "@/types/station-data";
import { CinematicJourneyGallery } from "./CinematicJourneyGallery";

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
    <CinematicJourneyGallery
      introduction={copy.journey.introduction}
      language={language}
      metrics={metrics}
    />
  );
}
