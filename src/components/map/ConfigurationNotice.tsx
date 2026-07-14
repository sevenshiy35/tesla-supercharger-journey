"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageProvider";

interface ConfigurationNoticeProps {
  title: string;
  message: string;
  canRetry?: boolean;
  surface?: "light" | "dark";
}

export function ConfigurationNotice({
  title,
  message,
  canRetry = false,
  surface = "light",
}: ConfigurationNoticeProps) {
  const isDark = surface === "dark";
  const { copy } = useLanguage();

  return (
    <div
      role="status"
      className={
        isDark
          ? "border border-white/14 bg-white/[0.07] p-5 text-white"
          : "flex h-full min-h-[620px] items-center justify-center bg-parchment p-6 text-center text-ink lg:min-h-[720px]"
      }
    >
      <div className={isDark ? "flex max-w-[760px] items-start gap-3" : "max-w-[540px]"}>
        <AlertCircle
          aria-hidden
          className={isDark ? "mt-0.5 shrink-0 text-action-blue-dark" : "mx-auto text-action-blue"}
          size={isDark ? 22 : 32}
        />
        <div>
          <h3 className={isDark ? "text-[18px] font-semibold" : "mt-4 text-[28px] font-semibold leading-[1.15]"}>
            {title}
          </h3>
          <p className={isDark ? "mt-1 text-[15px] leading-[1.5] text-white/70" : "mt-3 text-[17px] leading-[1.5] text-ink-muted"}>
            {message}
          </p>
          {canRetry ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className={
                isDark
                  ? "mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/24 px-4 text-[15px] text-white"
                  : "mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-action-blue px-5 text-[15px] text-white"
              }
            >
              <RefreshCw aria-hidden size={16} />
              {copy.common.retry}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
