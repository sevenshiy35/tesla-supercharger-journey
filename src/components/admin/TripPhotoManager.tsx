"use client";

import Image from "next/image";
import { Camera, Check, Images, LoaderCircle, Trash2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  createTripPhotoMetadataAction,
  deleteTripPhotoAction,
  prepareTripPhotoUploadAction,
} from "@/app/admin/trip-photo-actions";
import {
  MAX_PHOTO_CAPTION_LENGTH,
  PHOTO_COMPRESSION_CONCURRENCY,
  PHOTO_UPLOAD_CONCURRENCY,
  TRIP_PHOTO_BUCKET,
} from "@/lib/photos/constants";
import { prepareVisitPhoto, type PreparedVisitPhoto } from "@/lib/photos/image-processing";
import { mapWithConcurrency } from "@/lib/photos/queue";
import { createClient } from "@/lib/supabase/client";
import type { AdminTripPhoto } from "@/types/photos";

type QueueStatus = "waiting" | "reading_metadata" | "compressing" | "uploading" | "saving" | "done" | "failed";

interface QueuedPhoto {
  localId: string;
  photoId: string;
  file: File;
  previewUrl: string;
  caption: string;
  isPublic: boolean;
  status: QueueStatus;
  prepared: PreparedVisitPhoto | null;
  error: string | null;
  warning: string | null;
}

const STATUS_LABELS: Record<QueueStatus, string> = {
  waiting: "Ready",
  reading_metadata: "Reading details",
  compressing: "Optimizing",
  uploading: "Uploading",
  saving: "Saving",
  done: "Uploaded",
  failed: "Try again",
};

