"use client";

import { LoaderCircle, Pencil, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { deleteTripPlanDraftAction } from "@/app/admin/trip-actions";

export function TripDraftManager({
  tripPlanId,
  planName,
  isDraft,
}: {
  tripPlanId: string;
  planName: string;
  isDraft: boolean;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!deleteOpen) return;
    cancelButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deleting) setDeleteOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteOpen, deleting]);

  function editRoute() {
    document.getElementById("route-basics")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function deleteDraft() {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    const result = await deleteTripPlanDraftAction(tripPlanId);
    setDeleting(false);
    if (!result.ok) {
      setDeleteOpen(false);
      setError(result.error ?? "The Draft could not be deleted.");
      return;
    }
    router.replace("/admin/trips");
    router.refresh();
  }

  return (
    <section className="mt-5 rounded-[24px] border border-[#d5e6df] bg-white p-5 shadow-sm sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-5">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.02em]">Draft actions</h2>
        <p className="mt-1 text-sm text-[#67817e]">Edit the route basics or delete this Draft.</p>
      </div>

      {isDraft ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-0 sm:min-w-[300px]">
          <button
            type="button"
            onClick={editRoute}
            className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#bedbd5] px-4 text-sm font-semibold"
          >
            <Pencil size={17} aria-hidden /> Edit route
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#d9a8aa] px-4 text-sm font-semibold text-[#8d2930]"
          >
            <Trash2 size={17} aria-hidden /> Delete draft
          </button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-[#486d69] sm:mt-0">This Plan is no longer editable.</p>
      )}

      {error ? (
        <p role="alert" className="mt-4 rounded-2xl bg-[#fff1f1] px-4 py-3 text-sm text-[#8d2930] sm:basis-full">
          {error}
        </p>
      ) : null}

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
            aria-labelledby="delete-trip-dialog-title"
            aria-describedby="delete-trip-dialog-description"
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
            <h2 id="delete-trip-dialog-title" className="mt-5 pr-8 text-2xl font-semibold">Delete this Draft?</h2>
            <div id="delete-trip-dialog-description" className="mt-3 text-sm leading-6 text-[#486d69]">
              <p className="font-semibold text-ink">{planName}</p>
              <p className="mt-3">Only this Trip Plan Draft will be deleted. Stations and historical Visits will remain unchanged.</p>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button ref={cancelButtonRef} type="button" onClick={() => setDeleteOpen(false)} disabled={deleting} className="min-h-12 rounded-full border border-[#bedbd5] px-5 font-semibold">Cancel</button>
              <button type="button" onClick={() => void deleteDraft()} disabled={deleting} className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#9d3037] px-5 font-semibold text-white disabled:opacity-60">
                {deleting ? <LoaderCircle size={18} className="animate-spin" aria-hidden /> : null}
                {deleting ? "Deleting…" : "Delete Draft"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
