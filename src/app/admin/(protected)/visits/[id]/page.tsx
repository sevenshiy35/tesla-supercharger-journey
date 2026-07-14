import { ArrowLeft, BatteryCharging, Clock3, Map, MapPin, Navigation, ReceiptText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicBadge } from "@/components/admin/PublicBadge";
import { VisitEditor } from "@/components/admin/VisitEditor";
import { VisitPhotoManager } from "@/components/admin/VisitPhotoManager";
import { VisitTime } from "@/components/admin/VisitTime";
import { getAdminVisitDetail } from "@/lib/admin/data";
import { isUuid } from "@/lib/admin/validation";
import { getAdminVisitPhotos } from "@/lib/photos/data";

interface VisitDetailPageProps {
  params: Promise<{ id: string }>;
}

function valueOrDash(value: number | null, suffix = "") {
  return value === null ? "—" : `${value.toLocaleString("en-US")}${suffix}`;
}

export default async function AdminVisitDetailPage({ params }: VisitDetailPageProps) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [visit, photos] = await Promise.all([getAdminVisitDetail(id), getAdminVisitPhotos(id)]);
  if (!visit) notFound();

  const hasChargingRecord =
    visit.energyKwh !== null ||
    visit.costUsd !== null ||
    visit.chargingMinutes !== null ||
    visit.pricePerKwh !== null ||
    visit.startedAt !== null;

  return (
    <main>
      <Link
        href="/admin/visits"
        className="inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold text-action-blue"
      >
        <ArrowLeft size={18} aria-hidden /> Back to Visits
      </Link>

      <header className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <PublicBadge isPublic={visit.isPublic} />
            <span className="rounded-full bg-[#edf4f0] px-2.5 py-1 text-xs font-semibold text-[#486d69]">
              {visit.checkedInTimePrecision === "exact" ? "Exact time" : "Date only"}
            </span>
          </div>
          <h1 className="mt-4 text-[38px] font-semibold leading-[1.02] tracking-[-0.04em] sm:text-[50px]">
            {visit.stationName}
          </h1>
          <p className="mt-3 text-base leading-7 text-[#486d69]">
            {visit.address}
            <br />
            {visit.city}, {visit.state} {visit.postalCode}
          </p>
        </div>
        <Link
          href="/#map"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#bedbd5] bg-white px-5 font-semibold shadow-sm"
        >
          <Map size={18} aria-hidden /> View Public Map
        </Link>
      </header>

      <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className="space-y-5">
          <section className="rounded-[28px] border border-[#d5e6df] bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-2xl font-semibold tracking-[-0.025em]">Visit details</h2>
            <dl className="mt-6 grid gap-5 sm:grid-cols-2">
              <div className="rounded-[20px] bg-[#f2f6f3] p-4 sm:col-span-2">
                <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#67817e]">
                  <Clock3 size={16} aria-hidden /> Visit date
                </dt>
                <dd className="mt-2 text-lg font-semibold">
                  <VisitTime
                    checkedInAt={visit.checkedInAt}
                    timezone={visit.checkedInTimezone}
                    precision={visit.checkedInTimePrecision}
                  />
                </dd>
                <p className="mt-1 text-xs text-[#67817e]">
                  {visit.checkedInTimePrecision === "date_only"
                    ? "Historical date-only record; no invented clock time is shown."
                    : "Exact database-recorded timestamp shown in the check-in timezone."}
                </p>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[#67817e]">Timezone</dt>
                <dd className="mt-1 break-words font-semibold">{visit.checkedInTimezone}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[#67817e]">Record source</dt>
                <dd className="mt-1 flex items-center gap-2 font-semibold">
                  {hasChargingRecord ? <ReceiptText size={17} aria-hidden /> : <MapPin size={17} aria-hidden />}
                  {hasChargingRecord ? "Receipt-backed charging record" : "Mobile check-in"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[#67817e]">GPS</dt>
                <dd className="mt-1 font-semibold">
                  {visit.hasGps ? (
                    <span className="flex items-center gap-2">
                      <Navigation size={17} aria-hidden className="text-action-blue" />
                      {visit.recordedLatitude?.toFixed(6)}, {visit.recordedLongitude?.toFixed(6)}
                    </span>
                  ) : (
                    "Not recorded"
                  )}
                </dd>
                {visit.hasGps ? (
                  <p className="mt-1 text-xs text-[#67817e]">Private administrator-only phone position.</p>
                ) : null}
              </div>
            </dl>
          </section>

          <section className="rounded-[28px] border border-[#d5e6df] bg-white p-5 shadow-sm sm:p-7">
            <div className="flex items-center gap-3">
              <BatteryCharging size={23} aria-hidden className="text-action-blue" />
              <h2 className="text-2xl font-semibold tracking-[-0.025em]">Charging data</h2>
            </div>
            {hasChargingRecord ? (
              <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-[#67817e]">Energy</dt>
                  <dd className="mt-1 font-semibold">{valueOrDash(visit.energyKwh, " kWh")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#67817e]">Cost</dt>
                  <dd className="mt-1 font-semibold">
                    {visit.costUsd === null ? "—" : `$${visit.costUsd.toFixed(2)}`}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[#67817e]">Duration</dt>
                  <dd className="mt-1 font-semibold">{valueOrDash(visit.chargingMinutes, " min")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#67817e]">Price / kWh</dt>
                  <dd className="mt-1 font-semibold">
                    {visit.pricePerKwh === null ? "—" : `$${visit.pricePerKwh.toFixed(4)}`}
                  </dd>
                </div>
              </dl>
            ) : (
              <div className="mt-5 rounded-[20px] bg-[#f2f6f3] px-5 py-7 text-center">
                <p className="font-semibold">No Charging Session</p>
                <p className="mt-1 text-sm text-[#67817e]">
                  Mobile check-ins do not create charging or Receipt records.
                </p>
              </div>
            )}
          </section>
        </div>

        <VisitEditor visit={visit} />
      </div>
      <VisitPhotoManager
        visitId={visit.id}
        visitIsPublic={visit.isPublic}
        visitTimezone={visit.checkedInTimezone}
        initialPhotos={photos}
      />
    </main>
  );
}
