"use client";

import type { Route } from "next";
import Image from "next/image";
import {
  Camera,
  Check,
  ChevronRight,
  Crosshair,
  Images,
  LoaderCircle,
  LocateFixed,
  Map,
  MapPin,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  createVisitPhotoMetadataAction,
  prepareVisitPhotoUploadAction,
} from "@/app/admin/photo-actions";
import {
  createStationVisitAction,
  nearbyStationsAction,
  searchStationsAction,
  selectStationAction,
} from "@/app/admin/visit-actions";
import { formatDistance } from "@/lib/admin/distance";
import { MAX_VISIT_NOTES_LENGTH } from "@/lib/admin/validation";
import {
  MAX_VISIT_PHOTOS,
  PHOTO_COMPRESSION_CONCURRENCY,
  PHOTO_UPLOAD_CONCURRENCY,
} from "@/lib/photos/constants";
import { prepareVisitPhoto, type PhotoPreparationStage } from "@/lib/photos/image-processing";
import { mapWithConcurrency } from "@/lib/photos/queue";
import { createClient } from "@/lib/supabase/client";
import type { AdminStationResult, SelectedAdminStation } from "@/types/admin";
import { PublicBadge } from "./PublicBadge";
import { VisitTime } from "./VisitTime";

type Mode = "nearby" | "search";
type Coordinates = { latitude: number; longitude: number };
type CheckInPhotoStatus = "selected" | PhotoPreparationStage | "uploading" | "saving" | "uploaded" | "failed";

interface CheckInPhoto {
  id: string;
  file: File;
  previewUrl: string;
  status: CheckInPhotoStatus;
  error: string | null;
}

interface SuccessState {
  visitId: string;
  linkedTripPlanId?: string;
  stationName: string;
  checkedInAt: string;
  timezone: string;
  isPublic: boolean;
  photoTotal: number;
  photoUploaded: number;
}

const PHOTO_STATUS_LABELS: Record<CheckInPhotoStatus, string> = {
  selected: "Ready",
  reading_metadata: "Reading metadata",
  compressing: "Optimizing",
  uploading: "Uploading",
  saving: "Saving",
  uploaded: "Uploaded",
  failed: "Failed",
};

function StationResultCard({
  station,
  pending,
  onSelect,
}: {
  station: AdminStationResult;
  pending: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={pending}
      className="flex min-h-[92px] w-full items-center gap-4 rounded-[22px] border border-[#d5e6df] bg-white p-4 text-left shadow-sm transition hover:border-[#86bcb3] disabled:opacity-60"
    >
      <span
        className={`flex size-11 shrink-0 items-center justify-center rounded-full ${
          station.visited ? "bg-[#e1f0f8] text-visited" : "bg-[#fde9e8] text-unvisited"
        }`}
      >
        <MapPin size={21} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-ink">{station.name}</span>
        <span className="mt-0.5 block truncate text-sm text-[#67817e]">
          {station.address} · {station.city}, {station.state}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium">
          <span className={station.visited ? "text-visited" : "text-unvisited"}>
            {station.visited ? "Visited" : "Not visited"}
          </span>
          {station.distanceMiles !== undefined ? (
            <span className="text-[#67817e]">{formatDistance(station.distanceMiles)} away</span>
          ) : null}
          {station.latestVisitAt ? (
            <span className="text-[#67817e]">
              Last {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(station.latestVisitAt))}
            </span>
          ) : null}
        </span>
      </span>
      {pending ? (
        <LoaderCircle size={19} className="shrink-0 animate-spin text-action-blue" aria-label="Selecting" />
      ) : (
        <ChevronRight size={19} className="shrink-0 text-[#67817e]" aria-hidden />
      )}
    </button>
  );
}

