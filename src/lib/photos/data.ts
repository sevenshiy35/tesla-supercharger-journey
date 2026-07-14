import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isVisitPhotoType, type SupportedPhotoMime } from "./constants";
import type { AdminVisitPhoto, PublicVisitDetail, PublicVisitPhoto } from "@/types/photos";

interface PublicVisitRow {
  id: string;
  station_id: string;
  checked_in_at: string;
  checked_in_timezone: string;
  checked_in_time_precision: string;
  notes: string | null;
  station: {
    name: string;
    address: string;
    city: string;
    state: string;
    postal_code: string | null;
  } | Array<{
    name: string;
    address: string;
    city: string;
    state: string;
    postal_code: string | null;
  }>;
  charging_session: {
    energy_kwh: number | null;
    cost_usd: number | null;
    charging_minutes: number | null;
    price_per_kwh: number | null;
  } | Array<{
    energy_kwh: number | null;
    cost_usd: number | null;
    charging_minutes: number | null;
    price_per_kwh: number | null;
  }> | null;
}
function first<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value;
}

function nullableFirst<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function getAdminVisitPhotos(visitId: string): Promise<AdminVisitPhoto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("visit_photos")
    .select("id,visit_id,photo_type,caption,is_public,taken_at,created_at,updated_at,mime_type,file_size_bytes,width,height,display_order,is_cover")
    .eq("visit_id", visitId)
    .order("is_cover", { ascending: false })
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error("Visit photos could not be loaded.");
  return (data ?? []).map((photo) => ({
    id: photo.id,
    visitId: photo.visit_id,
    url: `/api/admin/photos/${photo.id}`,
    photoType: isVisitPhotoType(photo.photo_type) ? photo.photo_type : "other",
    caption: photo.caption,
    isPublic: photo.is_public,
    takenAt: photo.taken_at,
    createdAt: photo.created_at,
    updatedAt: photo.updated_at,
    mimeType: photo.mime_type as SupportedPhotoMime,
    fileSizeBytes: photo.file_size_bytes,
    width: photo.width,
    height: photo.height,
    displayOrder: photo.display_order,
    isCover: photo.is_cover,
  }));
}

export async function getPublicVisitDetail(visitId: string): Promise<PublicVisitDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("station_visits")
    .select(`
      id,
      station_id,
      checked_in_at,
      checked_in_timezone,
      checked_in_time_precision,
      notes,
      station:stations!station_visits_station_id_fkey(name,address,city,state,postal_code),
      charging_session:charging_sessions(energy_kwh,cost_usd,charging_minutes,price_per_kwh)
    `)
    .eq("id", visitId)
    .eq("is_public", true)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as PublicVisitRow;
  const station = first(row.station);
  if (!station) return null;
  const session = nullableFirst(row.charging_session);

  const { data: photoRows, error: photosError } = await supabase
    .from("public_visit_photos")
    .select("id,caption,taken_at,width,height,is_cover,display_order,created_at")
    .eq("visit_id", visitId)
    .order("is_cover", { ascending: false })
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (photosError) throw new Error("Public Visit photos could not be loaded.");
  const photos: PublicVisitPhoto[] = (photoRows ?? [])
    .filter((photo): photo is typeof photo & { id: string; width: number; height: number; is_cover: boolean } =>
      Boolean(photo.id) && photo.width !== null && photo.height !== null && photo.is_cover !== null,
    )
    .map((photo) => ({
      id: photo.id,
      url: `/api/public/photos/${photo.id}`,
      alt: photo.caption?.trim() || `Tesla Supercharger visit photo at ${station.name}`,
      caption: photo.caption,
      takenAt: photo.taken_at,
      width: photo.width,
      height: photo.height,
      isCover: photo.is_cover,
    }));

  return {
    id: row.id,
    stationId: row.station_id,
    stationName: station.name,
    address: station.address,
    city: station.city,
    state: station.state,
    postalCode: station.postal_code,
    checkedInAt: row.checked_in_at,
    checkedInTimezone: row.checked_in_timezone,
    checkedInTimePrecision: row.checked_in_time_precision === "date_only" ? "date_only" : "exact",
    notes: row.notes,
    energyKwh: session?.energy_kwh ?? null,
    costUsd: session?.cost_usd ?? null,
    chargingMinutes: session?.charging_minutes ?? null,
    pricePerKwh: session?.price_per_kwh ?? null,
    photos,
  };
}
