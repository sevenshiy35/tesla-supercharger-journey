import type { Metadata } from "next";
import { CinematicRoadTripPrototype } from "@/components/prototypes/cinematic-road-trip/CinematicRoadTripPrototype";

export const metadata: Metadata = {
  title: "Cinematic Road Trip Prototype | MyTesla2026Journey",
  description:
    "An independent visual prototype exploring painterly American travel scenes and a white electric crossover.",
};

export default function CinematicRoadTripPrototypePage() {
  return <CinematicRoadTripPrototype />;
}
