"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppLiquidGlass } from "@/components/ui/AppLiquidGlass";
import {
  cinematicJourneyCopy,
  cinematicJourneyScenes,
  type CinematicJourneyScene,
} from "./cinematicJourneyScenes";
import styles from "./CinematicJourneyGallery.module.css";

type Metric = {
  label: string;
  value: string;
};

type CinematicJourneyGalleryProps = {
  introduction: string;
  language: "en" | "zh";
  metrics: Metric[];
};

const SCENE_DURATION_MS = 7_000;
const TRANSITION_DURATION_MS = 1_100;

function SceneImage({
  scene,
  priority,
}: {
  scene: CinematicJourneyScene;
  priority?: boolean;
}) {
  const imageStyle = {
    "--desktop-position": scene.backgroundPosition,
    "--mobile-position": scene.mobileBackgroundPosition,
  } as React.CSSProperties;

  return (
    <div className={styles.imageFrame} style={imageStyle} aria-hidden="true">
      <Image
        alt=""
        className={`${styles.sceneImage} ${styles.desktopImage} ${
          scene.mobileBackgroundImage ? styles.hasMobileAlternative : ""
        }`}
        fill
        priority={priority}
        sizes="(max-width: 820px) 100vw, 94vw"
        src={scene.backgroundImage}
      />
      {scene.mobileBackgroundImage ? (
        <Image
          alt=""
          className={`${styles.sceneImage} ${styles.mobileImage}`}
          fill
          sizes="(max-width: 820px) 100vw, 1px"
          src={scene.mobileBackgroundImage}
        />
      ) : null}
    </div>
  );
}

export function CinematicJourneyGallery({
  introduction,
  language,
  metrics,
}: CinematicJourneyGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [outgoingIndex, setOutgoingIndex] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isInView, setIsInView] = useState(true);
  const [cycleKey, setCycleKey] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeScene = cinematicJourneyScenes[activeIndex];
  const outgoingScene =
    outgoingIndex === null ? null : cinematicJourneyScenes[outgoingIndex];
  const sectionCopy = cinematicJourneyCopy[language];

  const selectScene = useCallback((nextIndex: number) => {
    const normalizedIndex =
      (nextIndex + cinematicJourneyScenes.length) % cinematicJourneyScenes.length;

    setActiveIndex((currentIndex) => {
      if (currentIndex === normalizedIndex) return currentIndex;

      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      setOutgoingIndex(currentIndex);
      transitionTimerRef.current = setTimeout(
        () => setOutgoingIndex(null),
        TRANSITION_DURATION_MS,
      );
      return normalizedIndex;
    });
    setCycleKey((value) => value + 1);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setReducedMotion(media.matches);
    syncPreference();
    media.addEventListener("change", syncPreference);
    return () => media.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries?.[0];
        if (!entry) return;
        setIsInView(entry.isIntersecting && entry.intersectionRatio >= 0.2);
      },
      { threshold: [0, 0.2, 0.5] },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const nextScene = cinematicJourneyScenes[(activeIndex + 1) % cinematicJourneyScenes.length];
    if (!nextScene) return;
    const image = new window.Image();
    image.src = nextScene.backgroundImage;
  }, [activeIndex]);

  useEffect(() => {
    if (reducedMotion || !isInView) return;
    const timer = setTimeout(
      () => selectScene(activeIndex + 1),
      SCENE_DURATION_MS,
    );
    return () => clearTimeout(timer);
  }, [activeIndex, cycleKey, isInView, reducedMotion, selectScene]);

  useEffect(
    () => () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    },
    [],
  );

  return (
    <section
      className={styles.section}
      data-language={language}
      id="journey-story"
      ref={sectionRef}
      aria-labelledby="cinematic-journey-title"
    >
      <header className={styles.sectionHeader}>
        <div>
          <p>{sectionCopy.eyebrow}</p>
          <h2 id="cinematic-journey-title">{sectionCopy.title}</h2>
        </div>
      </header>

      <div className={styles.stage}>
        <div
          className={styles.visual}
          aria-label={`${sectionCopy.sceneLabel}: ${activeScene.title[language]}, ${activeScene.subtitle[language]}`}
        >
          {outgoingScene ? (
            <div className={`${styles.sceneLayer} ${styles.outgoingScene}`}>
              <SceneImage scene={outgoingScene} />
            </div>
          ) : null}
          <div
            className={`${styles.sceneLayer} ${styles.activeScene}`}
            key={`${activeScene.id}-${cycleKey}`}
          >
            <SceneImage scene={activeScene} priority={activeIndex === 0} />
          </div>

          <div className={styles.readabilityVeil} aria-hidden="true" />

          <div className={styles.sceneTitle} aria-live="polite">
            <span>
              {String(activeIndex + 1).padStart(2, "0")} / {String(cinematicJourneyScenes.length).padStart(2, "0")}
            </span>
            <h3>{activeScene.title[language]}</h3>
            <p>{activeScene.subtitle[language]}</p>
          </div>

          <nav className={styles.indicators} aria-label={sectionCopy.sceneNavigation}>
            {cinematicJourneyScenes.map((scene, index) => (
              <button
                aria-current={index === activeIndex ? "true" : undefined}
                aria-label={sectionCopy.showScene(scene.title[language])}
                className={styles.indicator}
                data-active={index === activeIndex}
                key={scene.id}
                onClick={() => selectScene(index)}
                type="button"
              >
                <span />
              </button>
            ))}
          </nav>
        </div>

        <AppLiquidGlass
          variant="imageInfo"
          className={styles.informationPanel}
          contentClassName={styles.informationPanelContent}
        >
          <article className={styles.introCard}>
            <h3>{sectionCopy.introTitle}</h3>
            <p className={styles.introduction}>{introduction}</p>
          </article>

          <section className={styles.statsCard} aria-label={sectionCopy.introTitle}>
            {metrics.map((metric) => (
              <div className={styles.stat} key={metric.label}>
                <strong>{metric.value}</strong>
                <span>{metric.label}</span>
              </div>
            ))}
          </section>
        </AppLiquidGlass>
      </div>
    </section>
  );
}
