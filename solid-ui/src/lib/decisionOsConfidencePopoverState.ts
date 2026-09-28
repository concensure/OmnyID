// @locs-version: 1.0
export function shouldKeepDecisionOsConfidencePopoverOpen(args: {
  target: EventTarget | null;
  container: Node | null | undefined;
}): boolean {
  if (!args.target || !args.container) return false;
  return typeof (args.container as { contains?: (target: unknown) => boolean }).contains === "function"
    && !!(args.container as { contains: (target: unknown) => boolean }).contains(args.target);
}

export function shouldCloseDecisionOsConfidencePopoverForKey(key: string): boolean {
  return key === "Escape";
}

export function decisionOsConfidenceExplanationAriaLabel(): string {
  return "Confidence explanation";
}

export function decisionOsConfidenceExplanationTitle(): string {
  return "Why this confidence score";
}

export function decisionOsConfidenceCloseLabel(): string {
  return "Close";
}

export function decisionOsConfidenceFlagReasoningLabel(): string {
  return "Flag this reasoning";
}
