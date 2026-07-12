"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import styles from "./JourneyRoadAnimation.module.css";

type Direction =
  | "left"
  | "right"
  | "up-left"
  | "up-right"
  | "down-left"
  | "down-right";

type MotionPhase = "drive" | "turn-in" | "reverse" | "depart";

interface MotionSegment {
  start: number;
  end: number;
  from: [number, number];
  to: [number, number];
  direction: Direction;
  phase: MotionPhase;
}

const LOOP_DURATION = 34_500;
const PARKED_AT = 14_500;
const CABLE_START = 15_000;
const CABLE_END = 16_500;
const CHARGE_ICON_START = 16_200;
const CHARGE_END = 22_500;
const DEPARTURE_START = 23_000;
const FADE_START = 33_000;

const directions: Direction[] = [
  "left",
  "right",
  "up-left",
  "up-right",
  "down-left",
  "down-right",
];

const spritePath = (direction: Direction, frame: number) =>
  `/images/journey-animation/car6-${direction}-${frame}.png`;

const desktopSegments: MotionSegment[] = [
  { start: 0, end: 1800, from: [94, 97], to: [91, 84], direction: "up-left", phase: "drive" },
  { start: 1800, end: 3600, from: [91, 84], to: [87, 72], direction: "up-left", phase: "drive" },
  { start: 3600, end: 5200, from: [87, 72], to: [86, 61], direction: "up-left", phase: "drive" },
  { start: 5200, end: 6800, from: [86, 61], to: [90, 52], direction: "up-right", phase: "drive" },
  { start: 6800, end: 8500, from: [90, 52], to: [87, 46], direction: "up-left", phase: "drive" },
  { start: 8500, end: 10_000, from: [87, 46], to: [82, 43], direction: "left", phase: "turn-in" },
  { start: 10_000, end: 11_500, from: [82, 43], to: [78.5, 41.5], direction: "up-left", phase: "turn-in" },
  // The car keeps facing up-left while its position moves down-right: this is the reverse-parking beat.
  { start: 11_500, end: PARKED_AT, from: [78.5, 41.5], to: [80.8, 45.5], direction: "up-left", phase: "reverse" },
  { start: DEPARTURE_START, end: 24_500, from: [80.8, 45.5], to: [87, 46], direction: "right", phase: "depart" },
  { start: 24_500, end: 26_500, from: [87, 46], to: [90, 55], direction: "down-right", phase: "depart" },
  { start: 26_500, end: 28_500, from: [90, 55], to: [87, 65], direction: "down-left", phase: "depart" },
  { start: 28_500, end: 31_000, from: [87, 65], to: [91, 78], direction: "down-right", phase: "depart" },
  { start: 31_000, end: FADE_START, from: [91, 78], to: [95, 94], direction: "down-right", phase: "depart" },
];

const mobileSegments: MotionSegment[] = [
  { start: 0, end: 2200, from: [98, 91], to: [94, 72], direction: "up-left", phase: "drive" },
  { start: 2200, end: 4500, from: [94, 72], to: [92, 59], direction: "up-left", phase: "drive" },
  { start: 4500, end: 6500, from: [92, 59], to: [94, 50], direction: "up-right", phase: "drive" },
  { start: 6500, end: 8500, from: [94, 50], to: [88, 45], direction: "up-left", phase: "drive" },
  { start: 8500, end: 10_000, from: [88, 45], to: [80, 42], direction: "left", phase: "turn-in" },
  { start: 10_000, end: 11_500, from: [80, 42], to: [72, 40.5], direction: "up-left", phase: "turn-in" },
  { start: 11_500, end: PARKED_AT, from: [72, 40.5], to: [74, 44], direction: "up-left", phase: "reverse" },
  { start: DEPARTURE_START, end: 24_500, from: [74, 44], to: [88, 45], direction: "right", phase: "depart" },
  { start: 24_500, end: 27_000, from: [88, 45], to: [94, 57], direction: "down-right", phase: "depart" },
  { start: 27_000, end: 29_500, from: [94, 57], to: [91, 70], direction: "down-left", phase: "depart" },
  { start: 29_500, end: FADE_START, from: [91, 70], to: [98, 90], direction: "down-right", phase: "depart" },
];

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const easeInOut = (value: number) =>
  value < 0.5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2;

function sampleMotion(elapsed: number, segments: MotionSegment[]) {
  const segment = segments.find(({ start, end }) => elapsed >= start && elapsed < end);

  if (!segment) {
    if (elapsed >= PARKED_AT && elapsed < DEPARTURE_START) {
      const parkedX = segments === mobileSegments ? 74 : 80.8;
      const parkedY = segments === mobileSegments ? 44 : 45.5;
      return {
        x: parkedX,
        y: parkedY,
        direction: "up-left",
        phase: "parked",
        moving: false,
      } as const;
    }

    const finalSegment = segments[segments.length - 1];
    return {
      x: finalSegment.to[0],
      y: finalSegment.to[1],
      direction: finalSegment.direction,
      phase: elapsed < FADE_START ? "parked" : "reset",
      moving: false,
    } as const;
  }

  const progress = easeInOut(clamp((elapsed - segment.start) / (segment.end - segment.start)));
  return {
    x: segment.from[0] + (segment.to[0] - segment.from[0]) * progress,
    y: segment.from[1] + (segment.to[1] - segment.from[1]) * progress,
    direction: segment.direction,
    phase: segment.phase,
    moving: true,
  } as const;
}

