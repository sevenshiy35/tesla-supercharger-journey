import type { Route } from "next";
import { ArrowLeft, Check, Images } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TripDraftManager } from "@/components/admin/TripDraftManager";
import { TripNameEditor } from "@/components/admin/TripNameEditor";
import { TripRoutePlanner } from "@/components/admin/TripRoutePlanner";
import { requireAdmin } from "@/lib/auth/admin";
import { formatTripStatus, formatTripType, formatTripUpdatedAt } from "@/lib/trips/format";
import { getAdminSuggestedTripStops, getAdminTripPlan, getAdminTripPlanSegments, getAdminTripPlanStops } from "@/lib/trips/repository";
import type { TripRoutePlannerPlan } from "@/lib/trips/types";
import { tripPlanIdSchema } from "@/lib/trips/validation";

interface TripDetailPageProps { params: Promise<{ id: string }> }
const steps = ["Route basics", "Select stations", "Optimize route", "Review"] as const;

export default async function TripDetailPage({ params }: TripDetailPageProps) {
  await requireAdmin();
  const { id } = await params;
  if (!tripPlanIdSchema.safeParse(id).success) notFound();
  const [plan, stops, segments, suggestedStops] = await Promise.all([getAdminTripPlan(id), getAdminTripPlanStops(id), getAdminTripPlanSegments(id), getAdminSuggestedTripStops(id)]);
  if (!plan) notFound();
  const { userId: _privateOwnerId, ...safePlan } = plan;
  void _privateOwnerId;
  const plannerPlan: TripRoutePlannerPlan = safePlan;
  const routeCalculated = plan.routeCalculatedAt !== null;
  const hasPlannedStops = stops.length > 0;
  const plannedRouteCurrent = routeCalculated
    && hasPlannedStops
    && !plan.plannedRouteStale
    && plan.plannedDistanceMeters !== null
    && plan.plannedDriveSeconds !== null
    && plan.plannedStopSeconds !== null;
  const isDraft = plan.status === "draft";
  const planName = plan.name ?? "Untitled Trip";
  const confirmationBlocker = !plan.name
    ? "Add a Trip name before confirming."
    : !plannedRouteCurrent
      ? "Finish selecting Stations and optimize the current route before confirming."
      : null;

  return <main>
    <Link href="/admin/trips" className="inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold text-action-blue"><ArrowLeft size={18} aria-hidden />Back to Trip Plans</Link>
    <header className="mt-4">
      <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#edf4f0] px-2.5 py-1 text-xs font-semibold text-[#486d69]">{formatTripStatus(plan.status)}</span><span className="rounded-full bg-[#f7f0d8] px-2.5 py-1 text-xs font-semibold text-[#725d30]">{formatTripType(plan.tripType)}</span></div>
      <TripNameEditor tripPlanId={plan.id} initialName={plan.name} />
      <p className="mt-3 text-sm text-[#67817e]">Last updated {formatTripUpdatedAt(plan.updatedAt)}</p>
      <Link href={`/admin/trips/${plan.id}/photos` as Route} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#bedbd5] bg-white px-4 text-sm font-semibold shadow-sm">
        <Images size={17} aria-hidden /> Trip photos
      </Link>
    </header>

    <ol aria-label="Trip planning progress" className="mt-8 grid grid-cols-4 gap-1 rounded-[24px] border border-[#d5e6df] bg-white p-2 shadow-sm sm:gap-2 sm:p-3">
      {steps.map((step, index) => {
        const complete = (index === 0 && routeCalculated) || (index === 1 && hasPlannedStops) || (index === 2 && plannedRouteCurrent) || (index === 3 && !isDraft && plannedRouteCurrent);
        const current = isDraft && ((index === 0 && !routeCalculated) || (index === 1 && routeCalculated && !hasPlannedStops) || (index === 2 && hasPlannedStops && !plannedRouteCurrent) || (index === 3 && plannedRouteCurrent));
        const disabled = (index === 1 && !routeCalculated) || (index === 2 && !hasPlannedStops) || (index === 3 && !plannedRouteCurrent);
        return <li key={step} aria-current={current ? "step" : undefined} data-disabled={disabled || undefined} className={`rounded-[18px] px-1 py-3 text-center ${complete ? "bg-[#e7f5ef]" : current ? "bg-ink text-white" : "text-[#9aa9a7]"}`}>
          <span className="mx-auto flex size-6 items-center justify-center rounded-full border border-current">{complete ? <Check size={14} aria-hidden /> : <span className="text-[11px] font-semibold">{index + 1}</span>}</span>
          <span className="mt-1.5 block text-[10px] font-semibold leading-3 sm:text-xs">{step}</span>
        </li>;
      })}
    </ol>

    <TripDraftManager
      tripPlanId={plan.id}
      planName={planName}
      isDraft={isDraft}
      status={plan.status}
      routeInputRevision={plan.routeInputRevision}
      confirmationBlocker={confirmationBlocker}
    />

    <TripRoutePlanner key={plan.routeInputRevision} plan={plannerPlan} persistedSegments={segments} initialSuggestedStops={suggestedStops} />
  </main>;
}
