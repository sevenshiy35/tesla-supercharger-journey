"use client";

import type { Route } from "next";
import Link from "next/link";
import { useLanguage } from "@/i18n/LanguageProvider";
import { interpolateText } from "@/i18n/translations";
import { formatDisplayDate } from "@/lib/journey/calculations";
import type { StationDataSource } from "@/types/station-data";

interface SiteFooterProps {
  lastUpdated: string;
  dataSource: StationDataSource;
}

export function SiteFooter({ lastUpdated, dataSource }: SiteFooterProps) {
  const { copy, language } = useLanguage();
  const updatedDate = lastUpdated
    ? formatDisplayDate(lastUpdated, language)
    : copy.footer.unavailable;
  const sourceLabel = {
    sample: copy.footer.sampleSource,
    nlr: copy.footer.nlrSource,
    supabase: copy.footer.supabaseSource,
  }[dataSource];

  return (
    <footer className="bg-surface-warm px-5 py-16 text-[12px] leading-[1.5] text-ink-muted sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1180px]">
        <div className="grid gap-8 border-b border-hairline pb-8 md:grid-cols-[1fr_auto]">
          <div>
            <h2 className="text-[17px] font-semibold text-ink">MyTesla2026Journey</h2>
            <p className="mt-2 max-w-[520px]">{copy.footer.description}</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3 md:justify-end">
            <span>{interpolateText(copy.footer.lastUpdated, { date: updatedDate })}</span>
            <span>{sourceLabel}</span>
            <Link href="/privacy" className="text-action-blue">
              {copy.footer.privacy}
            </Link>
            <Link href={"/photos" as Route} className="text-action-blue">
              {copy.footer.photos}
            </Link>
            <Link href="/admin" className="text-ink-muted">
              {copy.footer.admin}
            </Link>
          </div>
        </div>
        <p className="mt-6">
          {copy.footer.note}
        </p>
      </div>
    </footer>
  );
}
