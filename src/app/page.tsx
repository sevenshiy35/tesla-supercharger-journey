import { SiteFooter } from "@/components/footer/SiteFooter";
import { HeroSection } from "@/components/hero/HeroSection";
import { JourneyIntro } from "@/components/journey/JourneyIntro";
import { MapSectionClient } from "@/components/map/MapSectionClient";
import { GlobalNavigation } from "@/components/navigation/GlobalNavigation";
import { CurrentTripSection } from "@/components/trips/CurrentTripSection";
import { getJourneySummary } from "@/lib/journey/calculations";
import { filterJourneyStations } from "@/lib/journey/station-scope";
import { StationRepositoryError } from "@/lib/stations/errors";
import { createStationsRepository } from "@/lib/stations/repository-factory";
import { getPublicHomepageTrip } from "@/lib/trips/public-repository";
import type { JourneySummary } from "@/types/journey";
import type { PublicHomepageTrip } from "@/types/public-trip";
import type { StationDataErrorView, StationDataSource } from "@/types/station-data";
import type { SuperchargerStation } from "@/types/station";

export const dynamic = "force-dynamic";

function toStationDataError(error: unknown): StationDataErrorView {
  if (error instanceof StationRepositoryError && error.code === "configuration") {
    return {
      kind: "configuration",
      title: "Station data is not configured",
      message: error.message,
      canRetry: false,
    };
  }

  if (error instanceof StationRepositoryError && error.code === "empty") {
    return {
      kind: "empty",
      title: "No station data has been imported yet",
      message: "Run the station synchronization command.",
      canRetry: false,
    };
  }

  return {
    kind: "request",
    title: "Station data is temporarily unavailable",
    message:
      error instanceof StationRepositoryError
        ? `${error.message} Retry the request in a moment.`
        : "The station feed could not be loaded. Retry the request in a moment.",
    canRetry: true,
  };
}

export default async function Home() {
  const requestedSource = process.env.STATION_DATA_SOURCE?.trim();
  let dataSource: StationDataSource =
    requestedSource === "nlr" || requestedSource === "supabase" ? requestedSource : "sample";
  let stations: SuperchargerStation[] = [];
  let homepageTrip: PublicHomepageTrip | null = null;
  let summary: JourneySummary = getJourneySummary([]);
  let dataError: StationDataErrorView | undefined;

  try {
    const selection = createStationsRepository();
    dataSource = selection.dataSource;
    stations = filterJourneyStations(await selection.repository.getAllStations());
    summary = await selection.repository.getJourneySummary(stations);
  } catch (error) {
    dataError = toStationDataError(error);
  }

  try {
    homepageTrip = await getPublicHomepageTrip();
  } catch {
    // The station directory remains useful when the optional public Trip feed is unavailable.
    homepageTrip = null;
  }

  return (
    <>
      <GlobalNavigation />
      <main>
        <HeroSection />
        <CurrentTripSection trip={homepageTrip} />
        <MapSectionClient stations={stations} dataSource={dataSource} dataError={dataError} />
        <JourneyIntro summary={summary} dataSource={dataSource} />
      </main>
      <SiteFooter lastUpdated={summary.lastUpdated} dataSource={dataSource} />
    </>
  );
}
