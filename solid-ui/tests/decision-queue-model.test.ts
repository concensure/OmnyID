import test from "node:test";
import assert from "node:assert/strict";

import { buildQueueEntries } from "../src/lib/decisionQueueModel.ts";

test("decision queue model uses trust-aware priority and action assembly for prepared work", () => {
  const entries = buildQueueEntries({
    queuePriorityCard: {
      title: "Renewal review ready",
      description: "Prepared decision support is ready for review",
      panel_kind: "decision_queue",
      requires_approval: false,
      action_label: "Open decision queue",
      surface_hint: "decision_queue",
      confidence: "medium",
      prepared_draft_class: "decision_memo",
      selection_reason: "Prepared renewal comparison",
      source_refs: ["thread:renewal_1"],
      object_refs: ["renewal:aurora_fiber"],
      object_labels: ["Aurora Fiber renewal"],
      file_refs: [],
      file_labels: [],
    },
    queueActionItems: [
      {
        id: "act_1",
        title: "Review launch prep note",
        category: "prepared_work",
        urgency: "high",
        confidence: "medium",
        requires_approval: false,
        suggested_action: "Open workspace",
        surface_hint: "home",
        source_refs: ["thread:launch_1"],
      },
    ],
    queueContextPanelItems: [],
  });

  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.decision.urgency, "medium");
  assert.equal(entries[0]?.decision.effort, "5 min");
  assert.equal(entries[0]?.decision.options[0]?.label, "Open decision queue");
  assert.equal(entries[1]?.decision.urgency, "medium");
  assert.equal(entries[1]?.decision.effort, "5 min");
  assert.equal(entries[1]?.decision.options[0]?.label, "Open workspace");
});

test("decision queue model accepts atomic queue state input", () => {
  const entries = buildQueueEntries({
    queuePriorityCard: {
      title: "Approval required",
      description: "Prepared work needs approval",
      panel_kind: "decision_queue",
      requires_approval: true,
      action_label: "Open decision queue",
      surface_hint: "decision_queue",
      source_refs: ["thread:approval_1"],
      object_refs: [],
      object_labels: [],
      file_refs: [],
      file_labels: [],
    },
    queueActionItems: [
      {
        id: "act_2",
        title: "Review workspace draft",
        category: "prepared_work",
        urgency: "medium",
        confidence: "medium",
        requires_approval: false,
        suggested_action: "Open workspace",
        surface_hint: "home",
        source_refs: ["thread:workspace_1"],
      },
    ],
    queueContextPanelItems: [],
  });

  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.source, "priority");
  assert.equal(entries[0]?.queuePriorityCard?.title, "Approval required");
  assert.equal(entries[1]?.source, "action");
  assert.equal(entries[1]?.queueActionItem?.id, "act_2");
});
