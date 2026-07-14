"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CinematicTravelScene } from "./CinematicTravelScene";
import { PrototypeControls } from "./PrototypeControls";
import { TravelIntroCard, TravelStatsCard } from "./TravelCards";
import { travelScenes } from "./travelScenes";
import {
  sceneTimeline,
  speedFactors,
  type PrototypeSpeed,
} from "./vehicleMotionConfig";
import styles from "./CinematicRoadTripPrototype.module.css";

export function CinematicRoadTripPrototype() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [outgoingIndex, setOutgoingIndex] = useState<number | null>(null);
  const [runId, setRunId] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<PrototypeSpeed>("normal");
  const [environmentMotion, setEnvironmentMotion] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isInView, setIsInView] = useState(true);

  const stageRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(0);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingMsRef = useRef<number>(sceneTimeline.totalMs);
  const timerStartedAtRef = useRef(0);

  const speedFactor = speedFactors[speed];
  const effectivePaused = paused || !isInView || reducedMotion;
  const activeScene = travelScenes[activeIndex];
  const outgoingScene = outgoingIndex === null ? null : travelScenes[outgoingIndex];
  const timings = useMemo(
    () => ({
      totalMs: sceneTimeline.totalMs / speedFactor,
      transitionMs: sceneTimeline.transitionMs / speedFactor,
      vehicleDelaySeconds: sceneTimeline.vehicleDelayMs / speedFactor / 1000,
      vehicleDurationSeconds: sceneTimeline.vehicleDurationMs / speedFactor / 1000,
      sceneDurationSeconds: sceneTimeline.totalMs / speedFactor / 1000,
    }),
    [speedFactor],
  );

  const clearAutoTimer = useCallback(() => {
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
  }, []);

  const clearTransitionTimer = useCallback(() => {
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }, []);

  const switchScene = useCallback(
    (nextIndex: number) => {
      const normalizedIndex = (nextIndex + travelScenes.length) % travelScenes.length;
      const currentIndex = activeIndexRef.current;

      clearAutoTimer();
      clearTransitionTimer();

      if (normalizedIndex !== currentIndex) {
        setOutgoingIndex(currentIndex);
        activeIndexRef.current = normalizedIndex;
        setActiveIndex(normalizedIndex);
        transitionTimerRef.current = setTimeout(
          () => setOutgoingIndex(null),
          timings.transitionMs,
        );
      }

      remainingMsRef.current = timings.totalMs;
      setRunId((value) => value + 1);
    },
    [clearAutoTimer, clearTransitionTimer, timings.totalMs, timings.transitionMs],
  );

  const startAutoTimer = useCallback(() => {
    clearAutoTimer();
    if (effectivePaused) return;

    timerStartedAtRef.current = performance.now();
    autoTimerRef.current = setTimeout(() => {
      switchScene(activeIndexRef.current + 1);
    }, Math.max(0, remainingMsRef.current));
  }, [clearAutoTimer, effectivePaused, switchScene]);

  const pauseAutoTimer = useCallback(() => {
    if (!autoTimerRef.current) return;
    const elapsed = performance.now() - timerStartedAtRef.current;
    remainingMsRef.current = Math.max(0, remainingMsRef.current - elapsed);
    clearAutoTimer();
  }, [clearAutoTimer]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setReducedMotion(media.matches);
    syncPreference();
    media.addEventListener("change", syncPreference);
    return () => media.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting && entry.intersectionRatio >= 0.2),
      { threshold: [0, 0.2, 0.5] },
    );
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const nextScene = travelScenes[(activeIndex + 1) % travelScenes.length];
    const image = new window.Image();
    image.src = nextScene.backgroundImage;
  }, [activeIndex]);

  useEffect(() => {
    remainingMsRef.current = timings.totalMs;
    if (!effectivePaused) startAutoTimer();
    return clearAutoTimer;
  }, [activeIndex, runId, speed, timings.totalMs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (effectivePaused) {
      pauseAutoTimer();
    } else {
      startAutoTimer();
    }
  }, [effectivePaused, pauseAutoTimer, startAutoTimer]);

  useEffect(
    () => () => {
      clearAutoTimer();
      clearTransitionTimer();
    },
    [clearAutoTimer, clearTransitionTimer],
  );

  const handleRestart = () => {
    clearAutoTimer();
    remainingMsRef.current = timings.totalMs;
    setRunId((value) => value + 1);
  };

  const handleSpeedChange = (nextSpeed: PrototypeSpeed) => {
    setSpeed(nextSpeed);
    setRunId((value) => value + 1);
  };

  return (
    <main className={styles.pageShell}>
      <header className={styles.prototypeHeader}>
        <div>
          <p>Independent visual prototype · 2026</p>
          <h1>A road trip told in light.</h1>
          <span>Three landscapes. One white Model Y. A quiet loop across America.</span>
        </div>
        <div className={styles.headerBadge} aria-hidden="true">
          <span>Cinematic scene study</span>
          <strong>01—03</strong>
        </div>
      </header>

      <div className={styles.prototypeStage} ref={stageRef}>
        <div className={styles.informationPanel}>
          <TravelIntroCard />
          <TravelStatsCard />
        </div>

        <CinematicTravelScene
          activeScene={activeScene}
          outgoingScene={outgoingScene}
          activeIndex={activeIndex}
          runId={runId}
          paused={effectivePaused}
          reducedMotion={reducedMotion}
          environmentMotion={environmentMotion}
          sceneDurationSeconds={timings.sceneDurationSeconds}
          vehicleDelaySeconds={timings.vehicleDelaySeconds}
          vehicleDurationSeconds={timings.vehicleDurationSeconds}
          onSceneChange={switchScene}
        />
      </div>

      <PrototypeControls
        activeIndex={activeIndex}
        paused={paused}
        speed={speed}
        environmentMotion={environmentMotion}
        reducedMotion={reducedMotion}
        onSceneChange={switchScene}
        onPauseChange={setPaused}
        onRestart={handleRestart}
        onSpeedChange={handleSpeedChange}
        onEnvironmentMotionChange={setEnvironmentMotion}
      />

      <footer className={styles.prototypeFooter}>
        <span>Local assets · Mock statistics · No production data</span>
        <span>New York / California / Utah</span>
      </footer>
    </main>
  );
}
