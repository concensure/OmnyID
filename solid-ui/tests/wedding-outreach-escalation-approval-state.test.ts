import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingOutreachEscalationApprovalSelectionState } from "../src/lib/weddingOutreachEscalationApprovalState.ts";
import { buildWeddingOutreachEscalationState } from "../src/lib/weddingOutreachEscalationState.ts";

const metadata = {
  wedding_plan_id: "wedding_plan:harbour",
  response_workspace_id: "response_workspace:outreach",
  source_response_id: "afp:response-outreach",
};

test("outreach escalation approval maps day-five follow-up to vendor contact approval", () => {
  const escalation = buildWeddingOutreachEscalationState({
    metadata,
    vendorLabel: "Harbour Hall",
    vendorTypeLabel: "Venue",
    initialOutreachSentAt: "2026-09-09T00:00:00.000Z",
    now: "2026-09-14T00:00:00.000Z",
    createdAt: 1,
  });
  const selection = buildWeddingOutreachEscalationApprovalSelectionState({
    escalation,
    optionId: "send_one_follow_up",
    recipients: ["events@harbour.example"],
    externalProvider: "gmail",
    proposedMessage: "Just following up on availability for our wedding date.",
  });

  assert.equal(selection.kind, "approval_request");
  if (selection.kind !== "approval_request") return;
  assert.equal(selection.request.actionKind, "contact_vendor");
  assert.equal(selection.request.canExecute, false);
  assert.equal(selection.request.blockKind, "needs_user_approval");
  assert.equal(selection.readiness.capability, "email");
  assert.equal(selection.readiness.providerLabel, "Gmail");
  assert.ok(selection.request.artifactIds.includes(escalation.artifactInput.id));
  assert.ok(selection.request.taskItemIds.includes(escalation.taskItem.id));
  assert.ok(selection.disclosureLines.some((line) => /Selected choice: Harbour Hall/i.test(line)));
  assert.ok(selection.riskLabels.some((line) => /No-spam ladder/i.test(line)));
});

test("outreach escalation approval can approve a final day-seven follow-up", () => {
  const escalation = buildWeddingOutreachEscalationState({
    metadata,
    vendorLabel: "Venue X",
    vendorTypeLabel: "Venue",
    initialOutreachSentAt: "2026-09-07T00:00:00.000Z",
    now: "2026-09-14T00:00:00.000Z",
    createdAt: 1,
  });
  const selection = buildWeddingOutreachEscalationApprovalSelectionState({
    escalation,
    optionId: "follow_up_again",
    recipients: ["events@venuex.example"],
    externalProvider: "gmail",
    userApproved: true,
  });

  assert.equal(selection.kind, "approval_request");
  if (selection.kind !== "approval_request") return;
  assert.equal(selection.request.canExecute, true);
  assert.equal(selection.request.executeButtonLabel, "Contact vendor");
  assert.equal(selection.request.metadata.weddingPlanId, "wedding_plan:harbour");
  assert.match(selection.request.id, /follow_up_again/);
  assert.ok(selection.disclosureLines.some((line) => /Venue X/i.test(line)));
  assert.ok(selection.riskLabels.some((line) => /final follow-up/i.test(line)));
});

test("outreach escalation approval keeps move-on and call choices local", () => {
  const escalation = buildWeddingOutreachEscalationState({
    metadata,
    vendorLabel: "Venue X",
    vendorTypeLabel: "Venue",
    vendorPhoneLabel: "+61 2 5555 0100",
    initialOutreachSentAt: "2026-09-07T00:00:00.000Z",
    now: "2026-09-14T00:00:00.000Z",
    createdAt: 1,
  });
  const moveOn = buildWeddingOutreachEscalationApprovalSelectionState({
    escalation,
    optionId: "move_on",
  });
  const call = buildWeddingOutreachEscalationApprovalSelectionState({
    escalation,
    optionId: "call_vendor",
  });

  assert.equal(moveOn.kind, "local_decision");
  assert.equal(call.kind, "local_decision");
  if (moveOn.kind !== "local_decision" || call.kind !== "local_decision") return;
  assert.equal(moveOn.canExecute, true);
  assert.equal(call.canExecute, true);
  assert.equal(moveOn.metadata.external_delivery_performed, false);
  assert.ok(call.disclosureLines.some((line) => /\+61 2 5555 0100/.test(line)));
  assert.ok(call.riskLabels.some((line) => /Manual call only/i.test(line)));
});

test("outreach escalation approval rejects stale option ids safely", () => {
  const escalation = buildWeddingOutreachEscalationState({
    metadata,
    vendorLabel: "Harbour Hall",
    now: "2026-09-14T00:00:00.000Z",
    createdAt: 1,
  });
  const selection = buildWeddingOutreachEscalationApprovalSelectionState({
    escalation,
    optionId: "move_on",
  });

  assert.equal(selection.kind, "unavailable");
  if (selection.kind !== "unavailable") return;
  assert.equal(selection.canExecute, false);
  assert.match(selection.disclosureLines[0] ?? "", /not available/i);
  assert.equal(selection.metadata.weddingPlanId, "wedding_plan:harbour");
});
