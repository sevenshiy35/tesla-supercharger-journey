export const VISIT_PHOTO_BUCKET = "visit-photos";
export const MAX_PHOTO_EDGE = 2048;
export const MAX_PHOTO_CAPTION_LENGTH = 1000;
export const VISIT_PHOTO_SIGNED_URL_SECONDS = 10 * 60;
export const PHOTO_COMPRESSION_CONCURRENCY = 2;
export const PHOTO_UPLOAD_CONCURRENCY = 2;

export const VISIT_PHOTO_TYPES = [
  "check_in",
  "vehicle",
  "charger",
  "scenery",
  "receipt",
  "other",
] as const;

export type VisitPhotoType = (typeof VISIT_PHOTO_TYPES)[number];
export type SupportedPhotoMime = "image/jpeg" | "image/png" | "image/webp";
export type HeicPhotoMime = "image/heic" | "image/heif";
export type DetectedPhotoMime = SupportedPhotoMime | HeicPhotoMime;

export const PHOTO_TYPE_LABELS: Record<VisitPhotoType, string> = {
  check_in: "Check-in",
  vehicle: "Vehicle",
  charger: "Charger",
  scenery: "Scenery",
  receipt: "Receipt",
  other: "Other",
};

export function isVisitPhotoType(value: string): value is VisitPhotoType {
  return (VISIT_PHOTO_TYPES as readonly string[]).includes(value);
}

export function extensionForPhotoMime(mimeType: SupportedPhotoMime) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  return "webp";
}
