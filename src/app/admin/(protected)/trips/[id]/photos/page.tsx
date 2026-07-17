import { ArrowLeft, Route as RouteIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TripPhotoManager } from "@/components/admin/TripPhotoManager";
import { requireAdmin } from "@/lib/auth/admin";
import { getAdminTripPhotos } from "@/lib/photos/trip-data";
import { getAdminTripPlan } from "@/lib/trips/repository";
import { tripPlanIdSchema } from "@/lib/trips/validation";

export default async function TripPhotosPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!tripPlanIdSchema.safeParse(id).success) notFound();
  const [trip, photos] = await Promise.all([getAdminTripPlan(id), getAdminTripPhotos(id)]);
  if (!trip) notFound();

  return (
    <main>
      <Link href={`/admin/trips/${trip.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold text-action-blue">
        <ArrowLeft size={18} aria-hidden /> Back to Trip
      </Link>
      <header className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-action-blue"><RouteIcon size={17} aria-hidden /> Trip photos</p>
          <h1 className="mt-3 text-[40px] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-[54px]">{trip.name ?? "Untitled Trip"}</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-[#486d69]">
            {[trip.originLabel, trip.destinationLabel].filter(Boolean).join(" → ") || "Travel photo library"}
          </p>
        </div>
      </header>
      <TripPhotoManager tripPlanId={trip.id} tripIsPublic={trip.isPublic} initialPhotos={photos} />
    </main>
  );
}
