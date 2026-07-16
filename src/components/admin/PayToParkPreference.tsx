import { LoaderCircle } from "lucide-react";

export const PAY_TO_PARK_HELP = "Personal marker based on your Tesla app review.";

export function PayToParkBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-[#d7ad34] bg-[#f7d65c] px-2.5 py-1 text-xs font-bold text-[#3d3008]">
      $ Pay to park
    </span>
  );
}

export function PayToParkToggleButton({
  payToPark,
  pending,
  onChange,
}: {
  payToPark: boolean;
  pending: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => onChange(!payToPark)}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[#d7ad34] bg-[#fff9db] px-3 text-xs font-semibold text-[#594609] transition hover:bg-[#fff0a8] disabled:opacity-50"
    >
      {pending ? <LoaderCircle size={14} className="animate-spin" aria-hidden /> : null}
      {payToPark ? "Remove pay-to-park mark" : "Mark pay to park"}
    </button>
  );
}
