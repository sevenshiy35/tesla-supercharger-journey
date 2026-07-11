"use client";

import Link from "next/link";
import { useLanguage } from "@/i18n/LanguageProvider";
import { placeholderTitlesZh } from "@/i18n/translations";

interface ComingSoonProps {
  title: string;
}

export function ComingSoon({ title }: ComingSoonProps) {
  const { copy, language } = useLanguage();
  const localizedTitle =
    language === "zh"
      ? placeholderTitlesZh[title] ??
        (title.startsWith("Station ") ? `站点 ${title.slice("Station ".length)}` : title)
      : title;

  return (
    <main className="min-h-screen bg-parchment px-5 py-24 text-ink sm:px-8">
      <div className="mx-auto max-w-[760px]">
        <Link href="/" className="text-[14px] text-action-blue">
          {copy.placeholder.back}
        </Link>
        <h1 className="mt-12 text-[42px] font-semibold leading-[1.1] sm:text-[56px]">
          {localizedTitle}
        </h1>
        <p className="mt-5 text-[21px] leading-[1.45] text-[#3d625f]">
          {copy.placeholder.comingSoon}
        </p>
      </div>
    </main>
  );
}
