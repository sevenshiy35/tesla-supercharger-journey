import type { Route } from "next";
import { ArrowRight, Map, MapPinCheck } from "lucide-react";
import Link from "next/link";
import { PublicBadge } from "@/components/admin/PublicBadge";
import { VisitTime } from "@/components/admin/VisitTime";
import { getAdminDashboardData } from "@/lib/admin/data";

export default async function AdminDashboardPage() {
  const dashboard = await getAdminDashboardData();
  const metrics = [
    ["Visited stations", dashboard.visitedStations],
    ["Total visits", dashboard.totalVisits],
    ["Public visits", dashboard.publicVisits],
    ["Private visits", dashboard.privateVisits],
    ["2026 visits", dashboard.visits2026],
  ] as const;

  return (
    <main>
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-action-blue">Journey Admin</p>
          <h1 className="mt-2 text-[42px] font-semibold leading-none tracking-[-0.04em] sm:text-[54px]">
            Dashboard
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-[#486d69]">
            A quick view of your Supercharger journey and the fastest path to a new check-in.
          </p>
        </div>
        <Link
          href="/admin/check-in"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 font-semibold text-white shadow-sm transition hover:bg-[#215a55]"
        >
          <MapPinCheck size={19} aria-hidden />
          Quick Check In
        </Link>
      </header>

      <section aria-label="Journey statistics" className="mt-9 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {metrics.map(([label, value], index) => (
          <article
            key={label}
            className={`rounded-[24px] border border-[#d5e6df] bg-white p-5 shadow-sm ${
              index === metrics.length - 1 ? "col-span-2 lg:col-span-1" : ""
            }`}
          >
            <p className="text-[32px] font-semibold leading-none tracking-[-0.03em]">{value}</p>
            <p className="mt-2 text-sm text-[#67817e]">{label}</p>
          </article>
        ))}
      </section>

      <section className="mt-9 rounded-[28px] border border-[#d5e6df] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.025em]">Latest check-ins</h2>
            <p className="mt-1 text-sm text-[#67817e]">Your five most recent Visit records.</p>
          </div>
          <Link href="/admin/visits" className="text-sm font-semibold text-action-blue hover:underline">
            View all
          </Link>
        </div>

        {dashboard.recentVisits.length ? (
          <div className="mt-5 divide-y divide-[#e2ece8]">
            {dashboard.recentVisits.map((visit) => (
              <Link
                key={visit.id}
                href={`/admin/visits/${visit.id}` as Route}
                className="flex min-h-[76px] items-center justify-between gap-4 py-4 transition hover:pl-1"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{visit.stationName}</p>
                  <p className="mt-1 text-sm text-[#67817e]">
                    {visit.city}, {visit.state} ·{" "}
                    <VisitTime
                      checkedInAt={visit.checkedInAt}
                      timezone={visit.checkedInTimezone}
                      precision={visit.checkedInTimePrecision}
                    />
                  </p>
                  {visit.energyKwh !== null || visit.costUsd !== null ? (
                    <p className="mt-1 text-xs text-[#67817e]">
                      {visit.energyKwh?.toFixed(1) ?? "—"} kWh · ${visit.costUsd?.toFixed(2) ?? "—"}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <PublicBadge isPublic={visit.isPublic} />
                  <ArrowRight size={18} aria-hidden className="text-[#67817e]" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl bg-[#f7f5e9] px-5 py-8 text-center">
            <p className="font-semibold">No visits yet</p>
            <p className="mt-1 text-sm text-[#67817e]">Your first mobile check-in will appear here.</p>
          </div>
        )}
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2">
        <Link
          href="/admin/visits"
          className="flex min-h-16 items-center justify-between rounded-[22px] border border-[#d5e6df] bg-white px-5 font-semibold shadow-sm"
        >
          View Visits <ArrowRight size={19} aria-hidden />
        </Link>
        <Link
          href="/"
          className="flex min-h-16 items-center justify-between rounded-[22px] border border-[#d5e6df] bg-white px-5 font-semibold shadow-sm"
        >
          View Public Map <Map size={19} aria-hidden />
        </Link>
      </section>
    </main>
  );
}
