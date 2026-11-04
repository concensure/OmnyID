import assert from "node:assert/strict";
import test from "node:test";

import {
  weddingGuestFinalCountApprovalFromAfpMessages,
  weddingGuestFinalCountApprovalToAfpSendInput,
  weddingGuestFinalCountChoices,
  weddingGuestFinalCountRecommendation,
} from "@/lib/weddingGuestFinalCountApprovalState";

const task = {
  id: "final-count",
  title: "Choose final guest count option (0 confirmed, 1 pending)",
  kind: "decision",
  dueLabel: "Before caterer deadline",
  priority: "high",
  source: "agent",
  reviewStatus: "accepted",
  approvalState: "draft",
  metadata: {
    guest_final_count_decision: true,
    guest_final_count_attending: 0,
    guest_final_count_pending: 1,
    guest_final_count_option_ids: ["current", "all"],
    guest_final_count_option_labels: ["Submit current count (0)", "Count pending guest (1)"],
    guest_final_count_headcounts: [0, 1],
    guest_final_count_risk_labels: ["One reply is still pending.", "May increase catering commitment."],
  },
} as const;

test("final-count decisions use couple-facing choices instead of assuming zero", () => {
  assert.deepEqual(weddingGuestFinalCountChoices(task).map((choice) => choice.headcount), [0, 1]);
  assert.match(weddingGuestFinalCountRecommendation(task) ?? "", /1 still waiting/i);
  assert.doesNotMatch(weddingGuestFinalCountRecommendation(task) ?? "", /conservative guarantee = 0/i);
});

test("approval produces and reprojects one scoped AFP decision", () => {
  const input = weddingGuestFinalCountApprovalToAfpSendInput({
    task,
    choice: weddingGuestFinalCountChoices(task)[1]!,
    weddingPlanId: "plan-1",
    responseWorkspaceId: "workspace-1",
    nowIso: "2026-11-05T00:00:00.000Z",
  });
  const projected = weddingGuestFinalCountApprovalFromAfpMessages([{
    id: "message-1",
    thread_id: input.thread_id,
    from: input.from,
    to: input.to,
    timestamp: "2026-11-05T00:00:00.000Z",
    type: input.type,
    kind: input.kind,
    subtype: input.subtype,
    content: input.content,
    metadata: input.metadata,
  }], "workspace-1");
  assert.equal(projected?.headcount, 1);
  assert.equal(projected?.optionId, "all");
});
