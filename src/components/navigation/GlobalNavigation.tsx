"use client";

import type { Route } from "next";
import Link from "next/link";
import { Check, ChevronDown, Languages, Menu, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useLanguage } from "@/i18n/LanguageProvider";
import type { Language } from "@/i18n/translations";
import { LiquidGlass } from "@/components/ui/LiquidGlass";

export function GlobalNavigation() {
  const [open, setOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const mobileMenuId = useId();
  const languageMenuId = useId();
  const { copy, language, setLanguage } = useLanguage();
  const navLinks = [
    { label: copy.navigation.roadbook, href: "/#journey-story" as Route },
    { label: copy.navigation.map, href: "/#map" as Route },
    { label: copy.navigation.trip, href: "/#trip" as Route },
    { label: copy.navigation.photos, href: "/photos" as Route },
  ];

  const selectLanguage = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    setLanguageOpen(false);
    setOpen(false);
  };

  useEffect(() => {
    if (!open && !languageOpen) {
      return;
    }

    const closeMenus = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setLanguageOpen(false);
      }
    };

    window.addEventListener("keydown", closeMenus);
    return () => window.removeEventListener("keydown", closeMenus);
  }, [languageOpen, open]);

  return (
    <header className="absolute inset-x-0 top-3 z-50 px-3 font-ui text-ink sm:px-5">
      <LiquidGlass
        as="nav"
        variant="elevated"
        environment="warm"
        radius="pill"
        busyBackground
        trackPointer
        aria-label="Primary navigation"
        className="mx-auto max-w-[1180px] text-[13px] font-bold leading-none"
        contentClassName="relative flex h-[62px] items-center justify-between px-4 sm:h-[70px] sm:px-6"
      >
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 text-[15px] font-black uppercase"
          aria-label="Journey2026 home"
        >
          <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/20 bg-ink/95 text-[15px] text-white shadow-sm">
            7
          </span>
          <span className="hidden sm:inline-flex">
            <span className="text-ink">Journey</span>
            <span className="text-accent-warm">2026</span>
          </span>
          <span className="sm:hidden">J26</span>
        </Link>

        <div className="absolute left-1/2 hidden w-[480px] -translate-x-1/2 grid-cols-4 items-center lg:grid xl:w-[520px]">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group relative flex h-11 items-center justify-center whitespace-nowrap rounded-full px-2 text-center text-[14px] font-extrabold tracking-[0.02em] text-ink transition-colors hover:bg-white/28 hover:text-brand"
            >
              {link.label}
              <span aria-hidden className="absolute bottom-0 left-1/2 h-0.5 w-8 -translate-x-1/2 scale-x-0 rounded-full bg-brand transition group-hover:scale-x-100" />
            </Link>
          ))}
        </div>

        <div className="hidden items-center justify-end gap-3 lg:flex">
          <div className="relative">
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/70 bg-white/52 px-3 uppercase text-ink shadow-sm transition hover:border-brand hover:bg-white/78 hover:text-brand"
              aria-label={copy.navigation.openLanguage}
              aria-expanded={languageOpen}
              aria-controls={languageMenuId}
              aria-haspopup="true"
              onClick={() => {
                setLanguageOpen((current) => !current);
                setOpen(false);
              }}
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
              <div
                id={languageMenuId}
                className="absolute right-0 top-12 w-40 overflow-hidden rounded-[18px] border border-border bg-canvas p-1.5 shadow-[0_18px_45px_rgba(23,63,60,0.18)]"
                role="group"
                aria-label={copy.navigation.language}
              >
                {(["en", "zh"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="flex min-h-10 w-full items-center justify-between rounded-[12px] px-3 text-left text-[14px] font-bold text-ink-muted transition hover:bg-brand-soft/55 hover:text-ink"
                    aria-pressed={language === option}
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
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-white text-ink lg:hidden"
          aria-label={open ? copy.navigation.closeMenu : copy.navigation.openMenu}
          aria-expanded={open}
          aria-controls={mobileMenuId}
          onClick={() => {
            setOpen((current) => !current);
            setLanguageOpen(false);
          }}
        >
          {open ? <X aria-hidden size={18} /> : <Menu aria-hidden size={18} />}
        </button>
      </LiquidGlass>

      {open ? (
        <LiquidGlass
          id={mobileMenuId}
          variant="elevated"
          environment="warm"
          radius="panel"
          busyBackground
          className="mx-auto mt-3 max-w-[1180px] lg:hidden"
          contentClassName="px-5 py-5"
        >
          <div className="flex flex-col gap-5">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex min-h-11 items-center border-b border-border text-[16px] font-black uppercase text-ink"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
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
        </LiquidGlass>
      ) : null}
    </header>
  );
}
