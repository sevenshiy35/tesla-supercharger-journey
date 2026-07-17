import type { Route } from "next";
import {
  ArrowUpRight,
  Camera,
  ChevronRight,
  CircleCheck,
  Images,
  MapPinCheck,
  Route as RouteIcon,
} from "lucide-react";
import Link from "next/link";
import { getAdminDashboardData } from "@/lib/admin/data";

export default async function AdminDashboardPage() {
  const dashboard = await getAdminDashboardData();
  const latestTripHref = dashboard.latestTrip
    ? (`/admin/trips/${dashboard.latestTrip.id}` as Route)
    : ("/admin/trips/new" as Route);
  const uploadHref = dashboard.latestTrip
    ? (`/admin/trips/${dashboard.latestTrip.id}/photos` as Route)
    : ("/admin/trips/new" as Route);
  const stationProgress = dashboard.totalStations > 0
    ? Math.min(100, (dashboard.visitedStations / dashboard.totalStations) * 100)
    : 0;
  const quickActions = [
    {
      title: "Trip",
      eyebrow: dashboard.latestTrip ? "Latest trip" : "Start planning",
      detail: dashboard.latestTrip?.name ?? "Create your first trip",
      meta: dashboard.latestTrip
        ? [dashboard.latestTrip.originLabel, dashboard.latestTrip.destinationLabel].filter(Boolean).join(" → ") || "Open trip details"
        : "Choose a route and charging stops",
      href: latestTripHref,
      icon: RouteIcon,
      tone: "bg-ink text-white",
      subtle: "text-white/60",
      iconTone: "bg-white/12 text-white",
    },
    {
      title: "Check in",
      eyebrow: "Charging stop",
      detail: "Record a station visit",
      meta: "Add charging details and 1–2 station photos",
      href: "/admin/check-in" as Route,
      icon: MapPinCheck,
      tone: "border border-[#d6c694] bg-[#f4e9bf] text-ink",
      subtle: "text-[#6d674f]",
      iconTone: "bg-white/65 text-[#8a642c]",
    },
    {
      title: "Upload",
      eyebrow: "Trip photos",
      detail: dashboard.latestTrip ? `Add to ${dashboard.latestTrip.name ?? "latest trip"}` : "Create a trip first",
      meta: "Travel photos stay with the trip · no upload limit",
      href: uploadHref,
      icon: Camera,
      tone: "border border-[#b8ddd7] bg-[#dcefeb] text-ink",
      subtle: "text-[#486d69]",
      iconTone: "bg-white/70 text-action-blue",
    },
  ] as const;
  const metrics = [
    ["Total check-ins", dashboard.totalVisits],
    ["Checked-in stations", dashboard.visitedStations],
    ["Trip plans", dashboard.totalTrips],
    ["Active trips", dashboard.activeTrips],
  ] as const;

  return (
    <main>
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-action-blue">Journey Admin</p>
        <h1 className="mt-2 text-[42px] font-semibold leading-none tracking-[-0.04em] sm:text-[54px]">Dashboard</h1>
      </header>

      <section aria-label="Quick access" className="mt-7 grid gap-4 lg:grid-cols-3">
        {quickActions.map(({ title, eyebrow, detail, meta, href, icon: Icon, tone, subtle, iconTone }) => (
          <Link
            key={title}
            href={href}
            className={`group flex min-h-[220px] flex-col rounded-[30px] p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg sm:p-7 ${tone}`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className={`flex size-12 items-center justify-center rounded-2xl ${iconTone}`}>
                <Icon size={23} strokeWidth={1.9} aria-hidden />
              </span>
              <ArrowUpRight size={23} aria-hidden className="transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1" />
            </div>
            <div className="mt-auto pt-8">
              <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${subtle}`}>{eyebrow}</p>
              <h2 className="mt-2 text-[30px] font-semibold leading-none tracking-[-0.035em]">{title}</h2>
              <p className="mt-3 truncate text-base font-semibold">{detail}</p>
              <p className={`mt-1 line-clamp-2 text-sm leading-5 ${subtle}`}>{meta}</p>
            </div>
          </Link>
        ))}
      </section>

      <section aria-labelledby="statistics-heading" className="mt-11">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-action-blue">At a glance</p>
            <h2 id="statistics-heading" className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Journey statistics</h2>
          </div>
          <Link href="/admin/visits" className="hidden items-center gap-1 text-sm font-semibold text-action-blue sm:flex">
            All visits <ChevronRight size={17} aria-hidden />
          </Link>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
          <article className="rounded-[30px] border border-[#d5e6df] bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#67817e]">Supercharger coverage</p>
                <p className="mt-3 font-data text-[52px] font-semibold leading-none tracking-[-0.055em] sm:text-[64px]">
                  {dashboard.visitedStations.toLocaleString("en-US")}
                </p>
                <p className="mt-2 text-sm text-[#67817e]">of {dashboard.totalStations.toLocaleString("en-US")} stations visited</p>
              </div>
              <div className="rounded-[22px] bg-[#f2f6f3] px-5 py-4 sm:text-right">
                <p className="font-data text-2xl font-semibold">{dashboard.visitedStates}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#67817e]">States reached</p>
              </div>
            </div>
            <div className="mt-8 h-3 overflow-hidden rounded-full bg-[#e4eeea]" aria-label={`${stationProgress.toFixed(1)} percent of stations visited`}>
              <div className="h-full min-w-1 rounded-full bg-action-blue" style={{ width: `${stationProgress}%` }} />
            </div>
            <p className="mt-3 font-data text-sm font-semibold text-[#486d69]">{stationProgress.toFixed(1)}% complete</p>

            <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-[22px] bg-[#dfeae6] sm:grid-cols-4">
              {metrics.map(([label, value]) => (
                <div key={label} className="bg-[#f8fbf9] p-4 sm:p-5">
                  <dd className="font-data text-2xl font-semibold tracking-[-0.025em]">{value.toLocaleString("en-US")}</dd>
                  <dt className="mt-1 text-xs text-[#67817e]">{label}</dt>
                </div>
              ))}
            </dl>
          </article>

          <article className="flex flex-col rounded-[30px] bg-[#214e4a] p-6 text-white shadow-sm sm:p-8">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-white/60">Photo library</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Two kinds of memories</h3>
              </div>
              <Images size={24} aria-hidden className="text-[#8bd0c5]" />
            </div>
            <dl className="mt-8 space-y-3">
              <div className="rounded-[22px] bg-white/8 p-5">
                <dt className="flex items-center gap-2 text-sm font-semibold"><CircleCheck size={16} aria-hidden /> Station photos</dt>
                <dd className="mt-3 font-data text-4xl font-semibold tracking-[-0.04em]">{dashboard.stationPhotos.toLocaleString("en-US")}</dd>
                <p className="mt-1 text-xs text-white/55">1–2 charging photos for each check-in</p>
              </div>
              <div className="rounded-[22px] bg-white/8 p-5">
                <dt className="flex items-center gap-2 text-sm font-semibold"><Images size={16} aria-hidden /> Trip photos</dt>
                <dd className="mt-3 font-data text-4xl font-semibold tracking-[-0.04em]">{dashboard.tripPhotos.toLocaleString("en-US")}</dd>
                <p className="mt-1 text-xs text-white/55">Bound to a trip, with no upload limit</p>
              </div>
            </dl>
            <Link href={uploadHref} className="mt-5 flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-ink">
              Upload trip photos <ArrowUpRight size={17} aria-hidden />
            </Link>
          </article>
        </div>
      </section>
    </main>
  );
}
