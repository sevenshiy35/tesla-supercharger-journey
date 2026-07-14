"use client";

import { ArrowDown } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageProvider";
import { HeroVisual } from "./HeroVisual";

export function HeroSection() {
  const { copy } = useLanguage();

  return (
    <section
      id="journey"
      className="relative flex min-h-screen items-center overflow-hidden bg-canvas px-5 pb-14 pt-24 sm:px-8 lg:px-12"
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-[url('/images/hero/mesh-759.png')] bg-cover bg-center"
      />
      <div aria-hidden className="absolute inset-0 bg-canvas/10" />
      <div className="relative z-10 mx-auto grid w-full max-w-[1360px] items-center gap-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <div className="min-w-0 max-w-[720px] rounded-[28px] border border-white/48 bg-white/26 p-6 shadow-[0_24px_70px_rgba(23,63,60,0.16)] backdrop-blur-2xl sm:p-8">
          <p className="mb-4 text-[17px] font-semibold text-ink">{copy.hero.eyebrow}</p>
          <h1 className="text-[22px] font-semibold leading-[1.08] text-ink sm:text-[40px] lg:text-[46px]">
            {copy.hero.title}
          </h1>
          <p className="mt-5 max-w-[620px] text-[21px] leading-[1.35] text-ink sm:text-[28px]">
            {copy.hero.tagline}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              role="button"
              href="#map"
              className="inline-flex min-h-11 items-center rounded-full bg-brand px-6 text-[17px] text-white shadow-[0_10px_28px_rgba(52,144,139,0.24)] transition hover:bg-brand-strong"
            >
              {copy.hero.exploreMap}
            </a>
            <a
              role="button"
              href="#statistics"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-brand px-6 text-[17px] text-brand transition hover:bg-brand-soft/70"
            >
              {copy.hero.viewProgress}
              <ArrowDown aria-hidden size={17} />
            </a>
          </div>
        </div>
        <div className="flex w-full justify-center lg:justify-end">
          <HeroVisual title={copy.hero.visualAlt} />
        </div>
      </div>
    </section>
  );
}
