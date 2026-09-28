// @locs-version: 1.0
import type { PendingOutcomeCheck } from "./decisionOsHomeState";
import type { OutcomeCheckScheduledEventDetail } from "./outcomeCheckEvent";

export declare function loadDecisionPendingOutcomeChecks(
  decisions: Array<{ id: string }>,
  userId?: string | null,
): PendingOutcomeCheck[];

export declare function withoutDecisionPendingOutcomeCheck(
  entries: PendingOutcomeCheck[],
  decisionId: string,
): PendingOutcomeCheck[];

export declare function scheduleDecisionPendingOutcomeCheck(
  entry: PendingOutcomeCheck,
  userIdOrDispatch?: string | null | ((detail: OutcomeCheckScheduledEventDetail) => void),
  dispatch?: (detail: OutcomeCheckScheduledEventDetail) => void,
): PendingOutcomeCheck[];

export declare function rescheduleDecisionPendingOutcomeCheck(
  decisionId: string,
  checkAt: string,
  userId?: string | null,
): PendingOutcomeCheck[];

export declare function clearDecisionPendingOutcomeCheck(
  decisionId: string,
  userId?: string | null,
): PendingOutcomeCheck[];
