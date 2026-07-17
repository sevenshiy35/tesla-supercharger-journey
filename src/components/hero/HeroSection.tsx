"use client";

import Image from "next/image";
import { ArrowDown } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageProvider";

export function HeroSection() {
  const { copy, language } = useLanguage();

  return (
    <section
      id="journey"
      className="relative flex min-h-screen items-center overflow-hidden bg-canvas px-5 pb-14 pt-24 sm:px-8 lg:px-12"
    >
      <Image
        src="/images/hero/model-y-desert-road.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-[68%_bottom] lg:object-[center_bottom]"
      />
      <div aria-hidden className="absolute inset-0 bg-[#fff8ed]/[0.04]" />
      <div className="relative z-10 mx-auto w-full max-w-[1344px]">
        <div className="w-full max-w-[544px] rounded-[36px] border border-white/65 bg-[#fff8ed]/95 p-6 shadow-[0_24px_70px_rgba(42,31,24,0.18)] backdrop-blur-xl sm:min-h-[370px] sm:px-[46px] sm:py-[42px] lg:translate-y-5">
          <p className="mb-6 font-ui text-[17px] font-semibold text-ink">{copy.hero.eyebrow}</p>
          <h1
            className={`text-balance text-[30px] font-normal text-ink sm:text-[40px] lg:text-[46px] ${
              language === "zh"
                ? "font-story-cn leading-[1.15] tracking-[0.02em]"
                : "font-display-en leading-[1.08] tracking-[-0.025em]"
            }`}
          >
            {copy.hero.title}
          </h1>
          <p className="mt-6 max-w-[450px] font-ui text-[21px] leading-[1.35] text-ink sm:text-[27px] sm:tracking-[-0.01em]">
            {copy.hero.tagline}
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <a
              role="button"
              href="#map"
              className="inline-flex min-h-[50px] items-center rounded-full bg-brand-strong px-6 font-ui text-[17px] font-semibold text-white shadow-[0_10px_28px_rgba(52,144,139,0.24)] transition hover:bg-brand"
            >
              {copy.hero.exploreMap}
            </a>
            <a
              role="button"
              href="#statistics"
              className="inline-flex min-h-[50px] items-center gap-2 rounded-full border border-brand px-6 font-ui text-[17px] font-semibold text-brand transition hover:bg-brand-soft/70"
            >
              {copy.hero.viewProgress}
              <ArrowDown aria-hidden size={17} />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
