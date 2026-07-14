import { speedOptions, type PrototypeSpeed } from "./vehicleMotionConfig";
import { travelScenes } from "./travelScenes";
import styles from "./CinematicRoadTripPrototype.module.css";

type PrototypeControlsProps = {
  activeIndex: number;
  paused: boolean;
  speed: PrototypeSpeed;
  environmentMotion: boolean;
  reducedMotion: boolean;
  onSceneChange: (index: number) => void;
  onPauseChange: (paused: boolean) => void;
  onRestart: () => void;
  onSpeedChange: (speed: PrototypeSpeed) => void;
  onEnvironmentMotionChange: (enabled: boolean) => void;
};

export function PrototypeControls({
  activeIndex,
  paused,
  speed,
  environmentMotion,
  reducedMotion,
  onSceneChange,
  onPauseChange,
  onRestart,
  onSpeedChange,
  onEnvironmentMotionChange,
}: PrototypeControlsProps) {
  return (
    <section className={styles.controls} aria-label="Prototype preview controls">
      <div className={styles.controlsHeading}>
        <div>
          <span>Development preview</span>
          <h2>Scene controls</h2>
        </div>
        <p>{reducedMotion ? "Reduced motion is active" : "Auto-playing an 11-second scene loop"}</p>
      </div>

      <div className={styles.controlGrid}>
        <fieldset className={styles.controlGroup}>
          <legend>Scene</legend>
          <div className={styles.buttonRow}>
            {travelScenes.map((scene, index) => (
              <button
                className={styles.controlButton}
                data-active={activeIndex === index}
                type="button"
                key={scene.id}
                aria-label={`Switch preview to ${scene.title}`}
                aria-pressed={activeIndex === index}
                onClick={() => onSceneChange(index)}
              >
                {scene.id === "california" ? "California" : scene.title}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.controlGroup}>
          <legend>Playback</legend>
          <div className={styles.buttonRow}>
            <button
              className={styles.controlButton}
              data-active={!paused && !reducedMotion}
              type="button"
              aria-label="Start automatic scene playback"
              aria-pressed={!paused && !reducedMotion}
              disabled={reducedMotion}
              onClick={() => onPauseChange(false)}
            >
              Auto Play
            </button>
            <button
              className={styles.controlButton}
              data-active={paused}
              type="button"
              aria-label="Pause scene playback"
              aria-pressed={paused}
              disabled={reducedMotion}
              onClick={() => onPauseChange(true)}
            >
              Pause
            </button>
            <button
              className={styles.controlButton}
              type="button"
              aria-label="Restart the current scene"
              onClick={onRestart}
            >
              Restart Scene
            </button>
          </div>
        </fieldset>

        <fieldset className={styles.controlGroup}>
          <legend>Speed</legend>
          <div className={styles.buttonRow}>
            {speedOptions.map((option) => (
              <button
                className={styles.controlButton}
                data-active={speed === option.id}
                type="button"
                key={option.id}
                aria-label={`Set scene speed to ${option.label.toLowerCase()}`}
                aria-pressed={speed === option.id}
                disabled={reducedMotion}
                onClick={() => onSpeedChange(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.controlGroup}>
          <legend>Environment</legend>
          <div className={styles.buttonRow}>
            <button
              className={styles.controlButton}
              data-active={environmentMotion && !reducedMotion}
              type="button"
              aria-label={`${environmentMotion ? "Disable" : "Enable"} environment motion`}
              aria-pressed={environmentMotion && !reducedMotion}
              disabled={reducedMotion}
              onClick={() => onEnvironmentMotionChange(!environmentMotion)}
            >
              Motion {environmentMotion && !reducedMotion ? "On" : "Off"}
            </button>
          </div>
        </fieldset>
      </div>
    </section>
  );
}
