"use client";

import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ImagePlus,
  Images,
  LoaderCircle,
  Pencil,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createVisitPhotoMetadataAction,
  deleteVisitPhotoAction,
  prepareVisitPhotoUploadAction,
  reorderVisitPhotosAction,
  setVisitCoverPhotoAction,
  updateVisitPhotoAction,
} from "@/app/admin/photo-actions";
import { createClient } from "@/lib/supabase/client";
import {
  MAX_PHOTO_CAPTION_LENGTH,
  PHOTO_COMPRESSION_CONCURRENCY,
  PHOTO_UPLOAD_CONCURRENCY,
  PHOTO_TYPE_LABELS,
  VISIT_PHOTO_BUCKET,
  VISIT_PHOTO_TYPES,
  type VisitPhotoType,
} from "@/lib/photos/constants";
import { prepareVisitPhoto, type PreparedVisitPhoto } from "@/lib/photos/image-processing";
import { mapWithConcurrency } from "@/lib/photos/queue";
import type { AdminVisitPhoto } from "@/types/photos";

type UploadStatus = "waiting" | "reading_metadata" | "compressing" | "ready" | "uploading" |
  "saving_metadata" | "uploaded" | "failed" | "cancelled";

interface SelectedPhoto {
  localId: string;
  photoId: string;
  file: File | null;
  originalName: string;
  originalBytes: number;
  previewUrl: string | null;
  prepared: PreparedVisitPhoto | null;
  status: UploadStatus;
  photoType: VisitPhotoType;
  caption: string;
  isPublic: boolean;
  error: string | null;
  warning: string | null;
  uploadTarget: { photoId: string; storagePath: string; bucketName: typeof VISIT_PHOTO_BUCKET } | null;
  storageUploaded: boolean;
}

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function platformError(prefix: string, error: unknown) {
  const message = error && typeof error === "object" && "message" in error && typeof error.message === "string"
    ? error.message.trim()
    : error instanceof Error ? error.message.trim() : "Unknown platform error";
  return `${prefix}: ${message || "Unknown platform error"}`;
}

const STATUS_LABELS: Record<UploadStatus, string> = {
  waiting: "Waiting",
  reading_metadata: "Reading metadata",
  compressing: "Compressing",
  ready: "Ready",
  uploading: "Uploading",
  saving_metadata: "Saving metadata",
  uploaded: "Uploaded",
  failed: "Failed",
  cancelled: "Cancelled",
};

function isActiveStatus(status: UploadStatus) {
  return status === "reading_metadata" || status === "compressing" || status === "uploading" ||
    status === "saving_metadata";
}

function formatOptionalDate(value: string | null, timezone?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(date);
}

function PhotoPreview({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#edf4f0] text-[#67817e]">
        <Images size={30} aria-hidden />
        <span className="sr-only">Image unavailable</span>
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      unoptimized
      sizes="(min-width: 1024px) 360px, 100vw"
      className="object-cover"
      onError={() => setFailed(true)}
    />
  );
}

