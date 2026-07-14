import Image from "next/image";
import type { CSSProperties } from "react";
import type { TravelScene } from "./travelScenes";
import styles from "./CinematicRoadTripPrototype.module.css";

type BackgroundProps = {
  scene: TravelScene;
  state: "active" | "outgoing";
  runId: number;
  paused: boolean;
  sceneDurationSeconds: number;
  priority?: boolean;
};

type SceneImageStyle = CSSProperties & {
  "--desktop-position": string;
  "--mobile-position": string;
  "--scene-duration": string;
};

function TravelSceneBackground({
  scene,
  state,
  runId,
  paused,
  sceneDurationSeconds,
  priority = false,
}: BackgroundProps) {
  const imageStyle: SceneImageStyle = {
    "--desktop-position": scene.backgroundPosition,
    "--mobile-position": scene.mobileBackgroundPosition,
    "--scene-duration": `${sceneDurationSeconds}s`,
  };

  return (
    <div
      className={styles.sceneBackdrop}
      data-scene={scene.id}
      data-state={state}
      data-paused={paused}
      key={`${scene.id}-${state}-${runId}`}
      aria-hidden="true"
    >
      <Image
        className={`${styles.sceneImage} ${scene.mobileBackgroundImage ? styles.desktopSceneImage : ""}`}
        src={scene.backgroundImage}
        alt=""
        fill
        priority={priority}
        sizes="(max-width: 760px) 100vw, 94vw"
        style={imageStyle}
      />
      {scene.mobileBackgroundImage ? (
        <Image
          className={`${styles.sceneImage} ${styles.mobileSceneImage}`}
          src={scene.mobileBackgroundImage}
          alt=""
          fill
          sizes="(max-width: 760px) 100vw, 1px"
          style={imageStyle}
        />
      ) : null}
    </div>
  );
}

type SceneTransitionProps = {
  activeScene: TravelScene;
  outgoingScene: TravelScene | null;
  runId: number;
  paused: boolean;
  sceneDurationSeconds: number;
};

export function SceneTransition({
  activeScene,
  outgoingScene,
  runId,
  paused,
  sceneDurationSeconds,
}: SceneTransitionProps) {
  return (
    <div className={styles.backgroundStack}>
      {outgoingScene ? (
        <TravelSceneBackground
          scene={outgoingScene}
          state="outgoing"
          runId={runId}
          paused={paused}
          sceneDurationSeconds={sceneDurationSeconds}
        />
      ) : null}
      <TravelSceneBackground
        scene={activeScene}
        state="active"
        runId={runId}
        paused={paused}
        sceneDurationSeconds={sceneDurationSeconds}
        priority={activeScene.id === "new-york"}
      />
    </div>
  );
}
