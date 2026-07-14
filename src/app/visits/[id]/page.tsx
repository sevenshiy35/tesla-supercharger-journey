import { ArrowLeft, BatteryCharging, Clock3, MapPin, Navigation } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicVisitGallery } from "@/components/visits/PublicVisitGallery";
import { formatCheckInDisplayDate } from "@/lib/journey/calculations";
import { isUuid } from "@/lib/admin/validation";
import { getPublicVisitDetail } from "@/lib/photos/data";

export const revalidate = 300;

interface PublicVisitPageProps {
  params: Promise<{ id: string }>;
}

function valueOrDash(value: number | null, suffix = "") {
  return value === null ? "—" : `${value.toLocaleString("en-US")}${suffix}`;
}

export default async function PublicVisitPage({ params }: PublicVisitPageProps) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const visit = await getPublicVisitDetail(id);
  if (!visit) notFound();

  return (
    <main className="min-h-dvh bg-canvas text-ink">
      <div className="mx-auto max-w-[1180px] px-5 pb-20 pt-6 sm:px-8 lg:px-12">
        <nav className="flex min-h-14 items-center justify-between gap-4" aria-label="Visit navigation">
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-full font-semibold text-brand">
            <ArrowLeft size={18} aria-hidden /> Back Home
          </Link>
          <Link href="/#map" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-white px-4 text-sm font-semibold">
            <Navigation size={16} aria-hidden /> View on Map
          </Link>
        </nav>

        <header className="mt-12 max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-subtle">Public check-in</p>
          <h1 className="mt-4 text-[44px] font-semibold leading-[0.98] tracking-[-0.05em] sm:text-[70px]">{visit.stationName}</h1>
          <p className="mt-6 flex items-start gap-2 text-base leading-7 text-ink-muted sm:text-lg">
            <MapPin size={20} className="mt-1 shrink-0" aria-hidden />
            <span>{visit.address}<br />{visit.city}, {visit.state} {visit.postalCode}</span>
          </p>
        </header>

        <section className="mt-10 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[28px] bg-ink p-6 text-white sm:p-8">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/65"><Clock3 size={16} aria-hidden /> Visit date</div>
            <p className="mt-3 text-2xl font-semibold sm:text-3xl">
              {formatCheckInDisplayDate(visit.checkedInAt, "en", visit.checkedInTimePrecision, visit.checkedInTimezone)}
            </p>
            <p className="mt-2 text-sm text-white/60">
              {visit.checkedInTimePrecision === "date_only" ? "Historical date-only record" : `Local time in ${visit.checkedInTimezone}`}
            </p>
          </div>
          <div className="rounded-[28px] border border-border-soft bg-white p-6 sm:p-8">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-subtle"><BatteryCharging size={16} aria-hidden /> Charging</div>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div><dt className="text-ink-subtle">Energy</dt><dd className="mt-1 font-semibold">{valueOrDash(visit.energyKwh, " kWh")}</dd></div>
              <div><dt className="text-ink-subtle">Cost</dt><dd className="mt-1 font-semibold">{visit.costUsd === null ? "—" : `$${visit.costUsd.toFixed(2)}`}</dd></div>
              <div><dt className="text-ink-subtle">Duration</dt><dd className="mt-1 font-semibold">{valueOrDash(visit.chargingMinutes, " min")}</dd></div>
              <div><dt className="text-ink-subtle">Price / kWh</dt><dd className="mt-1 font-semibold">{visit.pricePerKwh === null ? "—" : `$${visit.pricePerKwh.toFixed(4)}`}</dd></div>
            </dl>
          </div>
        </section>

        {visit.notes ? (
          <section className="mt-10 max-w-3xl" aria-labelledby="visit-notes-title">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-subtle">From the road</p>
            <h2 id="visit-notes-title" className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Visit Notes</h2>
            <p className="mt-4 whitespace-pre-wrap text-lg leading-8 text-ink-muted">{visit.notes}</p>
          </section>
        ) : null}

        <PublicVisitGallery photos={visit.photos} />

        <div className="mt-16 flex flex-wrap gap-3 border-t border-border-soft pt-8">
          <Link href="/" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-5 font-semibold text-white"><ArrowLeft size={18} aria-hidden /> Back Home</Link>
          <Link href="/#map" className="inline-flex min-h-12 items-center gap-2 rounded-full border border-border bg-white px-5 font-semibold"><MapPin size={18} aria-hidden /> Find this station on the map</Link>
        </div>
      </div>
    </main>
  );
}
