"use client";

import { Gauge, LogOut, Map, MapPinCheck, Rows3 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/admin/actions";

const items = [
  { href: "/admin", label: "Dashboard", shortLabel: "Home", icon: Gauge },
  { href: "/admin/check-in", label: "Check In", shortLabel: "Check In", icon: MapPinCheck },
  { href: "/admin/visits", label: "Visits", shortLabel: "Visits", icon: Rows3 },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === href : pathname.startsWith(href);
}

export function AdminNav({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-[#d5e6df] bg-[#fffdf2]/95 px-5 py-7 backdrop-blur lg:flex">
        <Link href="/admin" className="px-3 text-[19px] font-semibold tracking-[-0.02em] text-ink">
          MyTesla Journey
        </Link>
        <p className="mt-1 truncate px-3 text-xs text-[#67817e]">{email}</p>

        <nav aria-label="Admin navigation" className="mt-9 space-y-1">
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition ${
                isActive(pathname, href)
                  ? "bg-ink text-white"
                  : "text-[#3d625f] hover:bg-[#e9f3ee] hover:text-ink"
              }`}
            >
              <Icon size={20} aria-hidden />
              {label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto space-y-1">
          <Link
            href="/"
            className="flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-semibold text-[#3d625f] transition hover:bg-[#e9f3ee] hover:text-ink"
          >
            <Map size={20} aria-hidden />
            View Public Site
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-sm font-semibold text-[#8d2930] transition hover:bg-[#fff0f0]"
            >
              <LogOut size={20} aria-hidden />
              Sign Out
            </button>
          </form>
        </div>
      </aside>

      <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 rounded-[24px] border border-white/50 bg-ink/95 p-1.5 shadow-[0_16px_50px_rgba(23,63,60,0.28)] backdrop-blur lg:hidden">
        <nav aria-label="Admin mobile navigation" className="grid grid-cols-4">
          {items.map(({ href, shortLabel, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[18px] text-[11px] font-semibold transition ${
                isActive(pathname, href) ? "bg-white text-ink" : "text-white/75"
              }`}
            >
              <Icon size={20} aria-hidden />
              {shortLabel}
            </Link>
          ))}
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-[18px] text-[11px] font-semibold text-white/75"
            >
              <LogOut size={20} aria-hidden />
              Sign Out
            </button>
          </form>
        </nav>
      </div>
    </>
  );
}