export function JourneyRoadAnimation() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const carRef = useRef<HTMLDivElement>(null);
  const cableRef = useRef<HTMLDivElement>(null);
  const chargeIconRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    directions.forEach((direction) => {
      for (let frame = 0; frame < 3; frame += 1) {
        const image = new window.Image();
        image.src = spritePath(direction, frame);
      }
    });

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrame = 0;
    const startedAt = performance.now();

    const renderParkedState = (mobile: boolean) => {
      const car = carRef.current;
      const cable = cableRef.current;
      const chargeIcon = chargeIconRef.current;
      const scene = sceneRef.current;
      if (!car || !cable || !chargeIcon || !scene) return;

      const x = mobile ? 74 : 80.8;
      const y = mobile ? 44 : 45.5;
      car.style.left = `${x}%`;
      car.style.top = `${y}%`;
      car.style.opacity = "1";
      car.style.backgroundImage = `url("${spritePath("up-left", 0)}")`;
      car.dataset.direction = "up-left";
      car.dataset.frame = "0";
      car.dataset.phase = "charging";
      cable.style.opacity = "1";
      cable.style.clipPath = "inset(0)";
      chargeIcon.style.left = `${x}%`;
      chargeIcon.style.top = `${y - (mobile ? 4 : 8)}%`;
      chargeIcon.dataset.visible = "true";
      scene.dataset.phase = "charging";
    };

    const tick = (now: number) => {
      const car = carRef.current;
      const cable = cableRef.current;
      const chargeIcon = chargeIconRef.current;
      const scene = sceneRef.current;
      if (!car || !cable || !chargeIcon || !scene) return;

      const mobile = window.innerWidth <= 700;
      if (reducedMotion.matches) {
        renderParkedState(mobile);
        return;
      }

      const elapsed = (now - startedAt) % LOOP_DURATION;
      const motion = sampleMotion(elapsed, mobile ? mobileSegments : desktopSegments);
      const spriteFrame = motion.moving ? Math.floor(elapsed / (motion.phase === "reverse" ? 210 : 145)) % 3 : 0;
      const charging = elapsed >= CABLE_END && elapsed < CHARGE_END;
      const connecting = elapsed >= PARKED_AT && elapsed < CABLE_END;
      const phase = charging ? "charging" : connecting ? "connecting" : motion.phase;

      car.style.left = `${motion.x}%`;
      car.style.top = `${motion.y}%`;
      car.style.backgroundImage = `url("${spritePath(motion.direction, spriteFrame)}")`;
      car.style.opacity = `${
        elapsed < 500 ? clamp(elapsed / 500) : elapsed >= FADE_START ? 1 - clamp((elapsed - FADE_START) / 1500) : 1
      }`;
      car.dataset.direction = motion.direction;
      car.dataset.frame = `${spriteFrame}`;
      car.dataset.phase = phase;

      const cableProgress =
        elapsed < CABLE_END
          ? clamp((elapsed - CABLE_START) / (CABLE_END - CABLE_START))
          : elapsed < CHARGE_END
            ? 1
            : 1 - clamp((elapsed - CHARGE_END) / (DEPARTURE_START - CHARGE_END));
      cable.style.opacity = cableProgress > 0 ? "1" : "0";
      cable.style.clipPath = `inset(0 0 0 ${100 - cableProgress * 100}%)`;

      const iconVisible = elapsed >= CHARGE_ICON_START && elapsed < CHARGE_END;
      chargeIcon.style.left = `${motion.x}%`;
      chargeIcon.style.top = `${motion.y - (mobile ? 4 : 8)}%`;
      chargeIcon.dataset.visible = iconVisible ? "true" : "false";
      scene.dataset.phase = phase;

      animationFrame = window.requestAnimationFrame(tick);
    };

    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, []);

  return (
    <div ref={sceneRef} aria-hidden className={styles.scene} data-phase="drive">
      <Image
        src="/images/journey-animation/road-map-parking-background.png"
        alt=""
        fill
        priority
        className={styles.background}
        sizes="100vw"
      />

      <div className={styles.readabilityWash} />

      <div className={styles.charger}>
        <Image
          src="/images/journey-animation/supercharger-sprite.png"
          alt=""
          width={489}
          height={953}
          className={styles.spriteImage}
        />
      </div>

      <div ref={carRef} className={styles.car} data-direction="up-left" data-frame="0" data-phase="drive" />

      <div ref={cableRef} className={styles.cable}>
        <Image
          src="/images/journey-animation/charging-cable-sprite.png"
          alt=""
          width={1405}
          height={469}
          className={styles.spriteImage}
        />
      </div>

      <div ref={chargeIconRef} className={styles.chargeIcon} data-visible="false" />
    </div>
  );
}
