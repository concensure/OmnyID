// @locs-version: 1.0
export type DecisionOsHomeEffectContextItem = {
  sourceRefs?: string[];
  sourceUrl?: string;
};

export type DecisionOsHomeEffectDeps = {
  navigateToView: (
    view: "calendar" | "threads",
    params?: { threadId?: string; messageId?: string },
  ) => void;
  openExternal: (href: string) => void;
  sanitizeHref?: (href: string) => string;
};

export function dispatchDecisionOsSearchAction(
  term: string,
  dispatch?: (chip: { id: string; label: string }) => void,
): void;

export function openDecisionOsContextItem(
  item: DecisionOsHomeEffectContextItem,
  deps: DecisionOsHomeEffectDeps,
):
  | { kind: "calendar" }
  | { kind: "threads"; threadId?: string; messageId?: string }
  | { kind: "external"; href: string }
  | { kind: "none" };
