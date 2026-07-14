import Link from "next/link";

export default function VisitNotFound() {
  return (
    <main className="rounded-[28px] border border-[#d5e6df] bg-white p-8 text-center shadow-sm">
      <h1 className="text-3xl font-semibold">Visit not found</h1>
      <p className="mt-3 text-[#67817e]">It may have already been deleted or the link is invalid.</p>
      <Link
        href="/admin/visits"
        className="mt-6 inline-flex min-h-12 items-center rounded-full bg-ink px-6 font-semibold text-white"
      >
        Back to Visits
      </Link>
    </main>
  );
}
