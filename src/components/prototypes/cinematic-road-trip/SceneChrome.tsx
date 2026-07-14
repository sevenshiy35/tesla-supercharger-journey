import type { TravelScene } from "./travelScenes";
import { travelScenes } from "./travelScenes";
import styles from "./CinematicRoadTripPrototype.module.css";

type SceneChromeProps = {
  scene: TravelScene;
  activeIndex: number;
  onSceneChange: (index: number) => void;
};

export function SceneTitle({ scene, activeIndex }: Omit<SceneChromeProps, "onSceneChange">) {
  return (
    <div className={styles.sceneTitle} aria-live="polite">
      <span className={styles.sceneCount}>
        {String(activeIndex + 1).padStart(2, "0")} / {String(travelScenes.length).padStart(2, "0")}
      </span>
      <h2>{scene.title}</h2>
      <p>{scene.subtitle}</p>
    </div>
  );
}

export function SceneIndicators({ activeIndex, onSceneChange }: Pick<SceneChromeProps, "activeIndex" | "onSceneChange">) {
  return (
    <nav className={styles.sceneIndicators} aria-label="Travel scenes">
      {travelScenes.map((scene, index) => (
        <button
          className={styles.sceneDot}
          data-active={index === activeIndex}
          key={scene.id}
          type="button"
          aria-label={`Show ${scene.title} scene`}
          aria-current={index === activeIndex ? "true" : undefined}
          onClick={() => onSceneChange(index)}
        >
          <span />
        </button>
      ))}
    </nav>
  );
}
