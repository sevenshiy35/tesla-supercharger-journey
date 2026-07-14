import type { TravelScene } from "./travelScenes";
import { AnimatedModelY } from "./AnimatedModelY";
import { SceneIndicators, SceneTitle } from "./SceneChrome";
import { SceneTransition } from "./SceneTransition";
import styles from "./CinematicRoadTripPrototype.module.css";

type CinematicTravelSceneProps = {
  activeScene: TravelScene;
  outgoingScene: TravelScene | null;
  activeIndex: number;
  runId: number;
  paused: boolean;
  reducedMotion: boolean;
  environmentMotion: boolean;
  sceneDurationSeconds: number;
  vehicleDelaySeconds: number;
  vehicleDurationSeconds: number;
  onSceneChange: (index: number) => void;
};

export function CinematicTravelScene({
  activeScene,
  outgoingScene,
  activeIndex,
  runId,
  paused,
  reducedMotion,
  environmentMotion,
  sceneDurationSeconds,
  vehicleDelaySeconds,
  vehicleDurationSeconds,
  onSceneChange,
}: CinematicTravelSceneProps) {
  const motionEnabled = environmentMotion && !reducedMotion;

  return (
    <section
      className={styles.sceneViewport}
      data-scene={activeScene.id}
      aria-label={`${activeScene.title}: ${activeScene.subtitle}`}
    >
      <SceneTransition
        activeScene={activeScene}
        outgoingScene={outgoingScene}
        runId={runId}
        paused={paused}
        sceneDurationSeconds={sceneDurationSeconds}
      />
      <div
        className={styles.environmentLayer}
        data-scene={activeScene.id}
        data-motion={motionEnabled}
        data-paused={paused}
        aria-hidden="true"
      />
      <AnimatedModelY
        scene={activeScene}
        runId={runId}
        paused={paused}
        reducedMotion={reducedMotion}
        delaySeconds={vehicleDelaySeconds}
        durationSeconds={vehicleDurationSeconds}
      />
      <div className={styles.readabilityVeil} aria-hidden="true" />
      <SceneTitle scene={activeScene} activeIndex={activeIndex} />
      <SceneIndicators activeIndex={activeIndex} onSceneChange={onSceneChange} />
    </section>
  );
}
