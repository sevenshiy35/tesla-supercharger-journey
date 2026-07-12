"use client";

import dynamic from "next/dynamic";
import type { StationDataErrorView, StationDataSource } from "@/types/station-data";
import type { SuperchargerStation } from "@/types/station";

const SuperchargerMap = dynamic(
  () => import("./SuperchargerMap").then((module) => module.SuperchargerMap),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[580px] rounded-[18px] border border-white/12 bg-white/[0.06] p-6 text-white">
        Loading map...
      </div>
    ),
  },
);

interface MapSectionClientProps {
  stations: SuperchargerStation[];
  dataSource: StationDataSource;
  dataError?: StationDataErrorView;
}

export function MapSectionClient({ stations, dataSource, dataError }: MapSectionClientProps) {
  return <SuperchargerMap stations={stations} dataSource={dataSource} dataError={dataError} />;
}
