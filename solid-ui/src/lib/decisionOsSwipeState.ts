// @locs-version: 1.0
export type DecisionOsSwipeOutcome = "approve" | "dismiss" | null;
export type FocusDeckSwipe = "prev" | "next" | "defer" | "approve" | null;
export type FocusDeckAxis = "horizontal" | "vertical" | null;
export type FocusDeckHorizontalMapping = "left_is_prev" | "left_is_next";
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

/** Locks a pointer interaction after a small intentional movement. */
export function decisionOsSwipeAxisLock(args: {
  dx: number;
  dy: number;
  lockedAxis?: FocusDeckAxis;
}): FocusDeckAxis {
  if (args.lockedAxis) return args.lockedAxis;
  if (Math.max(Math.abs(args.dx), Math.abs(args.dy)) < 10) return null;
  return Math.abs(args.dx) >= Math.abs(args.dy) ? "horizontal" : "vertical";
}

export function decisionOsSwipeDirection(args: {
  dx: number;
  dy: number;
  elapsedMs: number;
  cardWidth: number;
  cardHeight: number;
  mapping: FocusDeckHorizontalMapping;
}): FocusDeckSwipe {
  const axis = decisionOsSwipeAxisLock(args);
  const elapsedMs = Math.max(1, args.elapsedMs);
  if (axis === "horizontal") {
    const distance = Math.abs(args.dx);
    const fastEnough = distance >= 24 && distance / elapsedMs >= 0.6;
    if (distance < Math.max(72, args.cardWidth * 0.22) && !fastEnough) return null;
    const left = args.dx < 0;
    const leftIsPrevious = args.mapping === "left_is_prev";
    return left === leftIsPrevious ? "prev" : "next";
  }
  if (axis === "vertical") {
    const distance = Math.abs(args.dy);
    const fastEnough = distance >= 24 && distance / elapsedMs >= 0.6;
    if (args.dy < 0) {
      return distance >= Math.min(96, Math.max(72, args.cardHeight * 0.14)) || fastEnough ? "defer" : null;
    }
    return distance >= Math.min(88, Math.max(64, args.cardHeight * 0.14)) || fastEnough ? "approve" : null;
  }
  return null;
}

export function decisionOsSwipeProgress(args: {
  dx: number;
  dy: number;
  cardWidth: number;
  cardHeight: number;
}): number {
  const axis = decisionOsSwipeAxisLock(args);
  const distance = axis === "horizontal" ? Math.abs(args.dx) : Math.abs(args.dy);
  const threshold = axis === "horizontal"
    ? Math.max(72, args.cardWidth * 0.22)
    : args.dy > 0
      ? Math.min(88, Math.max(64, args.cardHeight * 0.14))
      : Math.min(96, Math.max(72, args.cardHeight * 0.14));
  return axis ? Math.min(1, distance / threshold) : 0;
}
