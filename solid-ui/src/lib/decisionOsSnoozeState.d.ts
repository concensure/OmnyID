// @locs-version: 1.0
export declare function loadDecisionOsSnoozed(userId?: string | null): Map<string, number>;
export declare function saveDecisionOsSnoozed(snoozed: Map<string, number>, userId?: string | null): void;
export declare function loadSnoozeCounts(userId?: string | null): Map<string, number>;
export declare function saveSnoozeCounts(counts: Map<string, number>, userId?: string | null): void;

export declare function highlightedDecisionSnoozeOptionId(
  options: Array<{ id: string; label: string }>,
  preferredSnoozeId?: string | null,
): string | null;

export declare function decisionSnoozeQuickAction(
  options: Array<{ id: string; label: string }>,
  preferredSnoozeId?: string | null,
): {
  optionId: string;
  label: string;
} | null;

export declare function decisionSnoozeUsualLabel(
  options: Array<{ id: string; label: string }>,
  preferredSnoozeId?: string | null,
): string | null;

export declare function decisionSnoozeQuickActionTitle(label: string): string;
export declare function decisionSnoozeCountTitle(count: number): string;

export declare function decisionSnoozeUsualPrefix(): string;
export declare function decisionSnoozeSavedChoiceLabel(): string;

export declare function applyDecisionSnooze(args: {
  decisionId: string;
  optionId: string;
  wakeAt: number;
  snoozed: Map<string, number>;
  snoozeCounts: Map<string, number>;
  now?: Date;
  userId?: string | null;
}): {
  snoozed: Map<string, number>;
  snoozeCounts: Map<string, number>;
  preferredSnoozeId: string | null;
};

export declare function undoDecisionSnooze(
  decisionId: string,
  snoozed: Map<string, number>,
  userId?: string | null,
): Map<string, number>;
