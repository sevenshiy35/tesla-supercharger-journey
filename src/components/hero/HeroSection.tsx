"use client";

import Image from "next/image";
import { ArrowDown } from "lucide-react";
import { LiquidGlass } from "@/components/ui/LiquidGlass";
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
        <LiquidGlass
          variant="elevated"
          environment="warm"
          radius="panel"
          optics="cinematic"
          trackPointer
          className="w-full max-w-[544px] lg:translate-y-5"
          contentClassName="p-6 sm:min-h-[370px] sm:px-[46px] sm:py-[42px]"
        >
          <h1
            className={`font-story text-[34px] font-normal text-ink sm:text-[44px] lg:text-[52px] ${
              language === "zh"
                ? "whitespace-pre-line leading-[1.15] tracking-[0.02em]"
                : "text-balance leading-[1.08] tracking-[-0.025em]"
            }`}
          >
            {copy.hero.title}
          </h1>
          <p
            className={`mt-6 max-w-[450px] font-story text-[18px] leading-[1.45] text-ink sm:text-[23px] sm:leading-[1.4] sm:tracking-[-0.005em] ${
              language === "zh" ? "whitespace-pre-line" : ""
            }`}
          >
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
        </LiquidGlass>
      </div>
    </section>
  );
}
