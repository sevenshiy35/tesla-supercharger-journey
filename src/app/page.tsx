import { LatestCheckIns } from "@/components/check-ins/LatestCheckIns";
import { SiteFooter } from "@/components/footer/SiteFooter";
import { HeroSection } from "@/components/hero/HeroSection";
import { JourneyIntro } from "@/components/journey/JourneyIntro";
import { MapSectionClient } from "@/components/map/MapSectionClient";
import { GlobalNavigation } from "@/components/navigation/GlobalNavigation";
import { getJourneySummary } from "@/lib/journey/calculations";
import { filterJourneyCheckIns, filterJourneyStations } from "@/lib/journey/station-scope";
import { StationRepositoryError } from "@/lib/stations/errors";
import { createStationsRepository } from "@/lib/stations/repository-factory";
import type { CheckInRecord, JourneySummary } from "@/types/journey";
import type { StationDataErrorView, StationDataSource } from "@/types/station-data";
import type { SuperchargerStation } from "@/types/station";

export const dynamic = "force-dynamic";

function toStationDataError(error: unknown): StationDataErrorView {
  if (error instanceof StationRepositoryError && error.code === "configuration") {
    return {
      title: "Station data is not configured",
      message: error.message,
      canRetry: false,
    };
  }

  return {
    title: "Station data is temporarily unavailable",
    message:
      error instanceof StationRepositoryError
        ? `${error.message} Retry the request in a moment.`
        : "The station feed could not be loaded. Retry the request in a moment.",
    canRetry: true,
  };
}

export default async function Home() {
  let dataSource: StationDataSource = process.env.STATION_DATA_SOURCE === "nlr" ? "nlr" : "sample";
  let stations: SuperchargerStation[] = [];
  let latestCheckIns: CheckInRecord[] = [];
  let summary: JourneySummary = getJourneySummary([]);
  let dataError: StationDataErrorView | undefined;

  try {
    const selection = createStationsRepository();
    dataSource = selection.dataSource;
    stations = filterJourneyStations(await selection.repository.getAllStations());
    const [activeSummary, repositoryCheckIns] = await Promise.all([
      selection.repository.getJourneySummary(stations),
      selection.repository.getLatestCheckIns(6),
    ]);
    summary = activeSummary;
    latestCheckIns = filterJourneyCheckIns(repositoryCheckIns);
  } catch (error) {
    dataError = toStationDataError(error);
  }

  return (
    <>
      <GlobalNavigation />
      <main>
        <HeroSection />
        <JourneyIntro summary={summary} dataSource={dataSource} />
        <MapSectionClient stations={stations} dataSource={dataSource} dataError={dataError} />
        <LatestCheckIns checkIns={latestCheckIns} dataSource={dataSource} />
      </main>
      <SiteFooter lastUpdated={summary.lastUpdated} dataSource={dataSource} />
    </>
  );
}
