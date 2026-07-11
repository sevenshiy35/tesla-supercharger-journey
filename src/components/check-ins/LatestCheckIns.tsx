"use client";

import Image from "next/image";
import { useLanguage } from "@/i18n/LanguageProvider";
import { getLocalizedStateName } from "@/i18n/state-names";
import { interpolateText, sampleCheckInNotesZh } from "@/i18n/translations";
import { formatDisplayDate } from "@/lib/journey/calculations";
import type { CheckInRecord } from "@/types/journey";
import type { StationDataSource } from "@/types/station-data";

interface LatestCheckInsProps {
  checkIns: CheckInRecord[];
  dataSource: StationDataSource;
}

export function LatestCheckIns({ checkIns, dataSource }: LatestCheckInsProps) {
  const { copy, language } = useLanguage();

  return (
    <section id="latest-check-ins" className="bg-[#fffdf2] px-5 py-20 text-ink sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1180px]">
        <div className="max-w-[760px]">
          <h2 className="text-[40px] font-semibold leading-[1.1] sm:text-[56px]">
            {copy.checkIns.title}
          </h2>
          <p className="mt-4 text-[21px] leading-[1.4] text-[#3d625f]">
            {dataSource === "sample"
              ? copy.checkIns.sampleDescription
              : copy.checkIns.liveDescription}
          </p>
        </div>

        {checkIns.length > 0 ? (
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {checkIns.map((checkIn, index) => (
              <article
                key={checkIn.id}
                className={index === 0 ? "md:col-span-2" : undefined}
              >
                <div className="relative aspect-[16/10] overflow-hidden rounded-[18px] bg-parchment">
                  <Image
                    src={checkIn.imageUrl ?? "/images/checkins/default.svg"}
                    alt={interpolateText(copy.checkIns.imageAlt, {
                      station: checkIn.stationName,
                    })}
                    fill
                    sizes={index === 0 ? "(min-width: 1024px) 760px, 100vw" : "(min-width: 1024px) 380px, 100vw"}
                    className="object-cover"
                    priority={index === 0}
                  />
                </div>
                <div className="mt-5">
                  <p className="text-[14px] text-[#3d625f]">
                    {checkIn.city}, {getLocalizedStateName(checkIn.state, language)} ·{" "}
                    {formatDisplayDate(checkIn.checkedInAt, language)}
                  </p>
                  <h3 className="mt-2 text-[24px] font-semibold leading-[1.15]">{checkIn.stationName}</h3>
                  <p className="mt-3 text-[17px] leading-[1.5] text-[#3d625f]">
                    {language === "zh" ? sampleCheckInNotesZh[checkIn.id] ?? checkIn.note : checkIn.note}
                  </p>
                  <p className="mt-3 text-[14px] text-[#3d625f]">
                    {checkIn.energyKwh?.toFixed(1) ?? "--"} kWh · $
                    {checkIn.costUsd?.toFixed(2) ?? "--"}
                  </p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-10 border-t border-hairline pt-8">
            <p className="text-[18px] text-[#3d625f]">{copy.checkIns.empty}</p>
          </div>
        )}
      </div>
    </section>
  );
}
