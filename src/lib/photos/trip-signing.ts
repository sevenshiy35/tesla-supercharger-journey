import "server-only";

import { requireAdmin } from "@/lib/auth/admin";
import { isUuid } from "@/lib/admin/validation";
import { createClient } from "@/lib/supabase/server";
import { TRIP_PHOTO_BUCKET, VISIT_PHOTO_SIGNED_URL_SECONDS } from "./constants";

export async function getAdminTripPhotoUrl(photoId: string) {
  await requireAdmin();
  if (!isUuid(photoId)) return null;
  const supabase = await createClient();
  const { data: photo, error: photoError } = await supabase
    .from("trip_photos")
    .select("bucket_name,storage_path")
    .eq("id", photoId)
    .maybeSingle();
  if (photoError || !photo || photo.bucket_name !== TRIP_PHOTO_BUCKET) return null;
  const { data, error } = await supabase.storage
    .from(TRIP_PHOTO_BUCKET)
    .createSignedUrl(photo.storage_path, VISIT_PHOTO_SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
