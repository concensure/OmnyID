// @locs-version: 1.0
import type { DecisionOsConfettiParticleSpec } from "./decisionOsCelebrationState";

export type DecisionOsConfettiElement = {
  style: { cssText: string };
  remove: () => void;
};

export declare function appendDecisionOsConfetti<
  TElement extends DecisionOsConfettiElement = HTMLDivElement,
>(
  container: { appendChild: (node: TElement) => unknown },
  options?: {
    particles?: readonly DecisionOsConfettiParticleSpec[];
    createElement?: (tagName: string) => TElement;
    scheduleRemoval?: (remove: () => void, delayMs: number) => unknown;
  },
): number;
