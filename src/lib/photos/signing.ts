import "server-only";

import { requireAdmin } from "@/lib/auth/admin";
import { isUuid } from "@/lib/admin/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { VISIT_PHOTO_BUCKET, VISIT_PHOTO_SIGNED_URL_SECONDS } from "./constants";

/** Validate both public flags before privileged Storage signing. */
export async function getPublicVisitPhotoUrl(photoId: string) {
  if (!isUuid(photoId)) return null;
  const adminClient = createSupabaseAdminClient();
  const { data: photo, error: photoError } = await adminClient
    .from("visit_photos")
    .select("bucket_name,storage_path,visit_id,is_public")
    .eq("id", photoId)
    .eq("is_public", true)
    .maybeSingle();
  if (photoError || !photo || photo.bucket_name !== VISIT_PHOTO_BUCKET) return null;

  const { data: visit, error: visitError } = await adminClient
    .from("station_visits")
    .select("id,is_public")
    .eq("id", photo.visit_id)
    .eq("is_public", true)
    .maybeSingle();
  if (visitError || !visit) return null;

  const { data, error } = await adminClient.storage
    .from(VISIT_PHOTO_BUCKET)
    .createSignedUrl(photo.storage_path, VISIT_PHOTO_SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
/** Admin image route: Cookie Session + allowlist + Storage RLS. */
export async function getAdminVisitPhotoUrl(photoId: string) {
  await requireAdmin();
  if (!isUuid(photoId)) return null;
  const supabase = await createClient();
  const { data: photo, error: photoError } = await supabase
    .from("visit_photos")
    .select("bucket_name,storage_path")
    .eq("id", photoId)
    .maybeSingle();
  if (photoError || !photo || photo.bucket_name !== VISIT_PHOTO_BUCKET) return null;
  const { data, error } = await supabase.storage
    .from(VISIT_PHOTO_BUCKET)
    .createSignedUrl(photo.storage_path, VISIT_PHOTO_SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
