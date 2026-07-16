"use client";

import { Check, LoaderCircle, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { renameTripPlanAction } from "@/app/admin/trip-actions";

interface TripNameEditorProps {
  tripPlanId: string;
  initialName: string | null;
}

export function TripNameEditor({ tripPlanId, initialName }: TripNameEditorProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [draftName, setDraftName] = useState(initialName ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function beginEditing() {
    setDraftName(name ?? "");
    setError(null);
    setEditing(true);
  }

  function cancelEditing() {
    setDraftName(name ?? "");
    setError(null);
    setEditing(false);
  }

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = draftName.trim();
    if (normalizedName === name?.trim()) {
      setEditing(false);
      return;
    }

    setSaving(true);
    setError(null);
    const result = await renameTripPlanAction(tripPlanId, draftName);
    setSaving(false);
    if (!result.ok || !result.name) {
      setError(result.error ?? "The Trip name could not be saved.");
      return;
    }

    setName(result.name);
    setDraftName(result.name);
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <div className="mt-4 max-w-4xl">
        <form onSubmit={(event) => void saveName(event)} className="flex items-center gap-2">
          <label htmlFor="trip-plan-name" className="sr-only">Trip name</label>
          <input
            id="trip-plan-name"
            autoFocus
            maxLength={120}
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") cancelEditing();
            }}
            disabled={saving}
            className="min-w-0 flex-1 rounded-2xl border border-[#86bcb3] bg-white px-4 py-2 text-[30px] font-semibold leading-tight tracking-[-0.03em] text-ink outline-none ring-action-blue/20 focus:ring-4 sm:text-[40px]"
          />
          <button
            type="submit"
            disabled={saving || draftName.trim().length === 0}
            aria-label="Save Trip name"
            title="Save Trip name"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-white transition hover:bg-[#215a55] disabled:opacity-40"
          >
            {saving ? <LoaderCircle size={19} className="animate-spin" aria-hidden /> : <Check size={20} aria-hidden />}
          </button>
          <button
            type="button"
            onClick={cancelEditing}
            disabled={saving}
            aria-label="Cancel editing Trip name"
            title="Cancel"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-[#bedbd5] bg-white text-[#486d69] transition hover:bg-[#edf4f0] disabled:opacity-40"
          >
            <X size={20} aria-hidden />
          </button>
        </form>
        {error ? <p role="alert" className="mt-2 text-sm font-medium text-[#9d3037]">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-4 flex min-w-0 items-start gap-2">
      <h1 className="min-w-0 text-[38px] font-semibold leading-[1.02] tracking-[-0.04em] sm:text-[50px]">
        {name ?? "Untitled Trip"}
      </h1>
      <button
        type="button"
        onClick={beginEditing}
        aria-label="Edit Trip name"
        title="Edit Trip name"
        className="mt-0.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-action-blue transition hover:bg-[#e7f5ef] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action-blue/20 sm:mt-1"
      >
        <Pencil size={20} aria-hidden />
      </button>
    </div>
  );
}
