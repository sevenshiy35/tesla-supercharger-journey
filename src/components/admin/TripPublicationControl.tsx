"use client";

import { EyeOff, Globe2, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { setTripPublicationAction } from "@/app/admin/trip-actions";

export function TripPublicationControl({
  tripPlanId,
  initialShowOnHomepage,
}: {
  tripPlanId: string;
  initialShowOnHomepage: boolean;
}) {
  const router = useRouter();
  const [showOnHomepage, setShowOnHomepage] = useState(initialShowOnHomepage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function togglePublication() {
    if (saving) return;
    const nextValue = !showOnHomepage;
    setSaving(true);
    setError(null);
    const result = await setTripPublicationAction(tripPlanId, nextValue);
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "The Trip publication setting could not be saved.");
      return;
    }
    setShowOnHomepage(Boolean(result.showOnHomepage));
    router.refresh();
  }

  return (
    <section className="mt-5 rounded-[24px] border border-[#d5e6df] bg-white p-5 shadow-sm sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-5">
      <div>
        <div className="flex items-center gap-2">
          <span className={`flex size-9 items-center justify-center rounded-full ${showOnHomepage ? "bg-[#e7f5ef] text-[#245e52]" : "bg-[#edf1f0] text-[#67817e]"}`}>
            {showOnHomepage ? <Globe2 size={18} aria-hidden /> : <EyeOff size={18} aria-hidden />}
          </span>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Homepage Trip journal</h2>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#67817e]">
          {showOnHomepage
            ? "This Trip is live on the homepage with its Station stops, reviewed route, and Check-in progress."
            : "Publish this Trip when you want its Station stops, reviewed route, and Check-in progress on the homepage."}
          {" "}Private owner details and endpoint labels stay hidden.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void togglePublication()}
        disabled={saving}
        className={`mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-60 sm:mt-0 ${showOnHomepage ? "border border-[#d9a8aa] bg-white text-[#8d2930]" : "bg-ink text-white hover:bg-[#215a55]"}`}
      >
        {saving ? <LoaderCircle size={17} className="animate-spin" aria-hidden /> : showOnHomepage ? <EyeOff size={17} aria-hidden /> : <Globe2 size={17} aria-hidden />}
        {saving ? "Saving…" : showOnHomepage ? "Remove from homepage" : "Show on homepage"}
      </button>

      {error ? <p role="alert" className="mt-4 rounded-2xl bg-[#fff1f1] px-4 py-3 text-sm text-[#8d2930] sm:basis-full">{error}</p> : null}
    </section>
  );
}
