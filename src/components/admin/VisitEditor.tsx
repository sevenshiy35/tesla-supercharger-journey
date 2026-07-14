"use client";

import { LoaderCircle, Save, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  deleteStationVisitAction,
  updateStationVisitAction,
} from "@/app/admin/visit-actions";
import { MAX_VISIT_NOTES_LENGTH } from "@/lib/admin/validation";
import type { AdminVisitDetail } from "@/types/admin";
import { VisitTime } from "./VisitTime";

export function VisitEditor({ visit }: { visit: AdminVisitDetail }) {
  const router = useRouter();
  const [notes, setNotes] = useState(visit.notes ?? "");
  const [isPublic, setIsPublic] = useState(visit.isPublic);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const hasChanges = notes !== (visit.notes ?? "") || isPublic !== visit.isPublic;

  useEffect(() => {
    if (!deleteOpen) return;
    cancelButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deleting) setDeleteOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteOpen, deleting]);

  async function saveChanges() {
    if (!hasChanges || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    const result = await updateStationVisitAction(visit.id, notes, isPublic);
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "Changes could not be saved.");
      return;
    }
    setMessage("Changes saved.");
    router.refresh();
  }

  async function deleteVisit() {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    const result = await deleteStationVisitAction(visit.id);
    setDeleting(false);
    if (!result.ok) {
      setDeleteOpen(false);
      setError(result.error ?? "The visit could not be deleted.");
      return;
    }
    router.replace("/admin/visits");
    router.refresh();
  }

  return (
    <section className="rounded-[28px] border border-[#d5e6df] bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.025em]">Manage Visit</h2>
          <p className="mt-1 text-sm text-[#67817e]">Only notes and public visibility can be changed.</p>
        </div>
        <Save size={22} aria-hidden className="text-action-blue" />
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="edit-visit-notes" className="text-sm font-semibold">
            Notes
          </label>
          <span className="text-xs text-[#67817e]">
            {notes.length}/{MAX_VISIT_NOTES_LENGTH}
          </span>
        </div>
        <textarea
          id="edit-visit-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={MAX_VISIT_NOTES_LENGTH}
          rows={6}
          className="mt-2 w-full resize-y rounded-2xl border border-[#bedbd5] bg-white px-4 py-3 outline-none focus:border-action-blue focus:ring-4 focus:ring-[#34908b]/15"
          placeholder="No notes yet."
        />
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
            Turning this off removes the Visit, its notes, and all of its photos from public pages.
          </span>
        </span>
      </label>

      {message ? (
        <p role="status" className="mt-4 rounded-2xl bg-[#e7f5ef] px-4 py-3 text-sm text-[#245e52]">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-2xl bg-[#fff1f1] px-4 py-3 text-sm text-[#8d2930]">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void saveChanges()}
        disabled={!hasChanges || saving}
        className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-6 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? <LoaderCircle size={18} className="animate-spin" aria-hidden /> : <Save size={18} aria-hidden />}
        {saving ? "Saving…" : "Save Changes"}
      </button>

      <div className="mt-7 border-t border-[#e2ece8] pt-6">
        <h3 className="font-semibold text-[#8d2930]">Danger zone</h3>
        <p className="mt-1 text-sm leading-6 text-[#67817e]">
          Deleting removes this Visit, its photos from private Storage, Photo Metadata, and its Charging Session. The station itself is never deleted.
        </p>
        {visit.hasPhotos ? (
          <p className="mt-3 rounded-2xl bg-[#fff5e6] px-4 py-3 text-sm text-[#815719]">
            This Visit has photos. Storage cleanup runs first; if any object deletion fails, the Visit is kept so you can retry.
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-[#d9a8aa] bg-white px-6 font-semibold text-[#8d2930]"
        >
          <Trash2 size={18} aria-hidden /> Delete Visit
        </button>
      </div>

      {deleteOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#102d2a]/55 p-4 backdrop-blur-sm sm:items-center"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleting) setDeleteOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            aria-describedby="delete-dialog-description"
            className="relative w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl sm:p-8"
          >
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
              className="absolute right-4 top-4 flex size-11 items-center justify-center rounded-full text-[#67817e] hover:bg-[#edf4f0]"
              aria-label="Close delete confirmation"
            >
              <X size={20} aria-hidden />
            </button>
            <div className="flex size-12 items-center justify-center rounded-full bg-[#fff0f0] text-[#a13a40]">
              <Trash2 size={22} aria-hidden />
            </div>
            <h2 id="delete-dialog-title" className="mt-5 pr-8 text-2xl font-semibold">
              Delete this Visit?
            </h2>
            <div id="delete-dialog-description" className="mt-3 text-sm leading-6 text-[#486d69]">
              <p className="font-semibold text-ink">{visit.stationName}</p>
              <p>
                <VisitTime
                  checkedInAt={visit.checkedInAt}
                  timezone={visit.checkedInTimezone}
                  precision={visit.checkedInTimePrecision}
                />
              </p>
              <p className="mt-3">
                This cannot be undone. Photos, Photo Metadata, and the Charging Session will also be deleted; the station will remain.
              </p>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                ref={cancelButtonRef}
                type="button"
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
                className="min-h-12 rounded-full border border-[#bedbd5] px-5 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void deleteVisit()}
                disabled={deleting}
                className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#9d3037] px-5 font-semibold text-white disabled:opacity-60"
              >
                {deleting ? <LoaderCircle size={18} className="animate-spin" aria-hidden /> : null}
                {deleting ? "Deleting…" : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
