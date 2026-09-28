import test from "node:test";
import assert from "node:assert/strict";

import {
  queueEntryAutonomySummary,
  queueEntryBoundedReason,
  queueEntryConfidenceLabel,
  queueEntryConfidenceReason,
  queueEntryConsequencePreview,
  queueEntryPriorityRationale,
  queueEntryProvenanceCue,
  queueEntryRawReasonText,
  queueEntrySuggestedActionText,
  queueEntrySourceSummary,
  queueEntryTrustState,
} from "../src/lib/decisionQueuePresentationState.ts";

const priorityEntry = {
  id: "continuity-priority-card",
  source: "priority" as const,
  decision: {
    id: "continuity-priority-card",
    urgency: "medium" as const,
    title: "Renewal review ready",
    context: "Prepared decision support is ready for review",
    impact: "high" as const,
    effort: "5 min",
    confidence: 0.76,
    confidenceReason:
      "Medium confidence. Prepared work is already ready for review, 1 source reference support this lane.",
    options: [],
  },
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
    autonomy_tier: "notify_then_act",
    approval_or_reversibility_hint: "Opens prepared work for review; it does not execute a side effect.",
    provenance_cue: "Grounded in 1 source reference. Includes 1 object anchor.",
    source_refs: ["thread:renewal_1"],
    object_refs: ["renewal:aurora_fiber"],
    object_labels: ["Aurora Fiber renewal"],
    file_refs: [],
    file_labels: [],
  },
};

const actionEntry = {
  id: "act_1",
  source: "action" as const,
  decision: {
    id: "continuity-action:act_1",
    urgency: "medium" as const,
    title: "Review workspace note",
    context: "Prepared work is ready for review",
    impact: "high" as const,
    effort: "5 min",
    options: [],
  },
  queueActionItem: {
    id: "act_1",
    title: "Review workspace note",
    category: "prepared_work",
    urgency: "high",
    confidence: "medium",
    requires_approval: false,
    suggested_action: "Open workspace",
    selection_reason: "Workspace follow-up is already bounded and ready for review.",
    surface_hint: "home",
    autonomy_tier: "notify_then_act",
    approval_or_reversibility_hint: "Stays reviewable before execution.",
    provenance_cue: "Grounded in 1 source reference.",
    source_refs: ["thread:launch_1"],
  },
};

const noConfidenceEntry = {
  id: "continuity-priority-card",
  source: "priority" as const,
  decision: {
    id: "continuity-priority-card",
    urgency: "medium" as const,
    title: "Launch prep note ready",
    context: "Prepared work is ready for review",
    impact: "high" as const,
    effort: "5 min",
    options: [],
  },
  queuePriorityCard: {
    title: "Launch prep note ready",
    description: "Prepared work is ready for review",
    panel_kind: "home",
    requires_approval: false,
    action_label: "Open workspace",
    surface_hint: "home",
    confidence: null,
    prepared_draft_class: "project_prep_note",
    selection_reason: "Prepared workspace follow-up",
    source_refs: ["thread:launch_1"],
    object_refs: ["project:launch"],
    object_labels: ["Launch plan"],
    file_refs: [],
    file_labels: [],
  },
};

test("decision queue presentation state derives continuity metadata from priority entries", () => {
  assert.deepEqual(
    queueEntryTrustState(priorityEntry),
    {
      sourceSummary: "Based on 1 source",
      priorityRationale:
        "Prioritized because object-linked continuity reinforces the same active work item.",
      consequencePreview: "Opens prepared work for review; it does not execute a side effect.",
      provenanceCue: "Grounded in 1 source reference. Includes 1 object anchor.",
      boundedReason: "Prepared renewal comparison",
      suggestedActionText: null,
      rawReasonText: null,
    },
  );
  assert.equal(
    queueEntrySourceSummary(priorityEntry),
    "Based on 1 source",
  );
  assert.equal(
    queueEntryPriorityRationale(priorityEntry),
    "Prioritized because object-linked continuity reinforces the same active work item.",
  );
  assert.equal(
    queueEntryConsequencePreview(priorityEntry),
    "Opens prepared work for review; it does not execute a side effect.",
  );
  assert.equal(
    queueEntryAutonomySummary(priorityEntry),
    "notify then act: Prepared work is ready for review before any action is taken.",
  );
  assert.equal(
    queueEntryProvenanceCue(priorityEntry),
    "Grounded in 1 source reference. Includes 1 object anchor.",
  );
  assert.equal(
    queueEntryBoundedReason(priorityEntry),
    "Prepared renewal comparison",
  );
  assert.equal(queueEntryRawReasonText(priorityEntry), null);
});

