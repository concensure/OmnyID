import test from "node:test";
import assert from "node:assert/strict";

import {
  DECISION_OS_NAVIGATE_EVENT,
  readDecisionOsNavigateEventDetail,
} from "../src/lib/decisionosNavigation.ts";
import {
  decisionQueuePriorityEntry,
  decisionQueueEntryDestinationLabel,
  openDecisionQueueEntryTarget,
  openDecisionQueuePriorityTarget,
} from "../src/lib/decisionQueueNavigation.ts";
import type { QueueEntry } from "../src/lib/decisionQueueModel.ts";

function captureNavigateDetail(run: () => void) {
  const originalWindow = globalThis.window;
  let captured: Event | null = null;
  Object.assign(globalThis, {
    window: {
      dispatchEvent(event: Event) {
        if (event.type === DECISION_OS_NAVIGATE_EVENT) {
          captured = event;
        }
        return true;
      },
    },
  });
  try {
    run();
  } finally {
    globalThis.window = originalWindow;
  }
  return captured ? readDecisionOsNavigateEventDetail(captured) : null;
}

test("decision queue navigation opens prepared workspace entries on the workspace surface", () => {
  const entry: QueueEntry = {
    id: "act_workspace",
    source: "action",
    decision: {
      id: "act_workspace",
      urgency: "medium",
      title: "Prepared work ready",
      context: "Prepared workspace review is ready.",
      impact: "medium",
      effort: "5 min",
      options: [{ id: "open", label: "Open workspace" }],
    },
    queueActionItem: {
      id: "act_workspace",
      title: "Review launch prep note",
      category: "prepared_work",
      urgency: "medium",
      confidence: "medium",
      requires_approval: false,
      suggested_action: "Open workspace",
      surface_hint: "home",
      source_refs: ["thread:launch_1", "message:launch_1"],
    } as any,
  };

  assert.equal(decisionQueueEntryDestinationLabel(entry), "workspace");
  assert.deepEqual(captureNavigateDetail(() => openDecisionQueueEntryTarget(entry)), { view: "home" });
});

test("decision queue navigation opens approval entries on the decision queue before thread context", () => {
  const entry: QueueEntry = {
    id: "priority_approval",
    source: "priority",
    decision: {
      id: "priority_approval",
      urgency: "high",
      title: "Approval needed",
      context: "A high-impact bill needs approval.",
      impact: "high",
      effort: "2 min",
      options: [{ id: "open", label: "Review approval" }],
    },
    queuePriorityCard: {
      title: "Bill approval needed",
      description: "Approval needed",
      panel_kind: "decision_queue",
      surface_hint: "decision_queue",
      requires_approval: true,
      action_label: "Review approval",
      confidence: "medium",
      source_refs: ["thread:bill_1", "message:bill_1"],
      object_refs: [],
      object_labels: [],
      file_refs: [],
      file_labels: [],
    } as any,
  };

  assert.equal(decisionQueueEntryDestinationLabel(entry), "decision queue");
  assert.deepEqual(captureNavigateDetail(() => openDecisionQueueEntryTarget(entry)), { view: "decision_queue" });
});

test("decision queue navigation opens queue priority plans through shared queue semantics", () => {
  assert.deepEqual(
    captureNavigateDetail(() =>
      openDecisionQueuePriorityTarget({
        queueState: {
          queuePriorityCard: {
            title: "Prepared work ready",
            description: "Prepared workspace review is ready",
            panel_kind: "home",
            surface_hint: "home",
            requires_approval: false,
            action_label: "Open workspace",
            confidence: "medium",
            source_refs: ["thread:launch_3", "message:launch_3"],
            object_refs: [],
            object_labels: [],
            file_refs: [],
            file_labels: [],
          } as any,
          queueActionItems: [],
          queueContextPanelItems: [],
        },
      }),
    ),
    { view: "home" },
  );

  assert.deepEqual(
    captureNavigateDetail(() =>
      openDecisionQueuePriorityTarget({
        queueState: {
          queuePriorityCard: null,
          queueActionItems: [
            {
              id: "act_review",
              title: "Review renewal memo",
              category: "prepared_work",
              urgency: "high",
              confidence: "medium",
              requires_approval: false,
              suggested_action: "Review prepared decision support",
              surface_hint: "decision_queue",
              source_refs: ["thread:renewal_3", "message:renewal_3"],
            } as any,
          ],
          queueContextPanelItems: [],
        },
      }),
    ),
    { view: "decision_queue" },
  );
});

test("decision queue navigation priority selector prefers the priority card before action fallback", () => {
  const selectedWithPriority = decisionQueuePriorityEntry({
    queueState: {
      queuePriorityCard: {
        title: "Prepared work ready",
        description: "Prepared workspace review is ready",
        panel_kind: "home",
        surface_hint: "home",
        requires_approval: false,
        action_label: "Open workspace",
        confidence: "medium",
        source_refs: ["thread:launch_4"],
        object_refs: [],
        object_labels: [],
        file_refs: [],
        file_labels: [],
      } as any,
      queueActionItems: [
        {
          id: "act_fallback",
          title: "Review renewal memo",
          category: "prepared_work",
          urgency: "high",
          confidence: "medium",
          requires_approval: false,
          suggested_action: "Review prepared decision support",
          surface_hint: "decision_queue",
          source_refs: ["thread:renewal_4"],
        } as any,
      ],
      queueContextPanelItems: [],
    },
  });
  assert.equal(selectedWithPriority?.source, "priority");
  assert.equal(decisionQueueEntryDestinationLabel(selectedWithPriority ?? null), "workspace");

  const selectedWithoutPriority = decisionQueuePriorityEntry({
    queueState: {
      queuePriorityCard: null,
      queueActionItems: [
        {
          id: "act_only",
          title: "Review renewal memo",
          category: "prepared_work",
          urgency: "high",
          confidence: "medium",
          requires_approval: false,
          suggested_action: "Review prepared decision support",
          surface_hint: "decision_queue",
          source_refs: ["thread:renewal_5"],
        } as any,
      ],
      queueContextPanelItems: [],
    },
  });
  assert.equal(selectedWithoutPriority?.source, "action");
  assert.equal(decisionQueueEntryDestinationLabel(selectedWithoutPriority ?? null), "decision queue");
});
