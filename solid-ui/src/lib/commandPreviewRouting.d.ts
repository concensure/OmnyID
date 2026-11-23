// @locs-version: 1.0
export type CommandPreviewSurfaceKind =
  | "search"
  | "task"
  | "note"
  | "social"
  | "spaces"
  | "travel_comparison"
  | "travel_card"
  | "schedule"
  | "presentation"
  | "orchestrate"
  | "dashboard_panel"
  | "runner_panel"
  | "generic_panel";

export declare function commandPreviewSurfaceKind(copy: {
  intent?: string | null;
  preferredView?: string | null;
  travelPrefersComparison?: boolean;
}): CommandPreviewSurfaceKind;

export type CommandPreviewWorkflowPendingIntentSeed = {
  id: string;
  intent: string;
  source: "master_agent";
  summary?: string | null;
};

export declare function commandPreviewWorkflowPendingIntentSeed(args: {
  id?: string;
  intent?: string | null;
  preferredView?: string | null;
  query?: string | null;
  summary?: string | null;
}): CommandPreviewWorkflowPendingIntentSeed | null;

export declare function commandPreviewShowsWorkflowHandoff(copy: {
  intent?: string | null;
  preferredView?: string | null;
  travelPrefersComparison?: boolean;
}): boolean;

export declare function commandPreviewPendingIntentAfterConsumed(
  currentSeed: CommandPreviewWorkflowPendingIntentSeed | null | undefined,
  consumedSeedId: string | null | undefined,
): CommandPreviewWorkflowPendingIntentSeed | null;

export declare function commandPreviewSuggestedWorkflowPendingIntentSeed(args: {
  id?: string;
  intent?: string | null;
  preferredView?: string | null;
  query?: string | null;
  summary?: string | null;
  suggestedView?: string | null;
  travelPrefersComparison?: boolean;
}): CommandPreviewWorkflowPendingIntentSeed | null;

export declare function commandPreviewSelectableSuggestedView<TViewName extends string>(args: {
  suggestedView?: string | null;
  viewNames: readonly TViewName[];
  blockedViewNames?: readonly string[];
}): TViewName | null;
