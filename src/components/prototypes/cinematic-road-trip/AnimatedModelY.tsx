import Image from "next/image";
import type { CSSProperties } from "react";
import type { TravelScene } from "./travelScenes";
import styles from "./CinematicRoadTripPrototype.module.css";

type AnimatedModelYProps = {
  scene: TravelScene;
  runId: number;
  paused: boolean;
  reducedMotion: boolean;
  delaySeconds: number;
  durationSeconds: number;
};

type MotionStyle = CSSProperties & {
  "--vehicle-delay": string;
  "--vehicle-duration": string;
};

export function AnimatedModelY({
  scene,
  runId,
  paused,
  reducedMotion,
  delaySeconds,
  durationSeconds,
}: AnimatedModelYProps) {
  const motionStyle: MotionStyle = {
    "--vehicle-delay": `${delaySeconds}s`,
    "--vehicle-duration": `${durationSeconds}s`,
  };

  return (
    <div className={styles.vehicleLayer} aria-hidden="true">
      <div
        className={styles.vehicleMotion}
        data-scene={scene.id}
        data-paused={paused}
        data-reduced-motion={reducedMotion}
        key={`${scene.id}-${runId}`}
        style={motionStyle}
      >
        <div className={styles.vehicleSuspension}>
          <Image
            className={styles.vehicleImage}
            src={scene.vehicleImage}
            alt=""
            width={960}
            height={scene.vehicleHeight}
            sizes="(max-width: 760px) 120px, 180px"
          />
        </div>
      </div>
    </div>
  );
}
