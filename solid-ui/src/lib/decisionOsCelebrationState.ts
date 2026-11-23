// @locs-version: 1.0
export type DecisionOsConfettiParticleSpec = {
  background: string;
  leftPct: number;
  topPct: number;
  animationDelaySec: number;
  rotateDeg: number;
};

const DECISION_OS_CONFETTI_COLORS = [
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#ec4899",
  "#06b6d4",
  "#f97316",
];

export function decisionOsConfettiParticleSpecs(
  count = 18,
  rng: () => number = Math.random,
): DecisionOsConfettiParticleSpec[] {
  return Array.from({ length: count }, (_, index) => ({
    background: DECISION_OS_CONFETTI_COLORS[index % DECISION_OS_CONFETTI_COLORS.length],
    leftPct: 10 + rng() * 80,
    topPct: 10 + rng() * 40,
    animationDelaySec: rng() * 0.4,
    rotateDeg: rng() * 360,
  }));
}
