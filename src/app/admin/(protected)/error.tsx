"use client";

export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="rounded-[28px] border border-[#e1b8b8] bg-white p-7 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#a13a40]">Unable to load</p>
      <h1 className="mt-2 text-3xl font-semibold">The admin data is temporarily unavailable.</h1>
      <p className="mt-3 text-[#67817e]">Your data was not changed. Check the connection and try again.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 min-h-12 rounded-full bg-ink px-6 font-semibold text-white"
      >
        Try Again
      </button>
    </main>
  );
}