function PhotoCard({
  photo,
  canMoveEarlier,
  canMoveLater,
  busy,
  visitTimezone,
  onChanged,
  onMove,
}: {
  photo: AdminVisitPhoto;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  busy: boolean;
  visitTimezone: string;
  onChanged: () => void;
  onMove: (direction: -1 | 1) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(photo.caption ?? "");
  const [photoType, setPhotoType] = useState<VisitPhotoType>(photo.photoType);
  const [isPublic, setIsPublic] = useState(photo.isPublic);
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const takenAt = formatOptionalDate(photo.takenAt, visitTimezone);
  const uploadedAt = formatOptionalDate(photo.createdAt);

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    if (pending || busy) return;
    setPending(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) setError(result.error ?? "The photo could not be updated.");
      else onChanged();
    } catch {
      setError("The photo could not be updated. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-[24px] border border-[#d5e6df] bg-white shadow-sm">
      <div className="relative aspect-[4/3] bg-[#edf4f0]">
        <PhotoPreview src={photo.url} alt={photo.caption?.trim() || "Visit photo preview"} />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          {photo.isCover ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#173f3c] px-3 py-1.5 text-xs font-semibold text-white">
              <Star size={13} fill="currentColor" aria-hidden /> Cover
            </span>
          ) : null}
          <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${photo.isPublic ? "bg-[#e7f5ef] text-[#245e52]" : "bg-[#fff5e6] text-[#815719]"}`}>
            {photo.isPublic ? "Public" : "Private"}
          </span>
        </div>
      </div>

      <div className="p-5">
        {editing ? (
          <div className="space-y-4">
            <div>
              <label htmlFor={`photo-type-${photo.id}`} className="text-sm font-semibold">Photo type</label>
              <select
                id={`photo-type-${photo.id}`}
                value={photoType}
                onChange={(event) => setPhotoType(event.target.value as VisitPhotoType)}
                className="mt-2 min-h-12 w-full rounded-xl border border-[#bedbd5] bg-white px-3"
              >
                {VISIT_PHOTO_TYPES.map((value) => <option key={value} value={value}>{PHOTO_TYPE_LABELS[value]}</option>)}
              </select>
            </div>
            <div>
              <div className="flex justify-between gap-3 text-sm">
                <label htmlFor={`photo-caption-${photo.id}`} className="font-semibold">Caption</label>
                <span className="text-[#67817e]">{caption.length}/{MAX_PHOTO_CAPTION_LENGTH}</span>
              </div>
              <textarea
                id={`photo-caption-${photo.id}`}
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                maxLength={MAX_PHOTO_CAPTION_LENGTH}
                rows={3}
                className="mt-2 w-full rounded-xl border border-[#bedbd5] px-3 py-2"
              />
            </div>
            <label className="flex min-h-12 items-center gap-3 rounded-xl border border-[#d5e6df] px-3">
              <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} className="size-5 accent-[#173f3c]" />
              <span className="text-sm font-semibold">Public photo</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="min-h-11 rounded-full border border-[#bedbd5] font-semibold" onClick={() => setEditing(false)}>Cancel</button>
              <button
                type="button"
                disabled={pending || busy}
                className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink px-3 font-semibold text-white disabled:opacity-50"
                onClick={() => void run(async () => {
                  const result = await updateVisitPhotoAction(photo.id, photoType, caption, isPublic);
                  if (result.ok) setEditing(false);
                  return result;
                })}
              >
                {pending ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <Check size={16} aria-hidden />} Save
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">{PHOTO_TYPE_LABELS[photo.photoType]}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#486d69]">{photo.caption || "No caption"}</p>
              </div>
              <button type="button" onClick={() => {
                setCaption(photo.caption ?? "");
                setPhotoType(photo.photoType);
                setIsPublic(photo.isPublic);
                setEditing(true);
              }} className="flex size-11 shrink-0 items-center justify-center rounded-full border border-[#bedbd5]" aria-label="Edit photo">
                <Pencil size={17} aria-hidden />
              </button>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-[#67817e]">
              {takenAt ? <><dt>Taken</dt><dd className="text-right">{takenAt}</dd></> : null}
              <dt>Uploaded</dt><dd className="text-right">{uploadedAt ?? "Unknown"}</dd>
              <dt>Image</dt><dd className="text-right">{photo.width}×{photo.height} · {formatBytes(photo.fileSizeBytes)}</dd>
            </dl>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={photo.isCover || pending || busy}
                onClick={() => void run(() => setVisitCoverPhotoAction(photo.visitId, photo.id))}
                className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#bedbd5] px-3 text-sm font-semibold disabled:opacity-45"
              >
                <Star size={16} aria-hidden /> Make Cover
              </button>
              <button type="button" disabled={!canMoveEarlier || pending || busy} onClick={() => void run(async () => { await onMove(-1); return { ok: true }; })} className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#bedbd5] px-3 text-sm font-semibold disabled:opacity-45">
                <ArrowLeft size={16} aria-hidden /> Earlier
              </button>
              <button type="button" disabled={!canMoveLater || pending || busy} onClick={() => void run(async () => { await onMove(1); return { ok: true }; })} className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#bedbd5] px-3 text-sm font-semibold disabled:opacity-45">
                Later <ArrowRight size={16} aria-hidden />
              </button>
              <button type="button" disabled={pending || busy} onClick={() => setConfirmDelete(true)} className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#d9a8aa] px-3 text-sm font-semibold text-[#8d2930] disabled:opacity-45">
                <Trash2 size={16} aria-hidden /> Delete
              </button>
            </div>
          </>
        )}
        {error ? <p role="alert" className="mt-4 rounded-xl bg-[#fff1f1] px-3 py-2 text-sm text-[#8d2930]">{error}</p> : null}
      </div>

      {confirmDelete ? (
        <div className="border-t border-[#eed6d7] bg-[#fff8f8] p-5">
          <p className="text-sm font-semibold text-[#8d2930]">Delete this photo permanently?</p>
          <p className="mt-1 text-xs leading-5 text-[#67817e]">Its private Storage object and Metadata will be removed. If it is the cover, the next photo becomes the cover.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" disabled={pending} onClick={() => setConfirmDelete(false)} className="min-h-11 rounded-full border border-[#bedbd5] font-semibold">Cancel</button>
            <button type="button" disabled={pending} onClick={() => void run(async () => { const result = await deleteVisitPhotoAction(photo.id); if (result.ok) setConfirmDelete(false); return result; })} className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#9d3037] font-semibold text-white disabled:opacity-50">
              {pending ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : null} Delete Photo
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function VisitPhotoManager({
  visitId,
  visitIsPublic,
  visitTimezone,
  initialPhotos,
}: {
  visitId: string;
  visitIsPublic: boolean;
  visitTimezone: string;
  initialPhotos: AdminVisitPhoto[];
}) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<SelectedPhoto[]>([]);
  const photos = initialPhotos;
  const [selected, setSelected] = useState<SelectedPhoto[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [managerBusy, setManagerBusy] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (selected.some((photo) => photo.status !== "uploaded" && photo.status !== "cancelled")) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [selected]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => () => selectedRef.current.forEach((photo) => {
    if (photo.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(photo.previewUrl);
  }), []);

  const orderedPhotos = useMemo(() => {
    const cover = photos.find((photo) => photo.isCover);
    const rest = photos.filter((photo) => !photo.isCover).sort((a, b) => a.displayOrder - b.displayOrder || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    return cover ? [cover, ...rest] : rest;
  }, [photos]);
  function patchSelected(localId: string, patch: Partial<SelectedPhoto>) {
    setSelected((current) => {
      const next = current.map((photo) => photo.localId === localId ? { ...photo, ...patch } : photo);
      selectedRef.current = next;
      return next;
    });
  }

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setGlobalError(null);
    const incoming = [...files];
    const additions = incoming.map((file): SelectedPhoto => ({
      localId: crypto.randomUUID(),
      photoId: crypto.randomUUID(),
      file,
      originalName: file.name,
      originalBytes: file.size,
      previewUrl: URL.createObjectURL(file),
      prepared: null,
      status: "waiting",
      photoType: "check_in",
      caption: "",
      isPublic: visitIsPublic,
      error: null,
      warning: null,
      uploadTarget: null,
      storageUploaded: false,
    }));
    setSelected((current) => {
      const next = [...current, ...additions];
      selectedRef.current = next;
      return next;
    });
    setUploadOpen(true);
    if (cameraRef.current) cameraRef.current.value = "";
    if (libraryRef.current) libraryRef.current.value = "";
  }

  function cancelWaiting(localId: string) {
    setSelected((current) => {
      const target = current.find((photo) => photo.localId === localId);
      if (!target || target.status !== "waiting") return current;
      if (target.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(target.previewUrl);
      const next = current.map((photo) => photo.localId === localId ? {
        ...photo,
        file: null,
        previewUrl: null,
        prepared: null,
        status: "cancelled" as const,
        error: null,
      } : photo);
      selectedRef.current = next;
      return next;
    });
  }

  function dismissFinished(localId: string) {
    setSelected((current) => current.filter((photo) => photo.localId !== localId));
  }

  async function processAndUpload(localId: string) {
    const initial = selectedRef.current.find((photo) => photo.localId === localId);
    if (!initial || initial.status === "cancelled" || initial.status === "uploaded") return false;
    let prepared = initial.prepared;
    let target = initial.uploadTarget;
    let storageUploaded = initial.storageUploaded;
    try {
      if (!prepared) {
        if (!initial.file) throw new Error("The local file is no longer available. Select it again.");
        prepared = await prepareVisitPhoto(initial.file, (stage) => {
          patchSelected(localId, { status: stage, error: null, warning: null });
        });
        patchSelected(localId, { prepared, status: "ready" });
      }

      const supabase = createClient();
      if (!target) {
        const preparedTarget = await prepareVisitPhotoUploadAction(visitId, prepared.mimeType, initial.photoId);
        if (!preparedTarget.ok || !preparedTarget.photoId || !preparedTarget.storagePath || !preparedTarget.bucketName) {
          throw new Error(preparedTarget.error ?? "The upload could not be prepared.");
        }
        target = {
          photoId: preparedTarget.photoId,
          storagePath: preparedTarget.storagePath,
          bucketName: preparedTarget.bucketName,
        };
        patchSelected(localId, { uploadTarget: target });
      }

      if (!storageUploaded) {
        patchSelected(localId, { status: "uploading", error: null });
        const storage = await supabase.storage.from(target.bucketName).upload(target.storagePath, prepared.blob, {
          cacheControl: "3600",
          contentType: prepared.mimeType,
          upsert: false,
        });
        if (storage.error) throw new Error(platformError("Storage rejected this photo", storage.error));
        storageUploaded = true;
        patchSelected(localId, { storageUploaded: true });
      }

      const latest = selectedRef.current.find((photo) => photo.localId === localId) ?? initial;
      patchSelected(localId, { status: "saving_metadata" });
      const metadata = await createVisitPhotoMetadataAction({
        photoId: target.photoId,
        visitId,
        bucketName: VISIT_PHOTO_BUCKET,
        storagePath: target.storagePath,
        photoType: latest.photoType,
        caption: latest.caption,
        isPublic: latest.isPublic,
        takenAtCandidate: prepared.takenAtCandidate,
        mimeType: prepared.mimeType,
        fileSizeBytes: prepared.blob.size,
        width: prepared.width,
        height: prepared.height,
      });
      if (!metadata.ok) {
        patchSelected(localId, {
          status: "failed",
          error: metadata.error ?? "Photo metadata could not be saved.",
          uploadTarget: target,
          storageUploaded: false,
        });
        return false;
      }

      if (initial.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(initial.previewUrl);
      patchSelected(localId, {
        file: null,
        previewUrl: null,
        prepared: null,
        status: "uploaded",
        warning: metadata.warning ?? null,
        error: null,
        uploadTarget: null,
        storageUploaded: false,
      });
      return true;
    } catch (error) {
      let message = error instanceof Error ? error.message : "This photo failed. Retry it when ready.";
      if (target && !storageUploaded && prepared) {
        const cleanup = await createClient().storage.from(target.bucketName).remove([target.storagePath]);
        if (cleanup.error) {
          message = `${message} ${platformError("The uncertain Storage object could not be cleaned up", cleanup.error)}. Photo ID: ${target.photoId}`;
        }
      }
      patchSelected(localId, {
        status: "failed",
        prepared,
        uploadTarget: target,
        storageUploaded,
        error: message,
      });
      return false;
    }
  }

  async function uploadQueuedPhotos(localIds?: string[]) {
    if (uploading) return;
    const eligible = selectedRef.current.filter((photo) =>
      (!localIds || localIds.includes(photo.localId)) &&
      (photo.status === "waiting" || photo.status === "ready" || photo.status === "failed"),
    );
    if (!eligible.length) return;
    setUploading(true);
    setGlobalError(null);
    try {
      const results = await mapWithConcurrency(
        eligible,
        Math.min(PHOTO_COMPRESSION_CONCURRENCY, PHOTO_UPLOAD_CONCURRENCY),
        (item) => processAndUpload(item.localId),
      );
      if (results.some((result) => result.status === "fulfilled" && result.value)) router.refresh();
    } finally {
      setUploading(false);
    }
  }

  async function movePhoto(photoId: string, direction: -1 | 1) {
    const from = orderedPhotos.findIndex((photo) => photo.id === photoId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= orderedPhotos.length) return;
    const next = [...orderedPhotos];
    [next[from], next[to]] = [next[to], next[from]];
    setManagerBusy(true);
    setGlobalError(null);
    try {
      const result = await reorderVisitPhotosAction(visitId, next.map((photo) => photo.id));
      if (!result.ok) setGlobalError(result.error ?? "Photos could not be reordered.");
      else router.refresh();
    } finally {
      setManagerBusy(false);
    }
  }

  function refresh() {
    router.refresh();
  }

  const queueCounts = {
    total: selected.length,
    completed: selected.filter((photo) => photo.status === "uploaded").length,
    uploading: selected.filter((photo) => isActiveStatus(photo.status)).length,
    failed: selected.filter((photo) => photo.status === "failed").length,
    waiting: selected.filter((photo) => photo.status === "waiting").length,
  };
  const queuedForUpload = selected.filter((photo) =>
    photo.status === "waiting" || photo.status === "ready" || photo.status === "failed",
  ).length;

  return (
    <section className="mt-8 rounded-[28px] border border-[#d5e6df] bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.025em]">Photos</h2>
          <p className="mt-1 text-sm text-[#67817e]">{photos.length} photos · Private Storage with signed viewing URLs</p>
        </div>
        <button
          type="button"
          onClick={() => setUploadOpen((value) => !value)}
          className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-5 font-semibold text-white"
        >
          {uploadOpen ? <X size={18} aria-hidden /> : <ImagePlus size={18} aria-hidden />}
          {uploadOpen ? "Close Uploader" : "Add Photos"}
        </button>
      </div>

      {uploadOpen ? (
        <div className="mt-6 rounded-[24px] border border-[#bedbd5] bg-[#f8fbf9] p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => cameraRef.current?.click()} className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#78aaa4] bg-white font-semibold">
              <Camera size={19} aria-hidden /> Take Photo
            </button>
            <button type="button" onClick={() => libraryRef.current?.click()} className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#78aaa4] bg-white font-semibold">
              <Images size={19} aria-hidden /> Choose From Library
            </button>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => addFiles(event.target.files)} />
            <input ref={libraryRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple className="sr-only" onChange={(event) => addFiles(event.target.files)} />
          </div>
          <p className="mt-3 text-xs leading-5 text-[#67817e]">JPEG, PNG, WebP, HEIC, or HEIF · optimized to about 2,048 px on the longest edge. This project adds no photo-count or file-size cap; actual limits come from Supabase Storage, your browser, device memory, and network.</p>

          {selected.length ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl bg-[#eaf3ef] px-4 py-3 text-sm text-[#365f59]">
                Total {queueCounts.total} · Completed {queueCounts.completed} · Uploading {queueCounts.uploading} · Failed {queueCounts.failed} · Waiting {queueCounts.waiting}
              </div>
              {selected.filter((photo) => photo.status !== "uploaded" && photo.status !== "cancelled").length >= 10 ? (
                <p className="rounded-2xl bg-[#fff5e6] px-4 py-3 text-sm text-[#815719]">Large batches may take longer. Keep this page open while uploads complete.</p>
              ) : null}
              {selected.map((item) => (
                <div key={item.localId} className="rounded-[20px] border border-[#d5e6df] bg-white p-3 sm:p-4">
                  <div className="flex gap-3">
                    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[#edf4f0]">
                      {item.previewUrl ? <Image src={item.previewUrl} alt="Selected photo preview" fill unoptimized className="object-cover" /> : (
                        <div className="flex h-full items-center justify-center text-[#67817e]"><Images size={26} aria-hidden /></div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{item.originalName}</p>
                          <p className="mt-1 text-xs text-[#67817e]">{item.prepared ? `${item.prepared.width}×${item.prepared.height} · ${formatBytes(item.prepared.blob.size)}` : formatBytes(item.originalBytes)}</p>
                          <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-[#486d69]">
                            {isActiveStatus(item.status) ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : null}
                            {STATUS_LABELS[item.status]}
                          </p>
                        </div>
                        {item.status === "waiting" ? (
                          <button type="button" onClick={() => cancelWaiting(item.localId)} className="flex size-11 shrink-0 items-center justify-center rounded-full text-[#67817e]" aria-label="Cancel waiting photo"><X size={18} aria-hidden /></button>
                        ) : item.status === "uploaded" || item.status === "cancelled" ? (
                          <button type="button" onClick={() => dismissFinished(item.localId)} className="flex size-11 shrink-0 items-center justify-center rounded-full text-[#67817e]" aria-label="Dismiss finished photo"><X size={18} aria-hidden /></button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {item.status !== "uploaded" && item.status !== "cancelled" ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor={`selected-type-${item.localId}`} className="text-xs font-semibold">Photo type</label>
                        <select id={`selected-type-${item.localId}`} value={item.photoType} disabled={isActiveStatus(item.status)} onChange={(event) => patchSelected(item.localId, { photoType: event.target.value as VisitPhotoType })} className="mt-1 min-h-11 w-full rounded-xl border border-[#bedbd5] bg-white px-3 disabled:opacity-50">
                          {VISIT_PHOTO_TYPES.map((value) => <option key={value} value={value}>{PHOTO_TYPE_LABELS[value]}</option>)}
                        </select>
                      </div>
                      <label className="flex min-h-11 items-center gap-3 self-end rounded-xl border border-[#d5e6df] px-3">
                        <input type="checkbox" checked={item.isPublic} disabled={isActiveStatus(item.status)} onChange={(event) => patchSelected(item.localId, { isPublic: event.target.checked })} className="size-5 accent-[#173f3c]" />
                        <span className="text-sm font-semibold">Public photo</span>
                      </label>
                      <div className="sm:col-span-2">
                        <div className="flex justify-between text-xs"><label htmlFor={`selected-caption-${item.localId}`} className="font-semibold">Caption</label><span className="text-[#67817e]">{item.caption.length}/{MAX_PHOTO_CAPTION_LENGTH}</span></div>
                        <textarea id={`selected-caption-${item.localId}`} value={item.caption} disabled={isActiveStatus(item.status)} maxLength={MAX_PHOTO_CAPTION_LENGTH} rows={2} onChange={(event) => patchSelected(item.localId, { caption: event.target.value })} className="mt-1 w-full rounded-xl border border-[#bedbd5] px-3 py-2 disabled:opacity-50" placeholder="Optional plain-text caption" />
                      </div>
                    </div>
                  ) : null}
                  {item.error ? <p role="alert" className="mt-3 rounded-xl bg-[#fff1f1] px-3 py-2 text-sm text-[#8d2930]">{item.error}</p> : null}
                  {item.warning ? <p className="mt-3 rounded-xl bg-[#fff5e6] px-3 py-2 text-sm text-[#815719]">{item.warning}</p> : null}
                  {item.status === "failed" ? (
                    <button type="button" disabled={uploading} onClick={() => void uploadQueuedPhotos([item.localId])} className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#78aaa4] px-4 text-sm font-semibold disabled:opacity-50">
                      <Upload size={16} aria-hidden /> Retry this photo
                    </button>
                  ) : null}
                </div>
              ))}
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" disabled={!selected.some((photo) => photo.status === "waiting")} onClick={() => selected.filter((photo) => photo.status === "waiting").forEach((photo) => cancelWaiting(photo.localId))} className="min-h-12 rounded-full border border-[#bedbd5] font-semibold disabled:opacity-50">Cancel Waiting</button>
                <button type="button" disabled={uploading || queuedForUpload === 0} onClick={() => void uploadQueuedPhotos()} className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-action-blue px-5 font-semibold text-white disabled:opacity-45">
                  {uploading ? <LoaderCircle size={18} className="animate-spin" aria-hidden /> : <Upload size={18} aria-hidden />}
                  {uploading ? "Uploading queue…" : `Upload queue (${queuedForUpload})`}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {globalError ? <p role="alert" className="mt-5 rounded-2xl bg-[#fff1f1] px-4 py-3 text-sm text-[#8d2930]">{globalError}</p> : null}

      {orderedPhotos.length ? (
        <div className="mt-7 grid gap-5 lg:grid-cols-2">
          {orderedPhotos.map((photo, index) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              canMoveEarlier={index > (orderedPhotos[0]?.isCover ? 1 : 0)}
              canMoveLater={!photo.isCover && index < orderedPhotos.length - 1}
              busy={managerBusy}
              visitTimezone={visitTimezone}
              onChanged={refresh}
              onMove={(direction) => movePhoto(photo.id, direction)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-7 rounded-[22px] bg-[#f2f6f3] px-5 py-10 text-center">
          <Images size={28} className="mx-auto text-[#67817e]" aria-hidden />
          <p className="mt-3 font-semibold">No photos yet</p>
          <p className="mt-1 text-sm text-[#67817e]">Add camera photos or choose any number of images from your library.</p>
        </div>
      )}
    </section>
  );
}
