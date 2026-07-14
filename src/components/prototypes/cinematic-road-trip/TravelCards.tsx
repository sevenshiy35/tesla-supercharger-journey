import { prototypeContent } from "./prototypeStats";
import styles from "./CinematicRoadTripPrototype.module.css";

export function TravelIntroCard() {
  return (
    <section className={styles.introCard} aria-labelledby="prototype-intro-title">
      <p className={styles.cardEyebrow}>{prototypeContent.eyebrow}</p>
      <h2 id="prototype-intro-title">One station. One photo. One story.</h2>
      <p className={styles.introCopy}>{prototypeContent.introduction}</p>
    </section>
  );
}

export function TravelStatsCard() {
  return (
    <section className={styles.statsCard} aria-label="Prototype journey statistics">
      {prototypeContent.stats.map((stat) => (
        <div className={styles.stat} key={stat.label}>
          <strong>{stat.value}</strong>
          <span>{stat.label}</span>
        </div>
      ))}
    </section>
  );
}
