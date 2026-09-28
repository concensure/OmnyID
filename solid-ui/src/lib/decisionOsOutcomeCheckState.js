import {
  pendingOutcomeCheckForDecision,
  removePendingOutcomeCheck,
  updatePendingOutcomeCheck,
  upsertPendingOutcomeCheck,
} from "./decisionOsHomeState.ts";
import { dispatchOutcomeCheckScheduledEvent } from "./outcomeCheckEvent.ts";

export function loadDecisionPendingOutcomeChecks(decisions, userId = null) {
  return decisions
    .map((decision) => pendingOutcomeCheckForDecision(decision.id, userId))
    .filter(Boolean);
}

export function withoutDecisionPendingOutcomeCheck(entries, decisionId) {
  return entries.filter((entry) => entry.id !== decisionId);
}

export function scheduleDecisionPendingOutcomeCheck(
  entry,
  userIdOrDispatch,
  dispatch = dispatchOutcomeCheckScheduledEvent,
) {
  const userId =
    typeof userIdOrDispatch === "string" || userIdOrDispatch === null || typeof userIdOrDispatch === "undefined"
      ? userIdOrDispatch ?? null
      : undefined;
  const effectiveDispatch = typeof userIdOrDispatch === "function" ? userIdOrDispatch : dispatch;
  const next = upsertPendingOutcomeCheck(entry, userId);
  effectiveDispatch(entry);
  return next;
}

export function rescheduleDecisionPendingOutcomeCheck(decisionId, checkAt, userId) {
  return updatePendingOutcomeCheck(decisionId, (entry) => ({ ...entry, checkAt }), userId);
}

export function clearDecisionPendingOutcomeCheck(decisionId, userId) {
  return removePendingOutcomeCheck(decisionId, userId);
}
