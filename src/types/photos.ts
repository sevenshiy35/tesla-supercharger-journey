import type { SupportedPhotoMime, VisitPhotoType } from "@/lib/photos/constants";

export interface ExifTakenAtCandidate {
  localDateTime: string;
  offsetMinutes: number | null;
  source: "DateTimeOriginal" | "CreateDate";
}
export interface AdminVisitPhoto {
  id: string;
  visitId: string;
  url: string;
  photoType: VisitPhotoType;
  caption: string | null;
  isPublic: boolean;
  takenAt: string | null;
  createdAt: string;
  updatedAt: string;
  mimeType: SupportedPhotoMime;
  fileSizeBytes: number;
  width: number;
  height: number;
  displayOrder: number;
  isCover: boolean;
}

export interface AdminTripPhoto {
  id: string;
  tripPlanId: string;
  url: string;
  caption: string | null;
  isPublic: boolean;
  takenAt: string | null;
  createdAt: string;
  mimeType: SupportedPhotoMime;
  fileSizeBytes: number;
  width: number;
  height: number;
  displayOrder: number;
  isCover: boolean;
}

export interface PublicVisitPhoto {
  id: string;
  url: string;
  alt: string;
  caption: string | null;
  takenAt: string | null;
  width: number;
  height: number;
  isCover: boolean;
}

export interface PublicVisitDetail {
  id: string;
  stationId: string;
  stationName: string;
  address: string;
  city: string;
  state: string;
  postalCode: string | null;
  checkedInAt: string;
  checkedInTimezone: string;
  checkedInTimePrecision: "exact" | "date_only";
  notes: string | null;
  energyKwh: number | null;
  costUsd: number | null;
  chargingMinutes: number | null;
  pricePerKwh: number | null;
  photos: PublicVisitPhoto[];
}
