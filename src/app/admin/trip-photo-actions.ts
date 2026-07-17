"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { isUuid } from "@/lib/admin/validation";
import {
  MAX_PHOTO_CAPTION_LENGTH,
  TRIP_PHOTO_BUCKET,
  extensionForPhotoMime,
  type SupportedPhotoMime,
} from "@/lib/photos/constants";
import { createClient } from "@/lib/supabase/server";
import type { ExifTakenAtCandidate } from "@/types/photos";

export interface TripPhotoActionState {
  ok: boolean;
  tripPlanId?: string;
  photoId?: string;
  bucketName?: typeof TRIP_PHOTO_BUCKET;
  storagePath?: string;
  warning?: string;
  error?: string;
}

export interface CreateTripPhotoInput {
  tripPlanId: string;
  photoId: string;
  storagePath: string;
  caption: string;
  isPublic: boolean;
  takenAtCandidate: ExifTakenAtCandidate | null;
  mimeType: SupportedPhotoMime;
  fileSizeBytes: number;
  width: number;
  height: number;
}

function isSupportedMime(value: string): value is SupportedPhotoMime {
  return value === "image/jpeg" || value === "image/png" || value === "image/webp";
}

function refreshTripPhotoPaths(tripPlanId: string, photoId?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/trips");
  revalidatePath(`/admin/trips/${tripPlanId}`);
  revalidatePath(`/admin/trips/${tripPlanId}/photos`);
  if (photoId) revalidatePath(`/api/admin/trip-photos/${photoId}`);
}

function resolveOffsetExif(candidate: ExifTakenAtCandidate | null) {
  if (!candidate || candidate.offsetMinutes === null) {
    return { takenAt: null, warning: candidate ? "This photo has no timezone offset, so its EXIF time was not saved." : undefined };
  }
  const match = candidate.localDateTime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  if (!match || !Number.isInteger(candidate.offsetMinutes) || Math.abs(candidate.offsetMinutes) > 14 * 60) {
    return { takenAt: null, warning: "This photo's EXIF time was invalid and was not saved." };
  }
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second) - candidate.offsetMinutes * 60_000;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime()) || date.getTime() < Date.UTC(2000, 0, 1) || date.getTime() > Date.now() + 172_800_000) {
    return { takenAt: null, warning: "This photo's EXIF time was outside the supported range and was not saved." };
  }
  return { takenAt: date.toISOString(), warning: undefined };
}

export async function prepareTripPhotoUploadAction(
  tripPlanId: string,
  mimeType: string,
  photoId: string,
): Promise<TripPhotoActionState> {
  const admin = await requireAdmin();
  if (!isUuid(tripPlanId) || !isUuid(photoId)) return { ok: false, error: "The Trip or photo ID is invalid." };
  if (!isSupportedMime(mimeType)) return { ok: false, error: "Only JPEG, PNG, and WebP are supported after processing." };
  const supabase = await createClient();
  const { data: trip, error } = await supabase
    .from("trip_plans")
    .select("id")
    .eq("id", tripPlanId)
    .eq("user_id", admin.id)
    .maybeSingle();
  if (error || !trip) return { ok: false, error: "The Trip no longer exists." };
  const storagePath = `${admin.id}/${tripPlanId}/${photoId}.${extensionForPhotoMime(mimeType)}`;
  return { ok: true, tripPlanId, photoId, bucketName: TRIP_PHOTO_BUCKET, storagePath };
}

export async function createTripPhotoMetadataAction(
  input: CreateTripPhotoInput,
): Promise<TripPhotoActionState> {
  const admin = await requireAdmin();
  if (!isUuid(input.tripPlanId) || !isUuid(input.photoId) || !isSupportedMime(input.mimeType)) {
    return { ok: false, error: "The Trip photo details are invalid." };
  }
  if (input.caption.length > MAX_PHOTO_CAPTION_LENGTH) return { ok: false, error: "Caption must be 1,000 characters or fewer." };
  if (!Number.isInteger(input.fileSizeBytes) || input.fileSizeBytes <= 0 ||
      !Number.isInteger(input.width) || input.width <= 0 || !Number.isInteger(input.height) || input.height <= 0) {
    return { ok: false, error: "The processed photo dimensions or size are invalid." };
  }
  const expectedPath = `${admin.id}/${input.tripPlanId}/${input.photoId}.${extensionForPhotoMime(input.mimeType)}`;
  if (input.storagePath !== expectedPath) return { ok: false, error: "The Trip photo Storage path is invalid." };

  const supabase = await createClient();
  const { data: trip, error: tripError } = await supabase
    .from("trip_plans")
    .select("id")
    .eq("id", input.tripPlanId)
    .eq("user_id", admin.id)
    .maybeSingle();
  if (tripError || !trip) {
    await supabase.storage.from(TRIP_PHOTO_BUCKET).remove([input.storagePath]);
    return { ok: false, error: "The Trip no longer exists; the uploaded object was removed." };
  }

  const { data: lastPhoto } = await supabase
    .from("trip_photos")
    .select("display_order")
    .eq("trip_plan_id", input.tripPlanId)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const capture = resolveOffsetExif(input.takenAtCandidate);
  const { error } = await supabase.from("trip_photos").insert({
    id: input.photoId,
    trip_plan_id: input.tripPlanId,
    user_id: admin.id,
    bucket_name: TRIP_PHOTO_BUCKET,
    storage_path: input.storagePath,
    caption: input.caption.trim() || null,
    is_public: input.isPublic,
    taken_at: capture.takenAt,
    mime_type: input.mimeType,
    file_size_bytes: input.fileSizeBytes,
    width: input.width,
    height: input.height,
    display_order: (lastPhoto?.display_order ?? -1) + 1,
    is_cover: false,
  });
  if (error) {
    const cleanup = await supabase.storage.from(TRIP_PHOTO_BUCKET).remove([input.storagePath]);
    return {
      ok: false,
      error: cleanup.error
        ? `Photo metadata could not be saved and Storage cleanup failed. Record photo ID ${input.photoId}.`
        : "Photo metadata could not be saved; the uploaded object was removed.",
    };
  }
  refreshTripPhotoPaths(input.tripPlanId, input.photoId);
  return { ok: true, tripPlanId: input.tripPlanId, photoId: input.photoId, warning: capture.warning };
}

export async function deleteTripPhotoAction(photoId: string): Promise<TripPhotoActionState> {
  await requireAdmin();
  if (!isUuid(photoId)) return { ok: false, error: "The photo ID is invalid." };
  const supabase = await createClient();
  const { data: photo, error: queryError } = await supabase
    .from("trip_photos")
    .select("id,trip_plan_id,bucket_name,storage_path")
    .eq("id", photoId)
    .maybeSingle();
  if (queryError || !photo || photo.bucket_name !== TRIP_PHOTO_BUCKET) return { ok: false, error: "The photo no longer exists." };
  const removal = await supabase.storage.from(TRIP_PHOTO_BUCKET).remove([photo.storage_path]);
  if (removal.error) return { ok: false, error: "Storage deletion failed. The photo record was kept so you can retry." };
  const { error } = await supabase.from("trip_photos").delete().eq("id", photoId);
  if (error) return { ok: false, error: `Storage was deleted but metadata cleanup failed for photo ${photoId}.` };
  refreshTripPhotoPaths(photo.trip_plan_id, photoId);
  return { ok: true, tripPlanId: photo.trip_plan_id, photoId };
}