function isBusy(status: QueueStatus) {
  return status === "reading_metadata" || status === "compressing" || status === "uploading" || status === "saving";
}

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function TripPhotoManager({
  tripPlanId,
  tripIsPublic,
  initialPhotos,
}: {
  tripPlanId: string;
  tripIsPublic: boolean;
  initialPhotos: AdminTripPhoto[];
}) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const queuedRef = useRef<QueuedPhoto[]>([]);
  const [queued, setQueued] = useState<QueuedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => { queuedRef.current = queued; }, [queued]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (queued.some((photo) => photo.status !== "done")) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [queued]);
  useEffect(() => () => {
    queuedRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
  }, []);

  function patch(localId: string, changes: Partial<QueuedPhoto>) {
    setQueued((current) => current.map((photo) => photo.localId === localId ? { ...photo, ...changes } : photo));
  }

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const additions = [...files].map((file): QueuedPhoto => ({
      localId: crypto.randomUUID(),
      photoId: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      caption: "",
      isPublic: tripIsPublic,
      status: "waiting",
      prepared: null,
      error: null,
      warning: null,
    }));
    setQueued((current) => [...current, ...additions]);
    setGlobalError(null);
    if (cameraRef.current) cameraRef.current.value = "";
    if (libraryRef.current) libraryRef.current.value = "";
  }

  function removeQueued(localId: string) {
    const photo = queuedRef.current.find((item) => item.localId === localId);
    if (!photo || isBusy(photo.status)) return;
    URL.revokeObjectURL(photo.previewUrl);
    setQueued((current) => current.filter((item) => item.localId !== localId));
  }

  async function uploadOne(photo: QueuedPhoto) {
    try {
      let prepared = photo.prepared;
      if (!prepared) {
        prepared = await prepareVisitPhoto(photo.file, (stage) => patch(photo.localId, { status: stage }));
        patch(photo.localId, { prepared });
      }
      const target = await prepareTripPhotoUploadAction(tripPlanId, prepared.mimeType, photo.photoId);
      if (!target.ok || !target.storagePath || target.bucketName !== TRIP_PHOTO_BUCKET) {
        throw new Error(target.error ?? "The upload could not be prepared.");
      }
      patch(photo.localId, { status: "uploading", error: null });
      const storage = await createClient().storage.from(TRIP_PHOTO_BUCKET).upload(target.storagePath, prepared.blob, {
        cacheControl: "3600",
        contentType: prepared.mimeType,
        upsert: false,
      });
      if (storage.error) throw new Error(storage.error.message || "Storage rejected this photo.");

      patch(photo.localId, { status: "saving" });
      const latest = queuedRef.current.find((item) => item.localId === photo.localId) ?? photo;
      const metadata = await createTripPhotoMetadataAction({
        tripPlanId,
        photoId: photo.photoId,
        storagePath: target.storagePath,
        caption: latest.caption,
        isPublic: latest.isPublic,
        takenAtCandidate: prepared.takenAtCandidate,
        mimeType: prepared.mimeType,
        fileSizeBytes: prepared.blob.size,
        width: prepared.width,
        height: prepared.height,
      });
      if (!metadata.ok) throw new Error(metadata.error ?? "Photo details could not be saved.");
      patch(photo.localId, { status: "done", warning: metadata.warning ?? null, error: null });
      return true;
    } catch (error) {
      patch(photo.localId, {
        status: "failed",
        error: error instanceof Error ? error.message : "This photo could not be uploaded.",
      });
      return false;
    }
  }

  async function uploadQueue() {
    if (uploading) return;
    const eligible = queuedRef.current.filter((photo) => photo.status === "waiting" || photo.status === "failed");
    if (!eligible.length) return;
    setUploading(true);
    setGlobalError(null);
    try {
      const results = await mapWithConcurrency(
        eligible,
        Math.min(PHOTO_COMPRESSION_CONCURRENCY, PHOTO_UPLOAD_CONCURRENCY),
        uploadOne,
      );
      if (results.some((result) => result.status === "fulfilled" && result.value)) router.refresh();
    } finally {
      setUploading(false);
    }
  }

  async function deletePhoto(photoId: string) {
    if (deletingId || !window.confirm("Delete this Trip photo? This cannot be undone.")) return;
    setDeletingId(photoId);
    setGlobalError(null);
    try {
      const result = await deleteTripPhotoAction(photoId);
      if (!result.ok) setGlobalError(result.error ?? "The photo could not be deleted.");
      else router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  const readyCount = queued.filter((photo) => photo.status === "waiting" || photo.status === "failed").length;
  const activeCount = queued.filter((photo) => isBusy(photo.status)).length;
  const doneCount = queued.filter((photo) => photo.status === "done").length;

  return (
    <section className="mt-8">
      <div className="rounded-[30px] border border-[#b8ddd7] bg-[#dcefeb] p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-action-blue">Trip photo uploader</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Add the whole journey</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#486d69]">
              These photos belong to this Trip, not to a charging-station check-in. Select as many as you like; there is no app-level upload limit.
            </p>
          </div>
          <div className="shrink-0 rounded-full bg-white/70 px-4 py-2 font-data text-sm font-semibold">
            {initialPhotos.length} uploaded
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => cameraRef.current?.click()} className="flex min-h-14 items-center justify-center gap-2 rounded-full bg-white font-semibold shadow-sm">
            <Camera size={19} aria-hidden /> Take a photo
          </button>
          <button type="button" onClick={() => libraryRef.current?.click()} className="flex min-h-14 items-center justify-center gap-2 rounded-full bg-ink font-semibold text-white shadow-sm">
            <Images size={19} aria-hidden /> Choose photos
          </button>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => addFiles(event.target.files)} />
          <input ref={libraryRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple className="sr-only" onChange={(event) => addFiles(event.target.files)} />
        </div>
        <p className="mt-3 text-xs leading-5 text-[#67817e]">JPEG, PNG, WebP, HEIC, and HEIF are optimized to about 2,048 px before upload.</p>
      </div>

      {queued.length ? (
        <div className="mt-5 rounded-[28px] border border-[#d5e6df] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Upload queue</h2>
              <p className="mt-1 text-sm text-[#67817e]">{queued.length} selected · {activeCount} uploading · {doneCount} complete</p>
            </div>
            <button type="button" disabled={uploading || readyCount === 0} onClick={() => void uploadQueue()} className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-action-blue px-5 font-semibold text-white disabled:opacity-45">
              {uploading ? <LoaderCircle size={18} className="animate-spin" aria-hidden /> : <Upload size={18} aria-hidden />}
              {uploading ? "Uploading…" : `Upload ${readyCount}`}
            </button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {queued.map((photo) => (
              <article key={photo.localId} className="rounded-[22px] border border-[#d5e6df] p-3 sm:p-4">
                <div className="flex gap-3">
                  <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl bg-[#edf4f0]">
                    <Image src={photo.previewUrl} alt="Selected Trip photo" fill unoptimized className="object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{photo.file.name}</p>
                        <p className="mt-1 text-xs text-[#67817e]">{photo.prepared ? formatBytes(photo.prepared.blob.size) : formatBytes(photo.file.size)}</p>
                        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[#486d69]">
                          {isBusy(photo.status) ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : photo.status === "done" ? <Check size={13} aria-hidden /> : null}
                          {STATUS_LABELS[photo.status]}
                        </p>
                      </div>
                      <button type="button" disabled={isBusy(photo.status)} onClick={() => removeQueued(photo.localId)} aria-label="Remove from upload queue" className="flex size-10 shrink-0 items-center justify-center rounded-full text-[#67817e] disabled:opacity-40">
                        <X size={17} aria-hidden />
                      </button>
                    </div>
                  </div>
                </div>
                {photo.status !== "done" ? (
                  <div className="mt-4">
                    <div className="flex justify-between text-xs"><label htmlFor={`trip-caption-${photo.localId}`} className="font-semibold">Caption</label><span className="text-[#67817e]">{photo.caption.length}/{MAX_PHOTO_CAPTION_LENGTH}</span></div>
                    <textarea id={`trip-caption-${photo.localId}`} value={photo.caption} disabled={isBusy(photo.status)} maxLength={MAX_PHOTO_CAPTION_LENGTH} rows={2} onChange={(event) => patch(photo.localId, { caption: event.target.value })} placeholder="Optional memory or location" className="mt-1 w-full rounded-xl border border-[#bedbd5] px-3 py-2 text-sm disabled:opacity-50" />
                    <label className="mt-3 flex min-h-11 items-center gap-3 rounded-xl bg-[#f2f6f3] px-3 text-sm font-semibold">
                      <input type="checkbox" checked={photo.isPublic} disabled={isBusy(photo.status)} onChange={(event) => patch(photo.localId, { isPublic: event.target.checked })} className="size-5 accent-[#173f3c]" /> Public when this Trip is published
                    </label>
                  </div>
                ) : null}
                {photo.error ? <p role="alert" className="mt-3 rounded-xl bg-[#fff1f1] px-3 py-2 text-sm text-[#8d2930]">{photo.error}</p> : null}
                {photo.warning ? <p className="mt-3 rounded-xl bg-[#fff5e6] px-3 py-2 text-sm text-[#815719]">{photo.warning}</p> : null}
              </article>
            ))}
          </div>
          {queued.filter((photo) => photo.status !== "done").length >= 10 ? (
            <p className="mt-4 rounded-2xl bg-[#fff5e6] px-4 py-3 text-sm text-[#815719]">Large batches may take longer. Keep this page open while uploads complete.</p>
          ) : null}
        </div>
      ) : null}

      {globalError ? <p role="alert" className="mt-5 rounded-2xl bg-[#fff1f1] px-4 py-3 text-sm text-[#8d2930]">{globalError}</p> : null}

      <div className="mt-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-action-blue">Trip library</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{initialPhotos.length ? `${initialPhotos.length} photos` : "No photos yet"}</h2>
        </div>
      </div>

      {initialPhotos.length ? (
        <div className="mt-5 columns-1 gap-4 sm:columns-2 xl:columns-3">
          {initialPhotos.map((photo) => (
            <article key={photo.id} className="mb-4 break-inside-avoid overflow-hidden rounded-[24px] border border-[#d5e6df] bg-white shadow-sm">
              <div className="relative bg-[#edf4f0]" style={{ aspectRatio: `${photo.width} / ${photo.height}` }}>
                <Image src={photo.url} alt={photo.caption?.trim() || "Trip photo"} fill unoptimized sizes="(min-width: 1280px) 28vw, (min-width: 640px) 45vw, 100vw" className="object-cover" />
              </div>
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{photo.caption?.trim() || "Untitled moment"}</p>
                  <p className="mt-1 text-xs text-[#67817e]">{photo.isPublic ? "Public with Trip" : "Private"} · {formatBytes(photo.fileSizeBytes)}</p>
                </div>
                <button type="button" disabled={deletingId !== null} onClick={() => void deletePhoto(photo.id)} aria-label="Delete Trip photo" className="flex size-10 shrink-0 items-center justify-center rounded-full text-[#8d2930] hover:bg-[#fff1f1] disabled:opacity-40">
                  {deletingId === photo.id ? <LoaderCircle size={17} className="animate-spin" aria-hidden /> : <Trash2 size={17} aria-hidden />}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-[26px] border border-dashed border-[#bedbd5] bg-white px-6 py-14 text-center">
          <Images size={30} aria-hidden className="mx-auto text-action-blue" />
          <p className="mt-3 font-semibold">Your Trip story starts here</p>
          <p className="mt-1 text-sm text-[#67817e]">Choose any number of travel photos from your library.</p>
        </div>
      )}
    </section>
  );
}
