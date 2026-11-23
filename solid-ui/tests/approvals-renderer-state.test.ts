import test from "node:test";
import assert from "node:assert/strict";

import { approvalItemsForMessage } from "../src/lib/approvalPresentationState.ts";

const baseMessage = {
  id: "msg_approval_1",
  thread_id: "thread_approval_1",
  type: "approval_request",
  from: "planner",
} as const;

test("approval items keep trust fields on single approval payloads", () => {
  const [item] = approvalItemsForMessage({
    message: baseMessage as never,
    rawContent: {
      title: "Review protected hold",
      summary: "A reversible calendar hold is ready for review.",
      selection_reason: "Nearest high-stakes event needs protected prep.",
      approval_or_reversibility_hint: "Approving would create a reviewable hold.",
      provenance_cue: "Grounded in 2 source references.",
      source_summary: "Based on 2 sources.",
    },
  });

  assert.equal(item.title, "Review protected hold");
  assert.equal(item.selectionReason, "Nearest high-stakes event needs protected prep.");
  assert.equal(item.trustSummary.boundedReason, "A reversible calendar hold is ready for review.");
  assert.equal(item.trustSummary.showSelectionReason, true);
  assert.equal(item.consequencePreview, "Approving would create a reviewable hold.");
  assert.equal(item.trustSummary.consequencePreview, "Approving would create a reviewable hold.");
  assert.equal(item.provenanceCue, "Grounded in 2 source references.");
  assert.equal(item.trustSummary.provenanceCue, "Grounded in 2 source references.");
  assert.equal(item.sourceSummary, "Based on 2 sources.");
});

test("approval items still normalize item-array payloads with mixed trust-field casing", () => {
  const [item] = approvalItemsForMessage({
    message: baseMessage as never,
    rawContent: {
      items: [
        {
          title: "Review reversible send",
          summary: "A staged reply is ready for review.",
          selectionReason: "Prepared work already covers the current blocker.",
          consequence_preview: "Send remains blocked until approval is granted.",
          provenanceCue: "Grounded in 1 source reference.",
          source_summary: "Based on 1 source.",
        },
      ],
    },
  });

  assert.equal(item.selectionReason, "Prepared work already covers the current blocker.");
  assert.equal(item.trustSummary.boundedReason, "A staged reply is ready for review.");
  assert.equal(item.trustSummary.showSelectionReason, true);
  assert.equal(item.consequencePreview, "Send remains blocked until approval is granted.");
  assert.equal(item.provenanceCue, "Grounded in 1 source reference.");
  assert.equal(item.sourceSummary, "Based on 1 source.");
});

test("approval items preserve autonomy tiers when no structured autonomy decision is present", () => {
  const [item] = approvalItemsForMessage({
    message: baseMessage as never,
    rawContent: {
      title: "Review reversible send",
      summary: "A staged reply is ready for review.",
      autonomy_tier: "notify_then_act",
    },
  });

  assert.equal(item.autonomyDecision?.autonomy_level, "notify_then_act");
});

test("approval preview items preserve autonomy tiers when no structured autonomy decision is present", () => {
  const [item] = approvalItemsForMessage({
    message: baseMessage as never,
    rawContent: {
      kind: "simulator_approval_preview",
      title: "Approval preview",
      description: "Review the draft slot before protecting it.",
      autonomy_tier: "ask_always",
    },
  });

  assert.equal(item.previewOnly, true);
  assert.equal(item.autonomyDecision?.autonomy_level, "ask_always");
});
