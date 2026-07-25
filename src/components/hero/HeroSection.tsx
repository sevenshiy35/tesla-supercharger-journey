"use client";

import Image from "next/image";
import { ArrowDown } from "lucide-react";
import { AppLiquidGlass } from "@/components/ui/AppLiquidGlass";
import { useLanguage } from "@/i18n/LanguageProvider";

export function HeroSection() {
  const { copy, language } = useLanguage();

  return (
    <section
      id="journey"
      className="relative flex min-h-[100svh] items-center overflow-hidden bg-canvas px-5 pb-14 pt-24 sm:px-8 lg:px-12"
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
        <AppLiquidGlass
          variant="hero"
          className="w-full max-w-[620px] lg:translate-y-5"
          contentClassName="flex flex-col p-7 sm:min-h-[400px] sm:px-[50px] sm:py-[44px]"
        >
          <h1
            className={`max-w-[540px] font-story font-normal text-ink ${
              language === "zh"
                ? "whitespace-pre-line text-[44px] leading-[1.08] tracking-[0.02em] sm:text-[56px] lg:text-[64px]"
                : "text-balance text-[42px] leading-[1.04] tracking-[-0.035em] sm:text-[55px] lg:text-[62px]"
            }`}
          >
            {copy.hero.title}
          </h1>
          <p
            className="mt-5 max-w-[480px] whitespace-pre-line font-story text-[19px] leading-[1.45] text-ink sm:mt-6 sm:text-[23px] sm:leading-[1.38] sm:tracking-[-0.005em]"
          >
            {copy.hero.tagline}
          </p>
          <div className="mt-8 grid gap-3 sm:mt-auto sm:flex sm:flex-wrap sm:gap-4">
            <a
              role="button"
              href="#map"
              className="inline-flex min-h-[52px] items-center justify-center rounded-full bg-brand-strong px-6 font-ui text-[17px] font-semibold text-white shadow-[0_10px_28px_rgba(52,144,139,0.24)] transition hover:bg-brand"
            >
              {copy.hero.exploreMap}
            </a>
            <a
              role="button"
              href="#trip"
              className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border border-brand bg-canvas/90 px-6 font-ui text-[17px] font-semibold text-brand shadow-sm transition hover:bg-brand-soft/90"
            >
              {copy.hero.viewProgress}
              <ArrowDown aria-hidden size={17} />
            </a>
          </div>
        </AppLiquidGlass>
      </div>
    </section>
  );
}