export function CheckInForm() {
  const [mode, setMode] = useState<Mode>("nearby");
  const [query, setQuery] = useState("");
  const [stations, setStations] = useState<AdminStationResult[]>([]);
  const [selectedStation, setSelectedStation] = useState<SelectedAdminStation | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locationMessage, setLocationMessage] = useState("Location has not been requested.");
  const [locationPending, setLocationPending] = useState(false);
  const [resultsPending, setResultsPending] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const visitId = useRef(crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [submitPending, setSubmitPending] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("Checking In…");
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [checkInPhotos, setCheckInPhotos] = useState<CheckInPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const checkInPhotosRef = useRef<CheckInPhoto[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const searchSequence = useRef(0);

  useEffect(() => {
    checkInPhotosRef.current = checkInPhotos;
  }, [checkInPhotos]);

  useEffect(() => () => {
    checkInPhotosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
  }, []);

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!success && checkInPhotosRef.current.length > 0) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [success]);

  useEffect(() => {
    if (mode !== "search") return;
    const normalized = query.trim();
    if (normalized.length < 2) {
      return;
    }

    const sequence = ++searchSequence.current;
    const timeout = window.setTimeout(async () => {
      setResultsPending(true);
      setError(null);
      const result = await searchStationsAction(normalized);
      if (sequence !== searchSequence.current) return;
      setResultsPending(false);
      if (result.ok) setStations(result.stations ?? []);
      else setError(result.error ?? "Station search failed.");
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [mode, query]);

  async function loadNearby(nextCoordinates: Coordinates) {
    setResultsPending(true);
    setError(null);
    const result = await nearbyStationsAction(
      nextCoordinates.latitude,
      nextCoordinates.longitude,
    );
    setResultsPending(false);
    if (result.ok) setStations(result.stations ?? []);
    else setError(result.error ?? "Nearby stations could not be loaded.");
  }

  function requestLocation() {
    setError(null);
    if (!("geolocation" in navigator)) {
      setLocationMessage("This browser does not support location. Search is still available.");
      setMode("search");
      return;
    }

    setLocationPending(true);
    setLocationMessage("Requesting your phone’s location…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextCoordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setCoordinates(nextCoordinates);
        setLocationPending(false);
        setLocationMessage(
          `Location ready (about ${Math.max(1, Math.round(position.coords.accuracy))} m accuracy). It will be saved with this check-in.`,
        );
        setMode("nearby");
        void loadNearby(nextCoordinates);
      },
      (geolocationError) => {
        setLocationPending(false);
        const message =
          geolocationError.code === geolocationError.PERMISSION_DENIED
            ? "Location permission was denied. You can still search manually."
            : geolocationError.code === geolocationError.TIMEOUT
              ? "Location timed out. Try again or search manually."
              : "Your location could not be determined. Search is still available.";
        setLocationMessage(message);
        setMode("search");
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  }

  async function chooseStation(station: AdminStationResult) {
    setSelectingId(station.id);
    setError(null);
    const result = await selectStationAction(station.id, coordinates ?? undefined);
    setSelectingId(null);
    if (result.ok && result.station) {
      setSelectedStation(result.station);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      setError(result.error ?? "The station could not be selected.");
    }
  }

  function addCheckInPhotos(files: FileList | null) {
    if (!files?.length) return;
    setPhotoError(null);
    const remaining = Math.max(0, MAX_VISIT_PHOTOS - checkInPhotosRef.current.length);
    const incoming = [...files].slice(0, remaining);
    if (files.length > remaining) {
      setPhotoError(`A check-in can include up to ${MAX_VISIT_PHOTOS} photos.`);
    }
    if (incoming.length) {
      const additions = incoming.map((file): CheckInPhoto => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        status: "selected",
        error: null,
      }));
      setCheckInPhotos((current) => {
        const next = [...current, ...additions];
        checkInPhotosRef.current = next;
        return next;
      });
    }
    if (cameraRef.current) cameraRef.current.value = "";
    if (libraryRef.current) libraryRef.current.value = "";
  }

  function removeCheckInPhoto(photoId: string) {
    if (submitPending) return;
    setCheckInPhotos((current) => {
      const removed = current.find((photo) => photo.id === photoId);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      const next = current.filter((photo) => photo.id !== photoId);
      checkInPhotosRef.current = next;
      return next;
    });
    setPhotoError(null);
  }

  function patchCheckInPhoto(photoId: string, patch: Partial<CheckInPhoto>) {
    setCheckInPhotos((current) => {
      const next = current.map((photo) => photo.id === photoId ? { ...photo, ...patch } : photo);
      checkInPhotosRef.current = next;
      return next;
    });
  }

  async function uploadCheckInPhoto(photo: CheckInPhoto, createdVisitId: string, photoIsPublic: boolean) {
    try {
      const prepared = await prepareVisitPhoto(photo.file, (stage) => {
        patchCheckInPhoto(photo.id, { status: stage, error: null });
      });
      const target = await prepareVisitPhotoUploadAction(createdVisitId, prepared.mimeType, photo.id);
      if (!target.ok || !target.photoId || !target.storagePath || !target.bucketName) {
        throw new Error(target.error ?? "The photo upload could not be prepared.");
      }

      patchCheckInPhoto(photo.id, { status: "uploading" });
      const storage = await createClient().storage.from(target.bucketName).upload(target.storagePath, prepared.blob, {
        cacheControl: "3600",
        contentType: prepared.mimeType,
        upsert: false,
      });
      if (storage.error) throw new Error(storage.error.message || "Storage rejected this photo.");

      patchCheckInPhoto(photo.id, { status: "saving" });
      const metadata = await createVisitPhotoMetadataAction({
        photoId: target.photoId,
        visitId: createdVisitId,
        bucketName: target.bucketName,
        storagePath: target.storagePath,
        photoType: "check_in",
        caption: "",
        isPublic: photoIsPublic,
        takenAtCandidate: prepared.takenAtCandidate,
        mimeType: prepared.mimeType,
        fileSizeBytes: prepared.blob.size,
        width: prepared.width,
        height: prepared.height,
      });
      if (!metadata.ok) throw new Error(metadata.error ?? "The photo details could not be saved.");
      patchCheckInPhoto(photo.id, { status: "uploaded", error: null });
      return true;
    } catch (uploadError) {
      patchCheckInPhoto(photo.id, {
        status: "failed",
        error: uploadError instanceof Error ? uploadError.message : "This photo could not be uploaded.",
      });
      return false;
    }
  }

  async function submitCheckIn() {
    if (!selectedStation || submitPending) return;
    setError(null);

    let timezone = "";
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!timezone) throw new Error("missing timezone");
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    } catch {
      setError("Your browser could not provide a valid timezone. Refresh and try again.");
      return;
    }

    setSubmitPending(true);
    setSubmitMessage("Checking In…");
    const result = await createStationVisitAction({
      visitId: visitId.current,
      stationId: selectedStation.id,
      timezone,
      latitude: coordinates?.latitude ?? null,
      longitude: coordinates?.longitude ?? null,
      notes,
      isPublic,
    });

    if (!result.ok || !result.visitId || !result.checkedInAt || !result.checkedInTimezone) {
      setSubmitPending(false);
      setError(result.error ?? "Check-in failed. Please try again.");
      return;
    }

    const photosToUpload = [...checkInPhotosRef.current];
    const createdVisitId = result.visitId;
    const createdVisitIsPublic = result.isPublic ?? isPublic;
    let photoUploaded = 0;
    if (photosToUpload.length) {
      setSubmitMessage(`Uploading ${photosToUpload.length} photo${photosToUpload.length === 1 ? "" : "s"}…`);
      const outcomes = await mapWithConcurrency(
        photosToUpload,
        Math.min(PHOTO_COMPRESSION_CONCURRENCY, PHOTO_UPLOAD_CONCURRENCY),
        (photo) => uploadCheckInPhoto(photo, createdVisitId, createdVisitIsPublic),
      );
      photoUploaded = outcomes.filter((outcome) => outcome.status === "fulfilled" && outcome.value).length;
    }
    photosToUpload.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    setCheckInPhotos([]);
    checkInPhotosRef.current = [];
    setSubmitPending(false);

    setSuccess({
      visitId: result.visitId,
      linkedTripPlanId: result.linkedTripPlanId,
      stationName: selectedStation.name,
      checkedInAt: result.checkedInAt,
      timezone: result.checkedInTimezone,
      isPublic: createdVisitIsPublic,
      photoTotal: photosToUpload.length,
      photoUploaded,
    });
  }

  function checkInAnother() {
    setSuccess(null);
    setSelectedStation(null);
    setNotes("");
    setIsPublic(true);
    setError(null);
    setPhotoError(null);
    setSubmitMessage("Checking In…");
    visitId.current = crypto.randomUUID();
    if (coordinates) void loadNearby(coordinates);
  }

  if (success) {
    return (
      <section className="rounded-[30px] border border-[#b9ded1] bg-white p-6 shadow-sm sm:p-9">
        <div className="flex size-14 items-center justify-center rounded-full bg-[#dff4eb] text-[#245e52]">
          <Check size={28} strokeWidth={2.5} aria-hidden />
        </div>
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.14em] text-[#327363]">
          Check-in successful
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">{success.stationName}</h2>
        <p className="mt-3 text-[#486d69]">
          <VisitTime
            checkedInAt={success.checkedInAt}
            timezone={success.timezone}
            precision="exact"
          />
        </p>
        <div className="mt-3">
          <PublicBadge isPublic={success.isPublic} />
        </div>
        {success.linkedTripPlanId ? (
          <p role="status" className="mt-5 rounded-2xl border border-[#b9ded1] bg-[#e7f5ef] px-4 py-3 text-sm font-semibold text-[#245e52]">
            This Stop is now checked in on your current Trip.
          </p>
        ) : null}
        {success.photoTotal > 0 ? (
          <p
            role="status"
            className={`mt-5 rounded-2xl px-4 py-3 text-sm font-semibold ${
              success.photoUploaded === success.photoTotal
                ? "border border-[#b9ded1] bg-[#e7f5ef] text-[#245e52]"
                : "border border-[#ead3a4] bg-[#fff5e6] text-[#815719]"
            }`}
          >
            {success.photoUploaded === success.photoTotal
              ? `${success.photoUploaded} photo${success.photoUploaded === 1 ? "" : "s"} uploaded with this check-in.`
              : `Visit saved and ${success.photoUploaded} of ${success.photoTotal} photos uploaded. Open the Visit to add the failed photo${success.photoTotal - success.photoUploaded === 1 ? "" : "s"} again.`}
          </p>
        ) : null}
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {success.linkedTripPlanId ? (
            <Link
              href={`/admin/trips/${success.linkedTripPlanId}` as Route}
              className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#e7f5ef] px-5 font-semibold text-[#245e52]"
            >
              <Map size={18} aria-hidden /> View Updated Trip
            </Link>
          ) : null}
          <Link
            href={`/admin/visits/${success.visitId}` as Route}
            className="flex min-h-12 items-center justify-center rounded-full bg-ink px-5 font-semibold text-white"
          >
            View Visit
          </Link>
          <button
            type="button"
            onClick={checkInAnother}
            className={`min-h-12 rounded-full border border-[#bedbd5] bg-white px-5 font-semibold text-ink ${success.linkedTripPlanId ? "sm:col-span-2" : ""}`}
          >
            Check In Another Station
          </button>
          <Link
            href="/"
            className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#edf4f0] px-5 font-semibold text-ink sm:col-span-2"
          >
            <Map size={18} aria-hidden /> View Public Map
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
      <section className="rounded-[28px] border border-[#d5e6df] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">1. Choose a station</h2>
            <p className="mt-1 text-sm leading-6 text-[#67817e]">
              Location is optional and records your phone’s position at check-in.
            </p>
          </div>
          {coordinates ? (
            <button
              type="button"
              onClick={() => {
                setCoordinates(null);
                setLocationMessage("Saved location cleared. This check-in will not include GPS.");
              }}
              className="min-h-11 shrink-0 rounded-full px-3 text-xs font-semibold text-[#8d2930] hover:bg-[#fff0f0]"
            >
              Clear GPS
            </button>
          ) : null}
        </div>

        <div className="mt-5 rounded-[20px] bg-[#f2f6f3] p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-white text-action-blue">
              <Crosshair size={20} aria-hidden />
            </span>
            <p className="flex-1 text-sm leading-5 text-[#486d69]" aria-live="polite">
              {locationMessage}
            </p>
          </div>
          <button
            type="button"
            onClick={requestLocation}
            disabled={locationPending}
            className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-5 font-semibold text-ink shadow-sm disabled:opacity-60"
          >
            {locationPending ? (
              <LoaderCircle size={18} className="animate-spin" aria-hidden />
            ) : (
              <LocateFixed size={18} aria-hidden />
            )}
            {coordinates ? "Refresh My Location" : "Use My Location"}
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 rounded-full bg-[#edf1ed] p-1" role="tablist">
          {(["nearby", "search"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => {
                setMode(value);
                setStations([]);
                setError(null);
                if (value === "nearby" && coordinates) void loadNearby(coordinates);
              }}
              className={`min-h-11 rounded-full text-sm font-semibold capitalize transition ${
                mode === value ? "bg-white text-ink shadow-sm" : "text-[#67817e]"
              }`}
            >
              {value}
            </button>
          ))}
        </div>

        {mode === "search" ? (
          <div className="relative mt-5">
            <Search
              size={19}
              aria-hidden
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#67817e]"
            />
            <label htmlFor="station-search" className="sr-only">
              Search stations by name, address, city, state, or postal code
            </label>
            <input
              id="station-search"
              type="search"
              value={query}
              onChange={(event) => {
                const nextQuery = event.target.value;
                setQuery(nextQuery);
                if (nextQuery.trim().length < 2) {
                  searchSequence.current += 1;
                  setStations([]);
                  setResultsPending(false);
                }
              }}
              autoComplete="off"
              className="min-h-12 w-full rounded-2xl border border-[#bedbd5] bg-white py-3 pl-11 pr-4 outline-none focus:border-action-blue focus:ring-4 focus:ring-[#34908b]/15"
              placeholder="Name, address, city, state, or ZIP"
            />
            {query.trim().length === 1 ? (
              <p className="mt-2 text-xs text-[#67817e]">Type at least 2 characters.</p>
            ) : null}
          </div>
        ) : !coordinates ? (
          <div className="mt-5 rounded-2xl border border-dashed border-[#bedbd5] px-5 py-8 text-center">
            <LocateFixed size={24} aria-hidden className="mx-auto text-action-blue" />
            <p className="mt-3 font-semibold">Use your location to see nearby stations</p>
            <p className="mt-1 text-sm text-[#67817e]">Nothing is selected automatically.</p>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-5 rounded-2xl bg-[#fff1f1] px-4 py-3 text-sm text-[#8d2930]">
            {error}
          </p>
        ) : null}

        <div className="mt-5 space-y-3" aria-live="polite">
          {resultsPending ? (
            <div className="flex min-h-24 items-center justify-center gap-2 rounded-[22px] bg-[#f2f6f3] text-sm text-[#486d69]">
              <LoaderCircle size={18} className="animate-spin" aria-hidden /> Loading stations…
            </div>
          ) : (
            stations.map((station) => (
              <StationResultCard
                key={station.id}
                station={station}
                pending={selectingId === station.id}
                onSelect={() => void chooseStation(station)}
              />
            ))
          )}
          {!resultsPending && stations.length === 0 && mode === "search" && query.trim().length >= 2 ? (
            <div className="rounded-[22px] bg-[#f2f6f3] px-5 py-8 text-center">
              <p className="font-semibold">No matching stations</p>
              <p className="mt-1 text-sm text-[#67817e]">Try a city, state code, address, or ZIP.</p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="h-fit rounded-[28px] border border-[#d5e6df] bg-white p-5 shadow-sm sm:p-7 xl:sticky xl:top-8">
        <h2 className="text-xl font-semibold">2. Confirm check-in</h2>
        {selectedStation ? (
          <>
            <div className="mt-5 rounded-[22px] bg-[#f2f6f3] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">{selectedStation.name}</p>
                  <p className="mt-1 text-sm leading-6 text-[#67817e]">
                    {selectedStation.address}
                    <br />
                    {selectedStation.city}, {selectedStation.state} {selectedStation.postalCode}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    selectedStation.visited
                      ? "bg-[#e1f0f8] text-visited"
                      : "bg-[#fde9e8] text-unvisited"
                  }`}
                >
                  {selectedStation.visited ? "Visited" : "New"}
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[#d5e6df] pt-4 text-sm">
                <div>
                  <dt className="text-xs text-[#67817e]">Previous visits</dt>
                  <dd className="mt-1 font-semibold">{selectedStation.previousVisitCount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#67817e]">Distance</dt>
                  <dd className="mt-1 font-semibold">
                    {selectedStation.distanceMiles === undefined
                      ? "Not available"
                      : formatDistance(selectedStation.distanceMiles)}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-[#67817e]">Last visit</dt>
                  <dd className="mt-1 font-semibold">
                    {selectedStation.latestVisitAt ? (
                      <VisitTime
                        checkedInAt={selectedStation.latestVisitAt}
                        timezone={selectedStation.latestVisitTimezone ?? "UTC"}
                        precision={selectedStation.latestVisitTimePrecision ?? "date_only"}
                      />
                    ) : (
                      "Not yet"
                    )}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => setSelectedStation(null)}
                className="mt-4 min-h-11 w-full rounded-full bg-white px-4 text-sm font-semibold text-action-blue shadow-sm"
              >
                Change Station
              </button>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="visit-notes" className="text-sm font-semibold">
                  Notes <span className="font-normal text-[#67817e]">(optional)</span>
                </label>
                <span className="text-xs text-[#67817e]">
                  {notes.length}/{MAX_VISIT_NOTES_LENGTH}
                </span>
              </div>
              <textarea
                id="visit-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={MAX_VISIT_NOTES_LENGTH}
                rows={4}
                className="mt-2 w-full resize-y rounded-2xl border border-[#bedbd5] bg-white px-4 py-3 outline-none focus:border-action-blue focus:ring-4 focus:ring-[#34908b]/15"
                placeholder="Anything worth remembering?"
              />
            </div>

            <div className="mt-5 rounded-[20px] border border-[#d5e6df] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">
                    Photos <span className="font-normal text-[#67817e]">(optional)</span>
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[#67817e]">
                    Add up to {MAX_VISIT_PHOTOS}. They upload automatically after the Visit is created.
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-[#67817e]">
                  {checkInPhotos.length}/{MAX_VISIT_PHOTOS}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={submitPending || checkInPhotos.length >= MAX_VISIT_PHOTOS}
                  onClick={() => cameraRef.current?.click()}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#78aaa4] bg-white px-3 text-sm font-semibold disabled:opacity-45"
                >
                  <Camera size={17} aria-hidden /> Take Photo
                </button>
                <button
                  type="button"
                  disabled={submitPending || checkInPhotos.length >= MAX_VISIT_PHOTOS}
                  onClick={() => libraryRef.current?.click()}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#78aaa4] bg-white px-3 text-sm font-semibold disabled:opacity-45"
                >
                  <Images size={17} aria-hidden /> Choose Photos
                </button>
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(event) => addCheckInPhotos(event.target.files)}
                />
                <input
                  ref={libraryRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                  multiple
                  className="sr-only"
                  onChange={(event) => addCheckInPhotos(event.target.files)}
                />
              </div>
              {checkInPhotos.length ? (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {checkInPhotos.map((photo) => (
                    <div key={photo.id} className="overflow-hidden rounded-2xl bg-[#f2f6f3]">
                      <div className="relative aspect-[4/3]">
                        <Image
                          src={photo.previewUrl}
                          alt={`Selected check-in photo ${checkInPhotos.indexOf(photo) + 1}`}
                          fill
                          unoptimized
                          className="object-cover"
                        />
                        {!submitPending ? (
                          <button
                            type="button"
                            onClick={() => removeCheckInPhoto(photo.id)}
                            aria-label="Remove selected photo"
                            className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-full bg-black/65 text-white"
                          >
                            <X size={16} aria-hidden />
                          </button>
                        ) : null}
                      </div>
                      <div className="px-3 py-2">
                        <p className="truncate text-xs font-semibold">{photo.file.name}</p>
                        <p className={`mt-1 text-xs ${photo.status === "failed" ? "text-[#8d2930]" : "text-[#67817e]"}`}>
                          {PHOTO_STATUS_LABELS[photo.status]}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {photoError ? (
                <p role="alert" className="mt-3 rounded-xl bg-[#fff1f1] px-3 py-2 text-xs text-[#8d2930]">
                  {photoError}
                </p>
              ) : null}
              <p className="mt-3 text-xs leading-5 text-[#67817e]">
                JPEG, PNG, WebP, HEIC, and HEIF are optimized before upload. Photo visibility follows this Visit.
              </p>
            </div>

            <label className="mt-4 flex min-h-16 cursor-pointer items-center gap-4 rounded-[20px] border border-[#d5e6df] px-4">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(event) => setIsPublic(event.target.checked)}
                className="size-5 accent-[#173f3c]"
              />
              <span className="flex-1">
                <span className="block text-sm font-semibold">Public visit</span>
                <span className="mt-0.5 block text-xs leading-5 text-[#67817e]">
                  Public visits update the map, statistics, and Latest Check-ins.
                </span>
              </span>
              <ShieldCheck size={20} aria-hidden className="text-action-blue" />
            </label>

            <button
              type="button"
              onClick={() => void submitCheckIn()}
              disabled={submitPending}
              className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-ink px-6 text-lg font-semibold text-white shadow-sm transition hover:bg-[#215a55] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitPending ? (
                <LoaderCircle size={20} className="animate-spin" aria-hidden />
              ) : (
                <MapPin size={20} aria-hidden />
              )}
              {submitPending ? submitMessage : "Check In Now"}
            </button>
            <p className="mt-3 text-center text-xs leading-5 text-[#67817e]">
              The database server records the authoritative check-in time.
            </p>
          </>
        ) : (
          <div className="mt-5 rounded-[22px] border border-dashed border-[#bedbd5] px-5 py-10 text-center">
            <MapPin size={25} aria-hidden className="mx-auto text-action-blue" />
            <p className="mt-3 font-semibold">No station selected</p>
            <p className="mt-1 text-sm leading-6 text-[#67817e]">
              Choose a search or nearby result. Visited stations can be checked in again.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
