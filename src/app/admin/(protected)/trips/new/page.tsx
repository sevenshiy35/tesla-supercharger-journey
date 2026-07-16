import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { NewTripForm } from "@/components/admin/NewTripForm";
import { requireAdmin } from "@/lib/auth/admin";

export default async function NewTripPage() {
  await requireAdmin();

  return (
    <main className="mx-auto max-w-5xl">
      <Link href="/admin/trips" className="inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold text-action-blue">
        <ArrowLeft size={18} aria-hidden /> Back to Trip Plans
      </Link>
      <header className="mt-4">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-action-blue">Route basics</p>
        <h1 className="mt-2 text-[42px] font-semibold leading-none tracking-[-0.04em] sm:text-[54px]">New Trip</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[#486d69]">
          Choose the trip type, origin, and destination. You can select and arrange Supercharger Stops after the Base Route is calculated.
        </p>
      </header>
      <div className="mt-8">
        <NewTripForm />
      </div>
    </main>
  );
}
