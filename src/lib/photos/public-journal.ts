import "server-only";

import { z } from "zod";
import { createPublicClient } from "@/lib/supabase/public";
import type { PublicPhotoJournalItem } from "@/types/photo-journal";

const photoSchema = z.object({
  id: z.string().uuid(),
  visit_id: z.string().uuid(),
  caption: z.string().nullable(),
  taken_at: z.string().nullable(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  is_cover: z.boolean(),
  display_order: z.number().int().nonnegative(),
  created_at: z.string(),
});

const visitSchema = z.object({
  id: z.string().uuid(),
  checked_in_at: z.string(),
  station: z.object({
    name: z.string().min(1),
    city: z.string().min(1),
    state: z.string().regex(/^[A-Z]{2}$/),
  }),
});

const editorialPhotoPreview: PublicPhotoJournalItem[] = [
  { id: "41111111-1111-4111-8111-111111111111", visitId: "51111111-1111-4111-8111-111111111111", url: "/images/cinematic-road-trip/new-york-blue-hour.webp", alt: "New York skyline in blue hour light", caption: "Blue hour, before the next stretch of road.", takenAt: "2026-07-15T00:45:00.000Z", checkedInAt: "2026-07-15T00:45:00.000Z", stationName: "Jersey City, NJ", city: "Jersey City", state: "NJ", width: 1672, height: 941, isCover: true },
  { id: "41111111-1111-4111-8111-111111111112", visitId: "51111111-1111-4111-8111-111111111112", url: "/images/hero/monument-valley-stop-sign.webp", alt: "A roadside stop in Monument Valley", caption: "The road keeps its own sense of time.", takenAt: "2026-06-22T18:20:00.000Z", checkedInAt: "2026-06-22T18:20:00.000Z", stationName: "Kayenta, AZ", city: "Kayenta", state: "AZ", width: 2400, height: 1600, isCover: true },
  { id: "41111111-1111-4111-8111-111111111113", visitId: "51111111-1111-4111-8111-111111111113", url: "/images/cinematic-road-trip/new-york-bridge-mobile.webp", alt: "A New York bridge framed vertically at dusk", caption: "Crossing into the city at dusk.", takenAt: "2026-07-14T23:20:00.000Z", checkedInAt: "2026-07-14T23:20:00.000Z", stationName: "New York, NY", city: "New York", state: "NY", width: 780, height: 1000, isCover: true },
  { id: "41111111-1111-4111-8111-111111111114", visitId: "51111111-1111-4111-8111-111111111114", url: "/images/cinematic-road-trip/california-golden-gate.webp", alt: "Golden Gate Bridge in warm coastal light", caption: "Pacific light at the edge of the continent.", takenAt: "2026-05-18T02:10:00.000Z", checkedInAt: "2026-05-18T02:10:00.000Z", stationName: "San Francisco, CA", city: "San Francisco", state: "CA", width: 1672, height: 941, isCover: true },
  { id: "41111111-1111-4111-8111-111111111115", visitId: "51111111-1111-4111-8111-111111111115", url: "/images/cinematic-road-trip/model-y-coast.webp", alt: "Tesla Model Y traveling along a coastal road", caption: "A quiet coastal mile between charging stops.", takenAt: "2026-05-17T20:40:00.000Z", checkedInAt: "2026-05-17T20:40:00.000Z", stationName: "Santa Monica, CA", city: "Santa Monica", state: "CA", width: 960, height: 403, isCover: true },
  { id: "41111111-1111-4111-8111-111111111116", visitId: "51111111-1111-4111-8111-111111111116", url: "/images/cinematic-road-trip/utah-desert-canyon.webp", alt: "Utah desert canyon under warm evening light", caption: "Desert miles and a horizon that never seems to end.", takenAt: "2026-06-18T01:30:00.000Z", checkedInAt: "2026-06-18T01:30:00.000Z", stationName: "Moab, UT", city: "Moab", state: "UT", width: 1672, height: 941, isCover: true },
];

export async function getPublicPhotoJournal(limit = 72): Promise<PublicPhotoJournalItem[]> {
  const boundedLimit = Math.min(120, Math.max(1, Math.floor(limit)));
  if (process.env.PUBLIC_TRIP_PREVIEW === "editorial-roadbook") {
    return editorialPhotoPreview.slice(0, boundedLimit);
  }
  const client = await createPublicClient();
  const { data: photoRows, error: photoError } = await client
    .from("public_visit_photos")
    .select("id,visit_id,caption,taken_at,width,height,is_cover,display_order,created_at")
    .order("taken_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(boundedLimit);

  const migrationPending = photoError?.code === "PGRST205" || photoError?.code === "42P01";
  if (migrationPending) return [];
  if (photoError) throw new Error("The public photo journal could not be loaded.");

  const photos = (photoRows ?? []).flatMap((row) => {
    const parsed = photoSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
  const visitIds = [...new Set(photos.map((photo) => photo.visit_id))];
  if (visitIds.length === 0) return [];

  const { data: visitRows, error: visitError } = await client
    .from("station_visits")
    .select("id,checked_in_at,station:stations!station_visits_station_id_fkey(name,city,state)")
    .eq("is_public", true)
    .in("id", visitIds);
  if (visitError) throw new Error("Photo locations could not be loaded.");

  const visits = new Map<string, z.infer<typeof visitSchema>>();
  for (const row of visitRows ?? []) {
    const parsed = visitSchema.safeParse(row);
    if (parsed.success) visits.set(parsed.data.id, parsed.data);
  }

  return photos.flatMap((photo) => {
    const visit = visits.get(photo.visit_id);
    if (!visit) return [];
    return [{
      id: photo.id,
      visitId: photo.visit_id,
      url: `/api/public/photos/${photo.id}`,
      alt: photo.caption?.trim() || `Tesla Supercharger journey photo at ${visit.station.name}`,
      caption: photo.caption,
      takenAt: photo.taken_at,
      checkedInAt: visit.checked_in_at,
      stationName: visit.station.name,
      city: visit.station.city,
      state: visit.station.state,
      width: photo.width,
      height: photo.height,
      isCover: photo.is_cover,
    } satisfies PublicPhotoJournalItem];
  });
}
