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

type RouteId = "charge" | "north" | "south" | "crossroads";
type MotionPhase = "drive" | "reverse" | "connecting" | "charging" | "depart" | "reset";
interface ImagePoint {
  x: number;
  y: number;
}

interface MotionSample extends ImagePoint {
  direction: Direction;
  moving: boolean;
  phase: MotionPhase;
}

const ART_WIDTH = 1819;
const ART_HEIGHT = 865;
const MOBILE_BREAKPOINT = 700;

const ROUTE_DURATION: Record<RouteId, number> = {
  charge: 30_000,
  north: 17_000,
  south: 18_500,
  crossroads: 10_000,
};

const DESKTOP_ROUTE_SEQUENCE: RouteId[] = ["charge", "north", "south", "crossroads"];
const MOBILE_ROUTE_SEQUENCE: RouteId[] = ["charge", "south", "crossroads"];

const CHARGE_APPROACH_END = 9_500;
const CHARGE_REVERSE_END = 12_000;
const CABLE_START = 12_000;
const CABLE_CONNECTED = 13_500;
const CHARGE_ICON_START = 13_300;
const CHARGE_END = 20_500;
const DEPARTURE_START = 21_000;
const DEPARTURE_END = 28_500;

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

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const easeInOutCubic = (value: number) =>
  value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;

function directionFromVector(dx: number, dy: number): Direction {
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  if (angle >= -22.5 && angle < 22.5) return "right";
  if (angle >= 22.5 && angle < 90) return "down-right";
  if (angle >= 90 && angle < 157.5) return "down-left";
  if (angle >= 157.5 || angle < -157.5) return "left";
  if (angle >= -157.5 && angle < -90) return "up-left";
  return "up-right";
}

function sampleSvgPath(path: SVGPathElement, progress: number, phase: MotionPhase): MotionSample {
  const length = path.getTotalLength();
  const distance = clamp(progress) * length;
  const point = path.getPointAtLength(distance);
  const tangentWindow = Math.max(2, length * 0.006);
  const before = path.getPointAtLength(Math.max(0, distance - tangentWindow));
  const after = path.getPointAtLength(Math.min(length, distance + tangentWindow));

  return {
    x: point.x,
    y: point.y,
    direction: directionFromVector(after.x - before.x, after.y - before.y),
    moving: true,
    phase,
  };
}

function mapImagePoint(point: ImagePoint, scene: HTMLDivElement, mobile: boolean) {
  const rect = scene.getBoundingClientRect();
  const scale = Math.max(rect.width / ART_WIDTH, rect.height / ART_HEIGHT);
  const renderedWidth = ART_WIDTH * scale;
  const renderedHeight = ART_HEIGHT * scale;
  const horizontalPosition = mobile ? 0.86 : 0.5;

  return {
    x: (rect.width - renderedWidth) * horizontalPosition + point.x * scale,
    y: (rect.height - renderedHeight) * 0.5 + point.y * scale,
    scale,
  };
}

function sampleChargeRoute(
  elapsed: number,
  paths: Record<"chargeApproach" | "chargeReverse" | "chargeDepart", SVGPathElement>,
): MotionSample {
  if (elapsed < CHARGE_APPROACH_END) {
    return sampleSvgPath(
      paths.chargeApproach,
      easeInOutCubic(elapsed / CHARGE_APPROACH_END),
      "drive",
    );
  }

  if (elapsed < CHARGE_REVERSE_END) {
    const sample = sampleSvgPath(
      paths.chargeReverse,
      easeInOutCubic((elapsed - CHARGE_APPROACH_END) / (CHARGE_REVERSE_END - CHARGE_APPROACH_END)),
      "reverse",
    );

    // The position travels up-left while the car keeps facing out of the stall.
    return { ...sample, direction: "down-right" };
  }

  if (elapsed < DEPARTURE_START) {
    const parked = paths.chargeReverse.getPointAtLength(paths.chargeReverse.getTotalLength());
    return {
      x: parked.x,
      y: parked.y,
      direction: "down-right",
      moving: false,
      phase: elapsed < CABLE_CONNECTED ? "connecting" : "charging",
    };
  }

  if (elapsed < DEPARTURE_END) {
    return sampleSvgPath(
      paths.chargeDepart,
      easeInOutCubic((elapsed - DEPARTURE_START) / (DEPARTURE_END - DEPARTURE_START)),
      "depart",
    );
  }

  const finalPoint = paths.chargeDepart.getPointAtLength(paths.chargeDepart.getTotalLength());
  return {
    x: finalPoint.x,
    y: finalPoint.y,
    direction: "left",
    moving: false,
    phase: "reset",
  };
}

function normalRouteProgress(elapsed: number, duration: number) {
  const driveDuration = duration - 1_200;
  return easeInOutCubic(clamp(elapsed / driveDuration));
}

