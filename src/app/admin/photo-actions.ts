"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { isUuid } from "@/lib/admin/validation";
import {
  MAX_PHOTO_CAPTION_LENGTH,
  MAX_VISIT_PHOTOS,
  VISIT_PHOTO_BUCKET,
  extensionForPhotoMime,
  isVisitPhotoType,
  type SupportedPhotoMime,
  type VisitPhotoType,
} from "@/lib/photos/constants";
import { resolveExifTakenAt } from "@/lib/photos/time";
import { createClient } from "@/lib/supabase/server";
import type { ExifTakenAtCandidate } from "@/types/photos";

export interface PhotoActionState {
  ok: boolean;
  photoId?: string;
  visitId?: string;
  warning?: string;
  error?: string;
}

export interface PreparedUploadState extends PhotoActionState {
  bucketName?: typeof VISIT_PHOTO_BUCKET;
  storagePath?: string;
}

export interface CreatePhotoMetadataInput {
  photoId: string;
  visitId: string;
  bucketName: string;
  storagePath: string;
  photoType: VisitPhotoType;
  caption: string;
  isPublic: boolean;
  takenAtCandidate: ExifTakenAtCandidate | null;
  mimeType: SupportedPhotoMime;
  fileSizeBytes: number;
  width: number;
  height: number;
}

function refreshPhotoPaths(visitId: string, photoId?: string) {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/visits");
  revalidatePath(`/admin/visits/${visitId}`);
  revalidatePath(`/visits/${visitId}`);
  if (photoId) {
    revalidatePath(`/api/public/photos/${photoId}`);
    revalidatePath(`/api/admin/photos/${photoId}`);
  }
}

function isSupportedMime(value: string): value is SupportedPhotoMime {
  return value === "image/jpeg" || value === "image/png" || value === "image/webp";
}

function safePhotoError(message: string, fallback: string) {
  if (/1,000 characters/i.test(message)) return "Caption must be 1,000 characters or fewer.";
  if (/photo type|mime type|storage path|dimensions|file size/i.test(message)) return "The processed photo details were rejected.";
  if (/conflict/i.test(message)) return "This photo upload ID conflicts with another object.";
  if (/not found/i.test(message)) return "The Visit or photo no longer exists.";
  if (/administrator|authentication/i.test(message)) return "Your administrator session has expired.";
  return fallback;
}

export async function prepareVisitPhotoUploadAction(
  visitId: string,
  mimeType: string,
  photoId: string,
): Promise<PreparedUploadState> {
  const admin = await requireAdmin();
  if (!isUuid(visitId) || !isUuid(photoId)) return { ok: false, error: "The Visit or photo ID is invalid." };
  if (!isSupportedMime(mimeType)) return { ok: false, error: "Only JPEG, PNG, and WebP are supported." };
  const supabase = await createClient();
  const visitResult = await supabase.from("station_visits").select("id").eq("id", visitId).maybeSingle();
  if (visitResult.error || !visitResult.data) return { ok: false, error: "The Visit no longer exists." };
  const storagePath = `${admin.id}/${visitId}/${photoId}.${extensionForPhotoMime(mimeType)}`;
  return { ok: true, photoId, visitId, bucketName: VISIT_PHOTO_BUCKET, storagePath };
}

export async function createVisitPhotoMetadataAction(
  input: CreatePhotoMetadataInput,
): Promise<PhotoActionState> {
  const admin = await requireAdmin();
  if (!isUuid(input.photoId) || !isUuid(input.visitId)) {
    return { ok: false, error: "The photo or Visit ID is invalid." };
  }
  if (!isSupportedMime(input.mimeType) || input.bucketName !== VISIT_PHOTO_BUCKET) {
    return { ok: false, error: "The photo upload target is invalid." };
  }
  const expectedPath = `${admin.id}/${input.visitId}/${input.photoId}.${extensionForPhotoMime(input.mimeType)}`;
  if (input.storagePath !== expectedPath) return { ok: false, error: "The photo upload path is invalid." };
  if (!isVisitPhotoType(input.photoType)) return { ok: false, error: "Choose a valid photo type." };
  if (input.caption.length > MAX_PHOTO_CAPTION_LENGTH) {
    return { ok: false, error: "Caption must be 1,000 characters or fewer." };
  }
  if (!Number.isInteger(input.fileSizeBytes) || input.fileSizeBytes <= 0) {
    return { ok: false, error: "The processed image file size is invalid." };
  }
  if (
    !Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width <= 0 || input.height <= 0
  ) return { ok: false, error: "The processed photo dimensions are invalid." };

  const supabase = await createClient();
  const { data: visit, error: visitError } = await supabase
    .from("station_visits")
    .select("id,checked_in_at,checked_in_timezone")
    .eq("id", input.visitId)
    .maybeSingle();
  if (visitError || !visit) {
    await supabase.storage.from(VISIT_PHOTO_BUCKET).remove([input.storagePath]);
    return { ok: false, error: "The Visit no longer exists; the uploaded object was removed." };
  }
  const { count: existingPhotoCount, error: countError } = await supabase
    .from("visit_photos")
    .select("id", { count: "exact", head: true })
    .eq("visit_id", input.visitId);
  if (countError || (existingPhotoCount ?? 0) >= MAX_VISIT_PHOTOS) {
    await supabase.storage.from(VISIT_PHOTO_BUCKET).remove([input.storagePath]);
    return {
      ok: false,
      error: countError
        ? "The station photo count could not be verified; the uploaded object was removed."
        : `A charging-station check-in can have up to ${MAX_VISIT_PHOTOS} photos. Add other memories to the Trip gallery.`,
    };
  }
  const resolvedTime = resolveExifTakenAt(
    input.takenAtCandidate,
    visit.checked_in_timezone,
    visit.checked_in_at,
  );
  const { data, error } = await supabase.rpc("admin_create_visit_photo", {
    p_photo_id: input.photoId,
    p_visit_id: input.visitId,
    p_bucket_name: VISIT_PHOTO_BUCKET,
    p_storage_path: input.storagePath,
    p_photo_type: input.photoType,
    p_caption: input.caption || null,
    p_is_public: input.isPublic,
    p_taken_at: resolvedTime.takenAt,
    p_mime_type: input.mimeType,
    p_file_size_bytes: input.fileSizeBytes,
    p_width: input.width,
    p_height: input.height,
  });
  if (error || !data?.[0]) {
    const cleanup = await supabase.storage.from(VISIT_PHOTO_BUCKET).remove([input.storagePath]);
    return {
      ok: false,
      error: cleanup.error
        ? `${safePhotoError(error?.message ?? "", "Photo metadata could not be saved.")} The uploaded object could not be cleaned up; record this photo ID for manual orphan repair: ${input.photoId}.`
        : safePhotoError(error?.message ?? "", "Photo metadata could not be saved; the uploaded object was removed."),
    };
  }
  refreshPhotoPaths(input.visitId, input.photoId);
  return { ok: true, photoId: input.photoId, visitId: input.visitId, warning: resolvedTime.warning ?? undefined };
}

