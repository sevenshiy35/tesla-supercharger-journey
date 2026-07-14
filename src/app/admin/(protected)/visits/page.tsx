import type { Route } from "next";
import { ChevronLeft, ChevronRight, FilterX, MapPin, Search } from "lucide-react";
import Link from "next/link";
import { PublicBadge } from "@/components/admin/PublicBadge";
import { VisitTime } from "@/components/admin/VisitTime";
import { US_STATES } from "@/data/us-states";
import { getAdminVisits, type VisitFilters } from "@/lib/admin/data";

interface VisitsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function pageHref(filters: VisitFilters, page: number) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.visibility !== "all") params.set("visibility", filters.visibility);
  if (filters.precision !== "all") params.set("precision", filters.precision);
  if (filters.state) params.set("state", filters.state);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return (query ? `/admin/visits?${query}` : "/admin/visits") as Route;
}

export default async function AdminVisitsPage({ searchParams }: VisitsPageProps) {
  const params = await searchParams;
  const visibilityValue = firstValue(params.visibility);
  const precisionValue = firstValue(params.precision);
  const stateValue = firstValue(params.state).toUpperCase();
  const filters: VisitFilters = {
    query: firstValue(params.q).trim().slice(0, 100),
    visibility:
      visibilityValue === "public" || visibilityValue === "private" ? visibilityValue : "all",
    precision:
      precisionValue === "exact" || precisionValue === "date_only" ? precisionValue : "all",
    state: US_STATES.some((state) => state.code === stateValue) ? stateValue : "",
    page: Math.max(1, Number.parseInt(firstValue(params.page), 10) || 1),
  };
  const result = await getAdminVisits(filters);
  const hasFilters =
    Boolean(filters.query) ||
    filters.visibility !== "all" ||
    filters.precision !== "all" ||
    Boolean(filters.state);

  return (
    <main>
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-action-blue">Visit history</p>
        <h1 className="mt-2 text-[42px] font-semibold leading-none tracking-[-0.04em] sm:text-[54px]">
          Visits
        </h1>
        <p className="mt-4 text-base text-[#486d69]">
          {result.total} {result.total === 1 ? "record" : "records"} matching this view.
        </p>
      </header>

      <form
        action="/admin/visits"
        method="get"
        className="mt-8 rounded-[26px] border border-[#d5e6df] bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_repeat(3,minmax(140px,1fr))_auto]">
          <label className="relative">
            <span className="sr-only">Search station name or city</span>
            <Search
              size={18}
              aria-hidden
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#67817e]"
            />
            <input
              name="q"
              type="search"
              defaultValue={filters.query}
              className="min-h-12 w-full rounded-2xl border border-[#bedbd5] py-2 pl-11 pr-4 outline-none focus:border-action-blue focus:ring-4 focus:ring-[#34908b]/15"
              placeholder="Station or city"
            />
          </label>
          <label>
            <span className="sr-only">Visibility</span>
            <select
              name="visibility"
              defaultValue={filters.visibility}
              className="min-h-12 w-full rounded-2xl border border-[#bedbd5] bg-white px-4 outline-none focus:border-action-blue"
            >
              <option value="all">All visibility</option>
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Time precision</span>
            <select
              name="precision"
              defaultValue={filters.precision}
              className="min-h-12 w-full rounded-2xl border border-[#bedbd5] bg-white px-4 outline-none focus:border-action-blue"
            >
              <option value="all">All time precision</option>
              <option value="exact">Exact</option>
              <option value="date_only">Date-only</option>
            </select>
          </label>
          <label>
            <span className="sr-only">State</span>
            <select
              name="state"
              defaultValue={filters.state}
              className="min-h-12 w-full rounded-2xl border border-[#bedbd5] bg-white px-4 outline-none focus:border-action-blue"
            >
              <option value="">All states</option>
              {US_STATES.map((state) => (
                <option key={state.code} value={state.code}>
                  {state.code} — {state.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="min-h-12 rounded-full bg-ink px-6 font-semibold text-white md:col-span-2 xl:col-span-1"
          >
            Apply
          </button>
        </div>
        {hasFilters ? (
          <Link
            href="/admin/visits"
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-action-blue hover:bg-[#edf4f0]"
          >
            <FilterX size={17} aria-hidden /> Clear filters
          </Link>
        ) : null}
      </form>

      {result.visits.length ? (
        <section aria-label="Visit results" className="mt-6 grid gap-4 lg:grid-cols-2">
          {result.visits.map((visit) => (
            <article
              key={visit.id}
              className="rounded-[24px] border border-[#d5e6df] bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold">{visit.stationName}</h2>
                  <p className="mt-1 text-sm text-[#67817e]">
                    {visit.city}, {visit.state}
                  </p>
                </div>
                <PublicBadge isPublic={visit.isPublic} />
              </div>
              <p className="mt-4 text-[15px] font-medium">
                <VisitTime
                  checkedInAt={visit.checkedInAt}
                  timezone={visit.checkedInTimezone}
                  precision={visit.checkedInTimePrecision}
                />
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#67817e]">
                <span className="rounded-full bg-[#edf4f0] px-2.5 py-1">
                  {visit.checkedInTimePrecision === "exact" ? "Exact time" : "Date only"}
                </span>
                <span className="rounded-full bg-[#edf4f0] px-2.5 py-1">
                  GPS {visit.hasGps ? "recorded" : "not recorded"}
                </span>
              </div>
              <div className="mt-4 flex items-end justify-between gap-4 border-t border-[#e2ece8] pt-4">
                <p className="text-sm text-[#67817e]">
                  {visit.energyKwh?.toFixed(1) ?? "—"} kWh · ${visit.costUsd?.toFixed(2) ?? "—"}
                </p>
                <Link
                  href={`/admin/visits/${visit.id}` as Route}
                  className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-action-blue hover:bg-[#edf4f0]"
                >
                  View Details <ChevronRight size={17} aria-hidden />
                </Link>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="mt-6 rounded-[26px] border border-dashed border-[#bedbd5] bg-white px-6 py-14 text-center">
          <MapPin size={28} aria-hidden className="mx-auto text-action-blue" />
          <h2 className="mt-4 text-xl font-semibold">No visits found</h2>
          <p className="mt-2 text-sm text-[#67817e]">
            {hasFilters ? "Clear or change the filters to see more records." : "Create your first check-in to get started."}
          </p>
        </section>
      )}

      {result.pageCount > 1 ? (
        <nav aria-label="Visit pagination" className="mt-7 flex items-center justify-between gap-4">
          {result.page > 1 ? (
            <Link
              href={pageHref(filters, result.page - 1)}
              className="inline-flex min-h-12 items-center gap-1 rounded-full border border-[#bedbd5] bg-white px-5 font-semibold"
            >
              <ChevronLeft size={18} aria-hidden /> Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-[#67817e]">
            Page {Math.min(result.page, result.pageCount)} of {result.pageCount}
          </span>
          {result.page < result.pageCount ? (
            <Link
              href={pageHref(filters, result.page + 1)}
              className="inline-flex min-h-12 items-center gap-1 rounded-full border border-[#bedbd5] bg-white px-5 font-semibold"
            >
              Next <ChevronRight size={18} aria-hidden />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </main>
  );
}
