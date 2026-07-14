"use client";

import Link from "next/link";
import { Check, ChevronDown, Languages, MapPinned, Menu, Search, X } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "@/i18n/LanguageProvider";
import type { Language } from "@/i18n/translations";

export function GlobalNavigation() {
  const [open, setOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const { copy, language, setLanguage } = useLanguage();
  const navLinks = [
    { label: copy.navigation.journey, href: "#journey" },
    { label: copy.navigation.map, href: "#map" },
    { label: copy.navigation.statistics, href: "#statistics" },
    { label: copy.navigation.checkIns, href: "#latest-check-ins" },
  ];

  const selectLanguage = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    setLanguageOpen(false);
    setOpen(false);
  };

  return (
    <header className="absolute inset-x-0 top-3 z-50 px-3 text-ink sm:px-5">
      <nav className="mx-auto flex h-16 max-w-[1180px] items-center justify-between rounded-[32px] border border-white/80 bg-canvas/94 px-4 text-[13px] font-bold leading-none shadow-[0_18px_55px_rgba(23,63,60,0.16)] backdrop-blur-xl sm:h-[72px] sm:px-6">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 text-[15px] font-black uppercase"
          aria-label="MyTesla2026Journey home"
        >
          <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-[15px] text-white">
            7
          </span>
          <span className="hidden sm:inline-flex">
            <span className="text-ink">My</span>
            <span className="text-brand">Tesla</span>
            <span className="text-accent-warm">2026</span>
          </span>
          <span className="sm:hidden">MT26</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="group relative flex h-8 items-center uppercase text-ink transition hover:text-brand"
            >
              {link.label}
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 rounded-full bg-brand transition group-hover:scale-x-100" />
            </a>
          ))}
        </div>

        <div className="hidden items-center justify-end gap-3 md:flex">
          <span className="hidden h-9 items-center whitespace-nowrap rounded-full border border-border bg-white px-4 text-ink-muted lg:flex">
            {copy.navigation.journeyLabel}
          </span>
          <a
            href="#map"
            aria-label={copy.navigation.map}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white text-ink transition hover:border-brand hover:text-brand"
          >
            <Search aria-hidden size={15} />
          </a>
          <a
            href="#statistics"
            aria-label={copy.navigation.statistics}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white text-ink transition hover:border-brand hover:text-brand"
          >
            <MapPinned aria-hidden size={15} />
          </a>
          <div className="relative">
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-white px-3 uppercase text-ink transition hover:border-brand hover:text-brand"
              aria-label={copy.navigation.openLanguage}
              aria-expanded={languageOpen}
              onClick={() => setLanguageOpen((current) => !current)}
            >
              <Languages aria-hidden size={14} />
              <span className="hidden lg:inline">{copy.navigation.language}</span>
              <ChevronDown
                aria-hidden
                size={14}
                className={`transition-transform ${languageOpen ? "rotate-180" : ""}`}
              />
            </button>

            {languageOpen ? (
              <div className="absolute right-0 top-12 w-40 overflow-hidden rounded-[18px] border border-border bg-white p-1.5 shadow-[0_18px_45px_rgba(23,63,60,0.18)]">
                {(["en", "zh"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="flex min-h-10 w-full items-center justify-between rounded-[12px] px-3 text-left text-[14px] font-bold text-ink-muted transition hover:bg-brand-soft/55 hover:text-ink"
                    onClick={() => selectLanguage(option)}
                  >
                    <span>
                      {option === "en" ? copy.navigation.english : copy.navigation.chinese}
                    </span>
                    {language === option ? <Check aria-hidden size={14} /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-white text-ink md:hidden"
          aria-label={open ? copy.navigation.closeMenu : copy.navigation.openMenu}
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <X aria-hidden size={18} /> : <Menu aria-hidden size={18} />}
        </button>
      </nav>

      {open ? (
        <div className="mx-auto mt-3 max-w-[1180px] rounded-[28px] border border-white/80 bg-canvas px-5 py-5 shadow-[0_18px_55px_rgba(23,63,60,0.18)] md:hidden">
          <div className="flex flex-col gap-5">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="flex min-h-11 items-center border-b border-border text-[16px] font-black uppercase text-ink"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <div>
              <div className="mb-3 flex items-center gap-2 text-[14px] font-bold uppercase text-ink-muted">
                <Languages aria-hidden size={16} />
                {copy.navigation.language}
              </div>
              <div className="grid grid-cols-2 rounded-full border border-border bg-white p-1">
                {(["en", "zh"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`min-h-10 rounded-full px-3 text-[15px] font-bold transition ${
                      language === option ? "bg-brand text-white" : "text-ink-muted"
                    }`}
                    onClick={() => selectLanguage(option)}
                  >
                    {option === "en" ? copy.navigation.english : copy.navigation.chinese}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