test("decision queue presentation state still derives action-item metadata from action entries", () => {
  assert.deepEqual(
    queueEntryTrustState(actionEntry),
    {
      sourceSummary: "Based on 1 source",
      priorityRationale: null,
      consequencePreview: "Stays reviewable before execution.",
      provenanceCue: "Grounded in 1 source reference.",
      boundedReason: "Workspace follow-up is already bounded and ready for review.",
      suggestedActionText: "Open workspace",
      rawReasonText: null,
    },
  );
  assert.equal(queueEntrySourceSummary(actionEntry), "Based on 1 source");
  assert.equal(queueEntryPriorityRationale(actionEntry), null);
  assert.equal(
    queueEntryConsequencePreview(actionEntry),
    "Stays reviewable before execution.",
  );
  assert.equal(
    queueEntryAutonomySummary(actionEntry),
    "notify then act: Suggested next step stays reviewable before execution.",
  );
  assert.equal(
    queueEntryProvenanceCue(actionEntry),
    "Grounded in 1 source reference.",
  );
  assert.equal(
    queueEntryBoundedReason(actionEntry),
    "Workspace follow-up is already bounded and ready for review.",
  );
  assert.equal(
    queueEntryRawReasonText(actionEntry),
    null,
  );
  assert.equal(
    queueEntrySuggestedActionText(actionEntry),
    "Open workspace",
  );
  assert.equal(
    queueEntrySuggestedActionText({
      ...actionEntry,
      queueActionItem: {
        ...actionEntry.queueActionItem,
        suggested_action: "Workspace follow-up is already bounded and ready for review.",
      },
    }),
    null,
  );
  assert.equal(
    queueEntryRawReasonText({
      ...actionEntry,
      queueActionItem: {
        ...actionEntry.queueActionItem,
        selection_reason: "Open workspace",
        suggested_action: "Open workspace",
      },
    }),
    null,
  );
  assert.equal(
    queueEntryRawReasonText({
      ...priorityEntry,
      queuePriorityCard: {
        ...priorityEntry.queuePriorityCard,
        selection_reason: "Review now before the pricing memo stales.",
        prepared_draft_class: undefined,
      },
      decision: {
        ...priorityEntry.decision,
        urgency: "low" as const,
      },
    }),
    null,
  );
});

test("decision queue presentation state prefers structured autonomy decisions over sibling autonomy tiers", () => {
  assert.equal(
    queueEntryAutonomySummary({
      ...priorityEntry,
      queuePriorityCard: {
        ...priorityEntry.queuePriorityCard,
        autonomy_tier: "ask_always",
        autonomy_decision: {
          autonomy_level: "request_approval",
          reason: "This path remains approval-gated until explicitly confirmed.",
          approval_required: true,
        },
      },
    }),
    "Approval boundary: This path remains approval-gated until explicitly confirmed.",
  );
});

test("decision queue presentation state handles missing confidence cleanly", () => {
  assert.equal(queueEntryConfidenceLabel(priorityEntry), "76%");
  assert.equal(
    queueEntryConfidenceReason(priorityEntry),
    "Medium confidence. Prepared work is already ready for review, 1 source reference support this lane.",
  );
  assert.equal(queueEntryConfidenceLabel(noConfidenceEntry), null);
  assert.equal(queueEntryConfidenceReason(noConfidenceEntry), "No reason provided.");
});
