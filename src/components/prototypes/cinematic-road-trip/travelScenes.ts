export type TravelSceneId = "new-york" | "california" | "utah";

export type TravelScene = {
  id: TravelSceneId;
  title: string;
  subtitle: string;
  backgroundImage: string;
  mobileBackgroundImage?: string;
  backgroundPosition: string;
  mobileBackgroundPosition: string;
  vehicleImage: string;
  vehicleHeight: number;
  paletteLabel: string;
};

export const travelScenes: readonly TravelScene[] = [
  {
    id: "new-york",
    title: "New York",
    subtitle: "Blue Hour · East Coast",
    backgroundImage: "/images/cinematic-road-trip/new-york-blue-hour.webp",
    mobileBackgroundImage: "/images/cinematic-road-trip/new-york-bridge-mobile.webp",
    backgroundPosition: "center center",
    mobileBackgroundPosition: "70% center",
    vehicleImage: "/images/cinematic-road-trip/model-y-side.webp",
    vehicleHeight: 347,
    paletteLabel: "Cobalt water, violet sky, warm city lights",
  },
  {
    id: "california",
    title: "San Francisco",
    subtitle: "Golden Gate · California",
    backgroundImage: "/images/cinematic-road-trip/california-golden-gate.webp",
    backgroundPosition: "center center",
    mobileBackgroundPosition: "70% center",
    vehicleImage: "/images/cinematic-road-trip/model-y-coast.webp",
    vehicleHeight: 403,
    paletteLabel: "Marine blue, coral sky, coastal amber",
  },
  {
    id: "utah",
    title: "Utah",
    subtitle: "Desert Canyon · Southwest",
    backgroundImage: "/images/cinematic-road-trip/utah-desert-canyon.webp",
    backgroundPosition: "center center",
    mobileBackgroundPosition: "56% center",
    vehicleImage: "/images/cinematic-road-trip/model-y-front.webp",
    vehicleHeight: 458,
    paletteLabel: "Red sandstone, amber light, violet shadows",
  },
] as const;

export function getSceneIndex(sceneId: TravelSceneId) {
  return travelScenes.findIndex((scene) => scene.id === sceneId);
}
