import { CheckInForm } from "@/components/admin/CheckInForm";

export default function AdminCheckInPage() {
  return (
    <main>
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-action-blue">Mobile check-in</p>
        <h1 className="mt-2 text-[42px] font-semibold leading-none tracking-[-0.04em] sm:text-[54px]">
          Check In
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[#486d69]">
          Find the Supercharger, optionally attach your phone’s location and photos, and record an exact server-timed Visit.
        </p>
      </header>
      <CheckInForm />
    </main>
  );
}
