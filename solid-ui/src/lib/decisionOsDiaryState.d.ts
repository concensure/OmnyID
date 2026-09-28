// @locs-version: 1.0
export type DecisionOsDiaryEntry = {
  ts: string;
  type: "mood" | "decision" | "note" | "calendar" | "agent" | "milestone";
  icon: string;
  title: string;
  detail?: string;
  meta?: string;
  decisionId?: string;
  outcomeCheckAt?: string;
  note?: string;
};

export declare function loadDecisionOsDiaryBuckets(userId?: string | null): Record<string, DecisionOsDiaryEntry[]>;

export declare function persistDecisionOsDiaryBuckets(
  buckets: Record<string, DecisionOsDiaryEntry[]>,
  userId?: string | null,
): Record<string, DecisionOsDiaryEntry[]>;

export declare function loadDecisionOsDiaryEntriesForDate(
  dateKey: string,
  userId?: string | null,
): DecisionOsDiaryEntry[];

export declare function appendDecisionOsDiaryEntry(
  entry: DecisionOsDiaryEntry,
  userId?: string | null,
  options?: {
    maxEntriesPerDay?: number;
    maxDays?: number;
  },
): Record<string, DecisionOsDiaryEntry[]>;

export declare function recordDecisionOsDiaryEntry(
  entry: DecisionOsDiaryEntry,
  userId?: string | null,
  dispatch?: (entry: DecisionOsDiaryEntry) => void,
): DecisionOsDiaryEntry[];

export declare function updateDecisionOsDiaryEntryOutcomeCheck(
  decisionId: string,
  checkAt: string,
  userId?: string | null,
): Record<string, DecisionOsDiaryEntry[]>;