export function JourneyRoadAnimation() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const carRef = useRef<HTMLDivElement>(null);
  const chargerRef = useRef<HTMLDivElement>(null);
  const cableRef = useRef<HTMLDivElement>(null);
  const chargeIconRef = useRef<HTMLDivElement>(null);

  const chargeApproachRef = useRef<SVGPathElement>(null);
  const chargeReverseRef = useRef<SVGPathElement>(null);
  const chargeDepartRef = useRef<SVGPathElement>(null);
  const northRef = useRef<SVGPathElement>(null);
  const southRef = useRef<SVGPathElement>(null);
  const crossroadsRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    directions.forEach((direction) => {
      for (let frame = 0; frame < 3; frame += 1) {
        const image = new window.Image();
        image.src = spritePath(direction, frame);
      }
    });

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrame = 0;
    let routeIndex = 0;
    let routeStartedAt = performance.now();
    let previousMobile = window.innerWidth <= MOBILE_BREAKPOINT;
    const query = new URLSearchParams(window.location.search);
    const requestedRoute = query.get("journeyRoute");
    const forcedRoute = (["charge", "north", "south", "crossroads"] as RouteId[]).includes(
      requestedRoute as RouteId,
    )
      ? (requestedRoute as RouteId)
      : null;
    const requestedTime = query.get("journeyTime");
    const parsedTime = requestedTime === null ? Number.NaN : Number(requestedTime);
    const forcedElapsed = Number.isFinite(parsedTime) ? Math.max(0, parsedTime) : null;

    const getPaths = () => {
      const chargeApproach = chargeApproachRef.current;
      const chargeReverse = chargeReverseRef.current;
      const chargeDepart = chargeDepartRef.current;
      const north = northRef.current;
      const south = southRef.current;
      const crossroads = crossroadsRef.current;

      if (!chargeApproach || !chargeReverse || !chargeDepart || !north || !south || !crossroads) {
        return null;
      }

      return { chargeApproach, chargeReverse, chargeDepart, north, south, crossroads };
    };

    const placeChargingHardware = (scene: HTMLDivElement, mobile: boolean) => {
      const charger = chargerRef.current;
      const cable = cableRef.current;
      if (!charger || !cable) return;

      const chargerPoint = mapImagePoint({ x: 1306, y: 394 }, scene, mobile);
      const cablePoint = mapImagePoint({ x: 1340, y: 413 }, scene, mobile);

      charger.style.left = `${chargerPoint.x}px`;
      charger.style.top = `${chargerPoint.y}px`;
      charger.style.width = `${clamp(50 * chargerPoint.scale, mobile ? 30 : 38, 58)}px`;

      cable.style.left = `${cablePoint.x}px`;
      cable.style.top = `${cablePoint.y}px`;
      cable.style.width = `${clamp(80 * cablePoint.scale, 68, 98)}px`;
    };

    const renderParkedState = (mobile: boolean) => {
      const scene = sceneRef.current;
      const car = carRef.current;
      const cable = cableRef.current;
      const chargeIcon = chargeIconRef.current;
      const paths = getPaths();
      if (!scene || !car || !cable || !chargeIcon || !paths) return;

      const parked = paths.chargeReverse.getPointAtLength(paths.chargeReverse.getTotalLength());
      const mapped = mapImagePoint(parked, scene, mobile);
      placeChargingHardware(scene, mobile);

      car.style.left = `${mapped.x}px`;
      car.style.top = `${mapped.y}px`;
      car.style.opacity = "1";
      car.style.backgroundImage = `url("${spritePath("down-right", 0)}")`;
      car.dataset.direction = "down-right";
      car.dataset.frame = "0";
      car.dataset.phase = "charging";

      cable.style.opacity = "1";
      cable.style.clipPath = "inset(0)";

      chargeIcon.style.left = `${mapped.x}px`;
      chargeIcon.style.top = `${mapped.y - clamp(72 * mapped.scale, 44, 78)}px`;
      chargeIcon.dataset.visible = "true";

      scene.dataset.route = "charge";
      scene.dataset.phase = "charging";
    };

    const tick = (now: number) => {
      const scene = sceneRef.current;
      const car = carRef.current;
      const cable = cableRef.current;
      const chargeIcon = chargeIconRef.current;
      const paths = getPaths();
      if (!scene || !car || !cable || !chargeIcon || !paths) return;

      const mobile = window.innerWidth <= MOBILE_BREAKPOINT;
      if (reducedMotion.matches) {
        renderParkedState(mobile);
        return;
      }

      const routeSequence = mobile ? MOBILE_ROUTE_SEQUENCE : DESKTOP_ROUTE_SEQUENCE;
      if (mobile !== previousMobile) {
        routeIndex = 0;
        routeStartedAt = now;
        previousMobile = mobile;
      }

      let route = forcedRoute ?? routeSequence[routeIndex % routeSequence.length];
      let elapsed = forcedElapsed ?? now - routeStartedAt;
      while (!forcedRoute && elapsed >= ROUTE_DURATION[route]) {
        routeStartedAt += ROUTE_DURATION[route];
        routeIndex = (routeIndex + 1) % routeSequence.length;
        route = routeSequence[routeIndex];
        elapsed = now - routeStartedAt;
      }

      elapsed %= ROUTE_DURATION[route];

      let motion: MotionSample;
      if (route === "charge") {
        motion = sampleChargeRoute(elapsed, paths);
      } else {
        motion = sampleSvgPath(
          paths[route],
          normalRouteProgress(elapsed, ROUTE_DURATION[route]),
          "drive",
        );
      }

      const mapped = mapImagePoint(motion, scene, mobile);
      const routeFadeOutAt = ROUTE_DURATION[route] - 1_000;
      const opacity =
        elapsed < 450
          ? clamp(elapsed / 450)
          : elapsed > routeFadeOutAt
            ? 1 - clamp((elapsed - routeFadeOutAt) / 850)
            : 1;
      const spriteFrame = motion.moving
        ? Math.floor(elapsed / (motion.phase === "reverse" ? 220 : 150)) % 3
        : 0;

      car.style.left = `${mapped.x}px`;
      car.style.top = `${mapped.y}px`;
      car.style.opacity = `${opacity}`;
      car.style.backgroundImage = `url("${spritePath(motion.direction, spriteFrame)}")`;
      car.dataset.direction = motion.direction;
      car.dataset.frame = `${spriteFrame}`;
      car.dataset.phase = motion.phase;

      placeChargingHardware(scene, mobile);

      const cableProgress =
        route !== "charge" || elapsed < CABLE_START
          ? 0
          : elapsed < CABLE_CONNECTED
            ? clamp((elapsed - CABLE_START) / (CABLE_CONNECTED - CABLE_START))
            : elapsed < CHARGE_END
              ? 1
              : 1 - clamp((elapsed - CHARGE_END) / (DEPARTURE_START - CHARGE_END));

      cable.style.opacity = cableProgress > 0 ? "1" : "0";
      cable.style.clipPath = `inset(0 0 0 ${100 - cableProgress * 100}%)`;

      const iconVisible =
        route === "charge" && elapsed >= CHARGE_ICON_START && elapsed < CHARGE_END;
      chargeIcon.style.left = `${mapped.x}px`;
      chargeIcon.style.top = `${mapped.y - clamp(72 * mapped.scale, 44, 78)}px`;
      chargeIcon.dataset.visible = iconVisible ? "true" : "false";

      scene.dataset.route = route;
      scene.dataset.phase = motion.phase;
      animationFrame = window.requestAnimationFrame(tick);
    };

    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, []);

  return (
    <div ref={sceneRef} aria-hidden className={styles.scene} data-route="charge" data-phase="drive">
      <Image
        src="/images/journey-animation/route-atlas-background-v2.png"
        alt=""
        fill
        priority
        className={styles.background}
        sizes="100vw"
      />

      <div className={styles.readabilityWash} />

      <svg className={styles.motionPaths} viewBox={`0 0 ${ART_WIDTH} ${ART_HEIGHT}`}>
        <path
          ref={chargeApproachRef}
          data-path-id="charge-approach"
          d="M 1819 135 L 1425 135 L 1425 235 C 1425 275 1460 295 1510 322 L 1575 356 C 1600 370 1608 392 1608 425 L 1608 530 C 1608 555 1592 570 1550 590"
        />
        <path
          ref={chargeReverseRef}
          data-path-id="charge-reverse"
          d="M 1550 590 C 1572 574 1590 560 1605 552 C 1545 523 1465 480 1360 420"
        />
        <path
          ref={chargeDepartRef}
          data-path-id="charge-depart"
          d="M 1360 420 C 1455 478 1535 520 1605 555 C 1560 605 1450 623 1415 655 C 1385 685 1455 700 1505 725 C 1530 738 1536 760 1536 812 L 1408 817"
        />
        <path
          ref={northRef}
          data-path-id="north-route"
          d="M 90 770 L 90 470 C 90 445 105 435 130 435 L 180 435 C 195 435 200 425 200 408 L 200 315 C 200 295 208 282 225 271 L 550 70 L 1015 70 C 1065 70 1080 82 1110 112 C 1125 127 1145 135 1170 135 L 1819 135"
        />
        <path
          ref={southRef}
          data-path-id="south-route"
          d="M 1425 0 L 1425 220 C 1425 238 1428 250 1438 257 L 1580 335 C 1598 345 1608 355 1608 375 L 1608 510 C 1608 535 1600 552 1580 562 L 1432 625 C 1405 642 1405 657 1432 671 L 1495 702 C 1520 714 1536 730 1536 760 L 1536 817 L 1408 817 L 606 815 C 575 790 560 780 520 780 L 145 780 C 110 780 90 765 90 735 L 90 445"
        />
        <path
          ref={crossroadsRef}
          data-path-id="crossroads-route"
          d="M 1425 0 L 1425 135 L 1819 135"
        />
      </svg>

      <div ref={chargerRef} className={styles.charger}>
        <Image
          src="/images/journey-animation/supercharger-sprite.png"
          alt=""
          width={489}
          height={953}
          className={styles.spriteImage}
        />
      </div>

      <div
        ref={carRef}
        className={styles.car}
        data-direction="left"
        data-frame="0"
        data-phase="drive"
      />

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
