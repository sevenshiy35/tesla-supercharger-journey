import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { AdminTripPhoto } from "@/types/photos";
import type { SupportedPhotoMime } from "./constants";

export async function getAdminTripPhotos(tripPlanId: string): Promise<AdminTripPhoto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trip_photos")
    .select("id,trip_plan_id,caption,is_public,taken_at,created_at,mime_type,file_size_bytes,width,height,display_order,is_cover")
    .eq("trip_plan_id", tripPlanId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  // Let the UI render during the short deployment window before the new
  // migration reaches PostgREST. Uploads become available as soon as the
  // trip_photos table is present.
  if (error?.code === "PGRST205") return [];
  if (error) throw new Error("Trip photos could not be loaded.");
  return (data ?? []).map((photo) => ({
    id: photo.id,
    tripPlanId: photo.trip_plan_id,
    url: `/api/admin/trip-photos/${photo.id}`,
    caption: photo.caption,
    isPublic: photo.is_public,
    takenAt: photo.taken_at,
    createdAt: photo.created_at,
    mimeType: photo.mime_type as SupportedPhotoMime,
    fileSizeBytes: photo.file_size_bytes,
    width: photo.width,
    height: photo.height,
    displayOrder: photo.display_order,
    isCover: photo.is_cover,
  }));
}
