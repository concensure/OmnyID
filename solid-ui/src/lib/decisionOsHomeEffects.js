import { dispatchActionChipEvent } from "./actionChipEvent.ts";
import {
  decisionOsContextItemNavPlan,
  decisionOsSearchActionChip,
} from "./decisionOsContextNavigationState.ts";

export function dispatchDecisionOsSearchAction(
  term,
  dispatch = dispatchActionChipEvent,
) {
  dispatch(decisionOsSearchActionChip(term));
}

export function openDecisionOsContextItem(
  item,
  deps,
) {
  const plan = decisionOsContextItemNavPlan(item);
  switch (plan.kind) {
    case "calendar":
      deps.navigateToView("calendar");
      return plan;
    case "threads":
      deps.navigateToView("threads", {
        threadId: plan.threadId,
        messageId: plan.messageId,
      });
      return plan;
    case "external":
      deps.openExternal(
        (deps.sanitizeHref ?? ((href) => href))(plan.href),
      );
      return plan;
    default:
      return plan;
  }
}
