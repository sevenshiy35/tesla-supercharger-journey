import type { Route } from "next";
import { ArrowRight, MapPin, Plus, Route as RouteIcon } from "lucide-react";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import {
  formatTripDistance,
  formatTripStatus,
  formatTripType,
  formatTripUpdatedAt,
} from "@/lib/trips/format";
import { listAdminTripPlans } from "@/lib/trips/repository";
import {
  TRIP_PLAN_STATUSES,
  type TripPlanStatus,
} from "@/lib/trips/types";

interface TripsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function statusHref(status: TripPlanStatus | "all") {
  return (status === "all" ? "/admin/trips" : `/admin/trips?status=${status}`) as Route;
}

function statusBadgeClass(status: TripPlanStatus) {
  if (status === "active") return "bg-[#e1f0f8] text-[#1f6f9a]";
  if (status === "completed") return "bg-[#e7f5ef] text-[#245e52]";
  if (status === "archived") return "bg-[#ecebea] text-[#625f5b]";
  if (status === "confirmed") return "bg-[#fff5e6] text-[#815719]";
  return "bg-[#edf4f0] text-[#486d69]";
}

export default async function AdminTripsPage({ searchParams }: TripsPageProps) {
  await requireAdmin();
  const params = await searchParams;
  const requestedStatus = firstValue(params.status);
  const status = TRIP_PLAN_STATUSES.includes(requestedStatus as TripPlanStatus)
    ? (requestedStatus as TripPlanStatus)
    : undefined;
  const trips = await listAdminTripPlans(status);

  return (
    <main>
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-action-blue">Route planning</p>
          <h1 className="mt-2 text-[42px] font-semibold leading-none tracking-[-0.04em] sm:text-[54px]">
            Trip Plans
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#486d69]">
            Private planning Drafts and saved trip states. Route generation is not enabled in Phase 3B.1.
          </p>
        </div>
        <Link
          href={"/admin/trips/new" as Route}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 font-semibold text-white shadow-sm transition hover:bg-[#215a55]"
        >
          <Plus size={19} aria-hidden /> New Trip
        </Link>
      </header>

      <nav aria-label="Trip Plan status filter" className="mt-8 flex gap-2 overflow-x-auto pb-2">
        {(["all", ...TRIP_PLAN_STATUSES] as const).map((value) => {
          const active = value === "all" ? !status : status === value;
          return (
            <Link
              key={value}
              href={statusHref(value)}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                active
                  ? "border-ink bg-ink text-white"
                  : "border-[#bedbd5] bg-white text-[#486d69] hover:border-[#86bcb3]"
              }`}
            >
              {value === "all" ? "All" : formatTripStatus(value)}
            </Link>
          );
        })}
      </nav>

      {trips.length ? (
        <section aria-label="Trip Plans" className="mt-5 grid gap-4 xl:grid-cols-2">
          {trips.map((trip) => (
            <article key={trip.id} className="rounded-[26px] border border-[#d5e6df] bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-semibold tracking-[-0.02em]">
                    {trip.name ?? "Untitled trip"}
                  </h2>
                  <p className="mt-1 text-sm font-medium text-[#67817e]">{formatTripType(trip.tripType)}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(trip.status)}`}>
                  {formatTripStatus(trip.status)}
                </span>
              </div>

              <div className="mt-5 rounded-[20px] bg-[#f2f6f3] p-4">
                <div className="flex items-start gap-3">
                  <MapPin size={18} aria-hidden className="mt-0.5 shrink-0 text-action-blue" />
                  <p className="min-w-0 text-sm leading-6">
                    <span className="block truncate font-semibold">{trip.originLabel ?? "Origin not selected"}</span>
                    <span className="block text-[#67817e]">to</span>
                    <span className="block truncate font-semibold">{trip.destinationLabel ?? "Destination not selected"}</span>
                  </p>
                </div>
              </div>

              <dl className="mt-5 grid grid-cols-3 gap-3 text-sm [&_dd]:font-data">
                <div>
                  <dt className="text-xs text-[#67817e]">Stops</dt>
                  <dd className="mt-1 font-semibold">{trip.stopCount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#67817e]">Planned distance</dt>
                  <dd className="mt-1 font-semibold">{formatTripDistance(trip.plannedDistanceMeters)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#67817e]">Last updated</dt>
                  <dd className="mt-1 font-semibold">{formatTripUpdatedAt(trip.updatedAt)}</dd>
                </div>
              </dl>

              <div className="mt-5 flex justify-end border-t border-[#e2ece8] pt-4">
                <Link
                  href={`/admin/trips/${trip.id}` as Route}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-action-blue hover:bg-[#edf4f0]"
                >
                  Open <ArrowRight size={17} aria-hidden />
                </Link>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="mt-5 rounded-[28px] border border-dashed border-[#bedbd5] bg-white px-6 py-14 text-center">
          <RouteIcon size={30} aria-hidden className="mx-auto text-action-blue" />
          <h2 className="mt-4 text-xl font-semibold">
            {status ? `No ${formatTripStatus(status).toLowerCase()} Trip Plans.` : "No trip plans yet."}
          </h2>
          <p className="mt-2 text-sm text-[#67817e]">
            {status ? "Choose another status or view all Trip Plans." : "Create a Draft to choose a trip type, origin, and destination."}
          </p>
          {!status ? (
            <Link href={"/admin/trips/new" as Route} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 font-semibold text-white">
              <Plus size={18} aria-hidden /> New Trip
            </Link>
          ) : null}
        </section>
      )}
    </main>
  );
}
