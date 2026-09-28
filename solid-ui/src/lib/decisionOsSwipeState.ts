// @locs-version: 1.0
export type DecisionOsSwipeOutcome = "approve" | "dismiss" | null;
export type DecisionOsSwipeActionPlan = {
  action: DecisionOsSwipeOutcome;
  optionId?: string | undefined;
};

export function decisionOsSwipeOutcome(args: {
  dx: number;
  elapsedMs: number;
  rootFontSizePx: number;
}): DecisionOsSwipeOutcome {
  const elapsedMs = Math.max(1, args.elapsedMs);
  const velocityPxPerSecond = Math.abs(args.dx) / elapsedMs * 1000;
  const threshold = args.rootFontSizePx * 3;

  if (args.dx > threshold || (args.dx > 24 && velocityPxPerSecond >= 600)) {
    return "approve";
  }
  if (args.dx < -threshold || (args.dx < -24 && velocityPxPerSecond >= 600)) {
    return "dismiss";
  }
  return null;
}

export function decisionOsSwipeOpacity(dx: number): number {
  return Math.min(Math.abs(dx) / 60, 0.18);
}

export function decisionOsSwipeColor(dx: number): string {
  const opacity = decisionOsSwipeOpacity(dx);
  return dx > 0 ? `rgba(34,197,94,${opacity})` : `rgba(239,68,68,${opacity})`;
}

export function decisionOsSwipeMovePlan(args: {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}): {
  shouldPreventDefault: boolean;
  swipeDx: number | null;
} {
  const dx = args.currentX - args.startX;
  const dy = args.currentY - args.startY;
  if (Math.abs(dy) > Math.abs(dx)) {
    return {
      shouldPreventDefault: false,
      swipeDx: null,
    };
  }
  return {
    shouldPreventDefault: true,
    swipeDx: dx,
  };
}

export function decisionOsSwipeActionPlan(args: {
  dx: number;
  elapsedMs: number;
  rootFontSizePx: number;
  optionId?: string | null;
}): DecisionOsSwipeActionPlan {
  return {
    action: decisionOsSwipeOutcome(args),
    optionId: args.optionId ?? undefined,
  };
}
