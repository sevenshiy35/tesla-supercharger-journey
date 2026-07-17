export type CinematicJourneyScene = {
  id: "new-york" | "california" | "utah";
  title: { en: string; zh: string };
  subtitle: { en: string; zh: string };
  backgroundImage: string;
  mobileBackgroundImage?: string;
  backgroundPosition: string;
  mobileBackgroundPosition: string;
};

export const cinematicJourneyScenes: readonly CinematicJourneyScene[] = [
  {
    id: "new-york",
    title: { en: "New York", zh: "纽约" },
    subtitle: { en: "Blue Hour · East Coast", zh: "蓝调时刻 · 美国东岸" },
    backgroundImage: "/images/cinematic-road-trip/new-york-blue-hour.webp",
    mobileBackgroundImage: "/images/cinematic-road-trip/new-york-bridge-mobile.webp",
    backgroundPosition: "center center",
    mobileBackgroundPosition: "70% center",
  },
  {
    id: "california",
    title: { en: "San Francisco", zh: "旧金山" },
    subtitle: { en: "Golden Gate · California", zh: "金门大桥 · 加利福尼亚" },
    backgroundImage: "/images/cinematic-road-trip/california-golden-gate.webp",
    backgroundPosition: "center center",
    mobileBackgroundPosition: "70% center",
  },
  {
    id: "utah",
    title: { en: "Utah", zh: "犹他" },
    subtitle: { en: "Desert Canyon · Southwest", zh: "沙漠峡谷 · 美国西南" },
    backgroundImage: "/images/cinematic-road-trip/utah-desert-canyon.webp",
    backgroundPosition: "center center",
    mobileBackgroundPosition: "56% center",
  },
] as const;

export const cinematicJourneyCopy = {
  en: {
    eyebrow: "A 2026 Supercharger travel journal",
    title: "A road trip told in light.",
    introTitle: "One station. One photo. One story.",
    sceneNavigation: "Travel scenes",
    sceneLabel: "Travel illustration",
    showScene: (title: string) => `Show ${title} scene`,
  },
  zh: {
    eyebrow: "2026 全美超级充电站旅行记录",
    title: "用光影讲述\n一场公路旅行。",
    introTitle: "一座站，一张照片，\n一段故事。",
    sceneNavigation: "旅行场景",
    sceneLabel: "旅行插画",
    showScene: (title: string) => `显示${title}场景`,
  },
} as const;
