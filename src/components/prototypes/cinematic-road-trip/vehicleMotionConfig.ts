export type PrototypeSpeed = "slow" | "normal" | "fast";

export const speedOptions: ReadonlyArray<{
  id: PrototypeSpeed;
  label: string;
}> = [
  { id: "slow", label: "Slow" },
  { id: "normal", label: "Normal" },
  { id: "fast", label: "Fast" },
];

export const speedFactors: Record<PrototypeSpeed, number> = {
  slow: 0.65,
  normal: 1,
  fast: 1.55,
};

export const sceneTimeline = {
  totalMs: 11_000,
  transitionMs: 1_100,
  vehicleDelayMs: 2_000,
  vehicleDurationMs: 5_900,
} as const;
