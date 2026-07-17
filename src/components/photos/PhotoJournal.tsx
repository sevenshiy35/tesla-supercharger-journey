"use client";

import { ChevronLeft, ChevronRight, MapPin, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/i18n/LanguageProvider";
import { interpolateText } from "@/i18n/translations";
import type { PublicPhotoJournalItem } from "@/types/photo-journal";

function photoDate(photo: PublicPhotoJournalItem, language: "en" | "zh") {
  const date = new Date(photo.takenAt ?? photo.checkedInAt);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function PhotoJournal({ photos }: { photos: PublicPhotoJournalItem[] }) {
  const { copy, language } = useLanguage();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const touchStartRef = useRef<number | null>(null);
  const activePhoto = activeIndex === null ? null : photos[activeIndex];

  const close = useCallback(() => {
    setActiveIndex(null);
    window.setTimeout(() => restoreFocusRef.current?.focus(), 0);
  }, []);

  const move = useCallback((direction: -1 | 1) => {
    setActiveIndex((current) => current === null ? null : (current + direction + photos.length) % photos.length);
  }, [photos.length]);

  function open(index: number, trigger: HTMLElement) {
    restoreFocusRef.current = trigger;
    setActiveIndex(index);
  }

  useEffect(() => {
    if (activeIndex === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowLeft" && photos.length > 1) move(-1);
      if (event.key === "ArrowRight" && photos.length > 1) move(1);
      if (event.key !== "Tab") return;
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeIndex, close, move, photos.length]);

  return (
    <section className="mx-auto max-w-[1320px] px-5 pb-24 pt-40 text-ink sm:px-8 sm:pt-44 lg:px-12 lg:pb-32">
      <header className="grid gap-8 border-b border-border-soft pb-12 lg:grid-cols-[1fr_0.55fr] lg:items-end lg:pb-16">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.24em] text-brand">{copy.photos.eyebrow}</p>
          <h1 className={`mt-6 max-w-[880px] text-balance font-story text-[52px] font-normal sm:text-[74px] lg:text-[88px] ${language === "zh" ? "leading-[1.12] tracking-[0.02em]" : "leading-[0.94] tracking-[-0.05em]"}`}>{copy.photos.title}</h1>
        </div>
        <div className="lg:pb-2">
          <p className="max-w-[460px] text-[17px] leading-7 text-ink-muted">{copy.photos.description}</p>
          <p className="mt-6 font-data text-[12px] font-bold uppercase tracking-[0.14em] text-ink-subtle">{interpolateText(copy.photos.count, { count: String(photos.length) })}</p>
        </div>
      </header>

      {photos.length ? (
        <div className="mt-10 columns-1 gap-5 sm:columns-2 lg:mt-14 lg:columns-3 lg:gap-7">
          {photos.map((photo, index) => {
            const date = photoDate(photo, language);
            return (
              <figure key={photo.id} className="mb-8 break-inside-avoid">
                <button
                  type="button"
                  onClick={(event) => open(index, event.currentTarget)}
                  className="group relative block w-full overflow-hidden rounded-[22px] bg-surface-muted text-left shadow-[0_12px_36px_rgba(23,63,60,0.10)]"
                  aria-label={interpolateText(copy.photos.open, { index: String(index + 1), count: String(photos.length), description: photo.alt })}
                >
                  <Image
                    src={photo.url}
                    alt={photo.alt}
                    width={photo.width}
                    height={photo.height}
                    priority={index < 2}
                    unoptimized
                    sizes="(min-width: 1024px) 30vw, (min-width: 640px) 48vw, 100vw"
                    className="h-auto w-full transition duration-700 ease-out group-hover:scale-[1.025]"
                  />
                  <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#071412]/65 via-transparent to-transparent opacity-0 transition duration-300 group-hover:opacity-100" />
                  <span className="absolute inset-x-0 bottom-0 translate-y-2 px-5 pb-5 text-sm font-semibold text-white opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                    {photo.city}, {photo.state}
                  </span>
                </button>
                <figcaption className="mt-3 flex items-start justify-between gap-4 px-1">
                  <div>
                    <p className="font-story text-[17px] leading-6 text-ink">{photo.caption?.trim() || photo.stationName}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-subtle"><MapPin size={13} aria-hidden />{photo.city}, {photo.state}{date ? ` · ${date}` : ""}</p>
                  </div>
                  <Link href={`/visits/${photo.visitId}`} className="shrink-0 text-[12px] font-bold text-brand underline decoration-brand/30 underline-offset-4 hover:decoration-brand">{copy.photos.viewVisit}</Link>
                </figcaption>
              </figure>
            );
          })}
        </div>
      ) : (
        <div className="flex min-h-[320px] items-center justify-center border-b border-border-soft text-center">
          <p className="max-w-xl font-story text-[32px] text-ink-muted sm:text-[42px]">{copy.photos.empty}</p>
        </div>
      )}

      {activePhoto && activeIndex !== null ? (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={interpolateText(copy.photos.open, { index: String(activeIndex + 1), count: String(photos.length), description: activePhoto.alt })}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#071412]/96 p-3 sm:p-7"
          onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
          onTouchStart={(event) => { touchStartRef.current = event.changedTouches[0]?.clientX ?? null; }}
          onTouchEnd={(event) => {
            const start = touchStartRef.current;
            const end = event.changedTouches[0]?.clientX;
            touchStartRef.current = null;
            if (start === null || end === undefined || photos.length < 2 || Math.abs(end - start) < 55) return;
            move(end < start ? 1 : -1);
          }}
        >
          <button ref={closeRef} type="button" onClick={close} className="absolute right-3 top-3 z-10 flex size-12 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur sm:right-7 sm:top-7" aria-label={copy.photos.close}><X size={24} aria-hidden /></button>
          {photos.length > 1 ? (
            <>
              <button type="button" onClick={() => move(-1)} className="absolute left-2 z-10 flex size-12 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur sm:left-7" aria-label={copy.photos.previous}><ChevronLeft size={28} aria-hidden /></button>
              <button type="button" onClick={() => move(1)} className="absolute right-2 z-10 flex size-12 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur sm:right-7" aria-label={copy.photos.next}><ChevronRight size={28} aria-hidden /></button>
            </>
          ) : null}
          <div className="flex h-full w-full max-w-6xl flex-col items-center justify-center">
            <div className="relative h-[76vh] w-full">
              <Image src={activePhoto.url} alt={activePhoto.alt} fill unoptimized sizes="100vw" className="object-contain" />
            </div>
            <div className="mt-3 min-h-14 max-w-3xl text-center text-sm text-white/78">
              <p>{activePhoto.caption?.trim() || activePhoto.stationName}</p>
              <p className="mt-1 font-data text-[11px] uppercase tracking-[0.12em] text-white/48">{activePhoto.city}, {activePhoto.state} · {activeIndex + 1} / {photos.length}</p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
