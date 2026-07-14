"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import {
  getNearbyAdminStations,
  getSelectedAdminStation,
  searchAdminStations,
} from "@/lib/admin/data";
import { validateCheckInInput, validateCoordinates, isUuid } from "@/lib/admin/validation";
import { createClient } from "@/lib/supabase/server";
import { VISIT_PHOTO_BUCKET } from "@/lib/photos/constants";
import type { AdminStationResult, SelectedAdminStation } from "@/types/admin";

interface StationResultsState {
  ok: boolean;
  stations?: AdminStationResult[];
  error?: string;
}

interface SelectedStationState {
  ok: boolean;
  station?: SelectedAdminStation;
  error?: string;
}

export interface CreateVisitInput {
  visitId: string;
  stationId: string;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  notes: string;
  isPublic: boolean;
}

export interface VisitMutationState {
  ok: boolean;
  visitId?: string;
  checkedInAt?: string;
  checkedInTimezone?: string;
  isPublic?: boolean;
  error?: string;
}

function safeMutationError(message: string, fallback: string) {
  if (/manual repair/i.test(message)) return "Photo metadata changed during deletion. Some Storage objects may need manual repair.";
  if (/not found|does not exist/i.test(message)) return "The visit or station no longer exists.";
  if (/conflict/i.test(message)) return "This check-in request conflicts with an existing visit.";
  if (/administrator|authentication/i.test(message)) return "Your administrator session has expired.";
  if (/2,?000 characters/i.test(message)) return "Notes must be 2,000 characters or fewer.";
  return fallback;
}

function refreshVisitPaths(visitId?: string) {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/check-in");
  revalidatePath("/admin/visits");
  if (visitId) revalidatePath(`/admin/visits/${visitId}`);
}

export async function searchStationsAction(query: string): Promise<StationResultsState> {
  await requireAdmin();
  if (query.trim().length < 2) return { ok: true, stations: [] };

  try {
    return { ok: true, stations: await searchAdminStations(query) };
  } catch {
    return { ok: false, error: "Station search is temporarily unavailable. Please try again." };
  }
}

export async function nearbyStationsAction(
  latitude: number,
  longitude: number,
): Promise<StationResultsState> {
  await requireAdmin();
  const coordinateError = validateCoordinates(latitude, longitude);
  if (coordinateError) return { ok: false, error: coordinateError };

  try {
    return { ok: true, stations: await getNearbyAdminStations(latitude, longitude) };
  } catch {
    return { ok: false, error: "Nearby stations are temporarily unavailable. Try Search instead." };
  }
}

export async function selectStationAction(
  stationId: string,
  coordinates?: { latitude: number; longitude: number },
): Promise<SelectedStationState> {
  await requireAdmin();
  if (!isUuid(stationId)) return { ok: false, error: "Select a valid station." };
  if (coordinates) {
    const coordinateError = validateCoordinates(coordinates.latitude, coordinates.longitude);
    if (coordinateError) return { ok: false, error: coordinateError };
  }

  try {
    const station = await getSelectedAdminStation(stationId, coordinates);
    return station
      ? { ok: true, station }
      : { ok: false, error: "The selected station no longer exists." };
  } catch {
    return { ok: false, error: "The selected station could not be loaded." };
  }
}

export async function createStationVisitAction(
  input: CreateVisitInput,
): Promise<VisitMutationState> {
  await requireAdmin();
  const validationError = validateCheckInInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_create_station_visit", {
    p_visit_id: input.visitId,
    p_station_id: input.stationId,
    p_checked_in_timezone: input.timezone.trim(),
    p_recorded_latitude: input.latitude,
    p_recorded_longitude: input.longitude,
    p_notes: input.notes || null,
    p_is_public: input.isPublic,
  });

  if (error || !data?.[0]) {
    return {
      ok: false,
      error: safeMutationError(error?.message ?? "", "Check-in failed. Your details were kept; please try again."),
    };
  }

  const visit = data[0];
  refreshVisitPaths(visit.visit_id);
  return {
    ok: true,
    visitId: visit.visit_id,
    checkedInAt: visit.checked_in_at,
    checkedInTimezone: visit.checked_in_timezone,
    isPublic: visit.is_public,
  };
}

export async function updateStationVisitAction(
  visitId: string,
  notes: string,
  isPublic: boolean,
): Promise<VisitMutationState> {
  await requireAdmin();
  if (!isUuid(visitId)) return { ok: false, error: "The visit ID is invalid." };
  if (notes.length > 2_000) return { ok: false, error: "Notes must be 2,000 characters or fewer." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_update_station_visit", {
    p_visit_id: visitId,
    p_notes: notes || null,
    p_is_public: isPublic,
  });

  if (error || !data?.[0]) {
    return {
      ok: false,
      error: safeMutationError(error?.message ?? "", "Changes could not be saved. Please try again."),
    };
  }

  refreshVisitPaths(visitId);
  return { ok: true, visitId, isPublic: data[0].is_public };
}

export async function deleteStationVisitAction(visitId: string): Promise<VisitMutationState> {
  await requireAdmin();
  if (!isUuid(visitId)) return { ok: false, error: "The visit ID is invalid." };

  const supabase = await createClient();
  const { data: photos, error: photoQueryError } = await supabase
    .from("visit_photos")
    .select("id,bucket_name,storage_path")
    .eq("visit_id", visitId)
    .order("id", { ascending: true });

  if (photoQueryError) {
    return { ok: false, error: "Visit photos could not be checked, so nothing was deleted." };
  }
  if ((photos ?? []).some((photo) => photo.bucket_name !== VISIT_PHOTO_BUCKET)) {
    return { ok: false, error: "This Visit contains unmanaged photo metadata. Nothing was deleted." };
  }
  if ((photos?.length ?? 0) > 0) {
    const removal = await supabase.storage
      .from(VISIT_PHOTO_BUCKET)
      .remove((photos ?? []).map((photo) => photo.storage_path));
    if (removal.error) {
      return { ok: false, error: "Photo Storage cleanup failed. The Visit and all Metadata were kept so you can retry." };
    }
  }
  const { data, error } = await supabase.rpc("admin_delete_station_visit", {
    p_visit_id: visitId,
    p_deleted_photo_ids: (photos ?? []).map((photo) => photo.id),
  });

  if (error || !data?.[0]) {
    return {
      ok: false,
      error: (photos?.length ?? 0) > 0
        ? `Photo Storage objects were deleted, but database cleanup failed. Manual repair may be required for Visit ${visitId}.`
        : safeMutationError(error?.message ?? "", "The visit could not be deleted."),
    };
  }

  refreshVisitPaths();
  return { ok: true, visitId };
}