export async function updateVisitPhotoAction(
  photoId: string,
  photoType: string,
  caption: string,
  isPublic: boolean,
): Promise<PhotoActionState> {
  await requireAdmin();
  if (!isUuid(photoId)) return { ok: false, error: "The photo ID is invalid." };
  if (!isVisitPhotoType(photoType)) return { ok: false, error: "Choose a valid photo type." };
  if (caption.length > MAX_PHOTO_CAPTION_LENGTH) return { ok: false, error: "Caption must be 1,000 characters or fewer." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_update_visit_photo", {
    p_photo_id: photoId,
    p_photo_type: photoType,
    p_caption: caption || null,
    p_is_public: isPublic,
  });
  if (error || !data?.[0]) return { ok: false, error: safePhotoError(error?.message ?? "", "Photo changes could not be saved.") };
  refreshPhotoPaths(data[0].visit_id, photoId);
  return { ok: true, photoId, visitId: data[0].visit_id };
}

export async function setVisitCoverPhotoAction(visitId: string, photoId: string): Promise<PhotoActionState> {
  await requireAdmin();
  if (!isUuid(visitId) || !isUuid(photoId)) return { ok: false, error: "The photo or Visit ID is invalid." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_set_visit_cover_photo", {
    p_visit_id: visitId,
    p_photo_id: photoId,
  });
  if (error || !data?.[0]) return { ok: false, error: safePhotoError(error?.message ?? "", "The cover photo could not be changed.") };
  refreshPhotoPaths(visitId, photoId);
  return { ok: true, photoId, visitId };
}

export async function reorderVisitPhotosAction(visitId: string, photoIds: string[]): Promise<PhotoActionState> {
  await requireAdmin();
  if (!isUuid(visitId) || photoIds.some((photoId) => !isUuid(photoId)) || new Set(photoIds).size !== photoIds.length) {
    return { ok: false, error: "The requested photo order is invalid." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_reorder_visit_photos", {
    p_visit_id: visitId,
    p_photo_ids: photoIds,
  });
  if (error) return { ok: false, error: safePhotoError(error.message, "Photos could not be reordered.") };
  refreshPhotoPaths(visitId);
  return { ok: true, visitId };
}

export async function deleteVisitPhotoAction(photoId: string): Promise<PhotoActionState> {
  await requireAdmin();
  if (!isUuid(photoId)) return { ok: false, error: "The photo ID is invalid." };
  const supabase = await createClient();
  const { data: photo, error: queryError } = await supabase
    .from("visit_photos")
    .select("id,visit_id,bucket_name,storage_path")
    .eq("id", photoId)
    .maybeSingle();
  if (queryError || !photo || photo.bucket_name !== VISIT_PHOTO_BUCKET) {
    return { ok: false, error: "The photo no longer exists." };
  }
  const removal = await supabase.storage.from(VISIT_PHOTO_BUCKET).remove([photo.storage_path]);
  if (removal.error) return { ok: false, error: "Storage deletion failed. Photo metadata was kept so you can retry safely." };
  const { data, error } = await supabase.rpc("admin_delete_visit_photo", { p_photo_id: photoId });
  if (error || !data?.[0]) {
    return {
      ok: false,
      error: `The Storage object was deleted but Metadata cleanup failed. Manual repair is required for photo ID ${photoId}.`,
    };
  }
  refreshPhotoPaths(photo.visit_id, photoId);
  return { ok: true, photoId, visitId: photo.visit_id };
}
