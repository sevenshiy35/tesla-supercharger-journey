"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, Images, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicVisitPhoto } from "@/types/photos";

function GalleryImage({ photo, sizes, priority = false, contain = false }: { photo: PublicVisitPhoto; sizes: string; priority?: boolean; contain?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-muted text-ink-subtle">
        <Images size={32} aria-hidden />
        <span className="sr-only">Photo unavailable</span>
      </div>
    );
  }
  return (
    <Image
      src={photo.url}
      alt={photo.alt}
      fill
      unoptimized
      priority={priority}
      sizes={sizes}
      className={contain ? "object-contain" : "object-cover"}
      onError={() => setFailed(true)}
    />
  );
}

export function PublicVisitGallery({ photos }: { photos: PublicVisitPhoto[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const touchStartRef = useRef<number | null>(null);
  const activePhoto = activeIndex === null ? null : photos[activeIndex];

  const close = useCallback(() => {
    setActiveIndex(null);
    window.setTimeout(() => restoreFocusRef.current?.focus(), 0);
  }, []);

  function open(index: number, trigger: HTMLElement) {
    restoreFocusRef.current = trigger;
    setActiveIndex(index);
  }

  const move = useCallback((direction: -1 | 1) => {
    setActiveIndex((current) => current === null ? null : (current + direction + photos.length) % photos.length);
  }, [photos.length]);

  useEffect(() => {
    if (activeIndex === null) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowLeft" && photos.length > 1) move(-1);
      if (event.key === "ArrowRight" && photos.length > 1) move(1);
      if (event.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeIndex, photos.length, close, move]);

  if (!photos.length) return null;

  return (
    <section aria-labelledby="visit-gallery-title" className="mt-12">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-subtle">Photo journal</p>
          <h2 id="visit-gallery-title" className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Visit Gallery</h2>
        </div>
        <p className="text-sm text-ink-subtle">{photos.length} photo{photos.length === 1 ? "" : "s"}</p>
      </div>
      <div className={`mt-6 grid gap-4 ${photos.length > 1 ? "sm:grid-cols-2 lg:grid-cols-3" : ""}`}>
        {photos.map((photo, index) => (
          <figure key={photo.id} className={index === 0 && photos.length > 1 ? "sm:col-span-2 lg:row-span-2" : undefined}>
            <button
              type="button"
              onClick={(event) => open(index, event.currentTarget)}
              className={`group relative block w-full overflow-hidden rounded-[24px] bg-surface-muted text-left shadow-sm ${index === 0 && photos.length > 1 ? "aspect-[16/10] lg:h-full lg:min-h-[520px] lg:aspect-auto" : "aspect-[4/3]"}`}
              aria-label={`Open photo ${index + 1} of ${photos.length}: ${photo.alt}`}
            >
              <GalleryImage photo={photo} sizes={index === 0 ? "(min-width: 1024px) 760px, 100vw" : "(min-width: 1024px) 380px, 100vw"} priority={index === 0} />
              <span className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" aria-hidden />
              {photo.isCover ? <span className="absolute left-3 top-3 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white">Cover</span> : null}
            </button>
            {photo.caption ? <figcaption className="mt-2 text-sm leading-6 text-ink-muted">{photo.caption}</figcaption> : null}
          </figure>
        ))}
      </div>

      {activePhoto && activeIndex !== null ? (
        <div
          ref={dialogRef}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#071412]/95 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Photo ${activeIndex + 1} of ${photos.length}`}
          onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
          onTouchStart={(event) => { touchStartRef.current = event.changedTouches[0]?.clientX ?? null; }}
          onTouchEnd={(event) => {
            const start = touchStartRef.current;
            const end = event.changedTouches[0]?.clientX;
            touchStartRef.current = null;
            if (start === null || end === undefined || photos.length < 2) return;
            if (Math.abs(end - start) > 55) move(end < start ? 1 : -1);
          }}
        >
          <button ref={closeRef} type="button" onClick={close} className="absolute right-3 top-3 z-10 flex size-12 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur sm:right-6 sm:top-6" aria-label="Close photo viewer">
            <X size={24} aria-hidden />
          </button>
          {photos.length > 1 ? (
            <>
              <button type="button" onClick={() => move(-1)} className="absolute left-2 z-10 flex size-12 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur sm:left-6" aria-label="Previous photo"><ChevronLeft size={28} aria-hidden /></button>
              <button type="button" onClick={() => move(1)} className="absolute right-2 z-10 flex size-12 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur sm:right-6" aria-label="Next photo"><ChevronRight size={28} aria-hidden /></button>
            </>
          ) : null}
          <div className="flex h-full w-full max-w-6xl flex-col items-center justify-center">
            <div className="relative h-[75vh] w-full">
              <GalleryImage photo={activePhoto} sizes="100vw" contain />
            </div>
            <div className="mt-3 min-h-12 max-w-3xl text-center text-sm text-white/80">
              <p>{activePhoto.caption || activePhoto.alt}</p>
              <p className="mt-1 text-xs text-white/55">{activeIndex + 1} / {photos.length}</p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
