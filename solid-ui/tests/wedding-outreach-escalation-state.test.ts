import assert from "node:assert/strict";
import test from "node:test";

import { weddingTaskItemToAfpSendInput } from "../src/lib/weddingCalendarProjectionState.ts";
import { buildWeddingProjectionQueueState } from "../src/lib/weddingProjectionQueueState.ts";
import { buildWeddingResponseWorkspaceState } from "../src/lib/weddingResponseWorkspaceState.ts";
import { buildWeddingTaskHierarchyState } from "../src/lib/weddingTaskHierarchyState.ts";
import {
  buildWeddingOutreachEscalationState,
  buildWeddingOutreachEscalationStateFromVendorContact,
  buildWeddingVendorContactOutreachTaskItems,
} from "../src/lib/weddingOutreachEscalationState.ts";

const metadata = {
  wedding_plan_id: "wedding_plan:harbour",
  response_workspace_id: "response_workspace:outreach",
  source_response_id: "afp:response-outreach",
};

test("buildWeddingOutreachEscalationState drafts initial outreach behind approval", () => {
  const state = buildWeddingOutreachEscalationState({
    metadata,
    vendorLabel: "Harbour Hall",
    vendorTypeLabel: "Venue",
    now: "2026-09-14T00:00:00.000Z",
    createdAt: 1,
  });

  assert.equal(state.stage, "initial_outreach");
  assert.equal(state.status, "not_sent");
  assert.equal(state.options[0]?.id, "send_initial");
  assert.equal(state.options[0]?.approvalRequired, true);
  assert.equal(state.taskItem.approvalState, "pending_user_approval");
  assert.match(state.markdown, /Send only after explicit user approval/i);
});

test("buildWeddingOutreachEscalationState sends only one normal follow-up at day five", () => {
  const state = buildWeddingOutreachEscalationState({
    metadata,
    vendorLabel: "Harbour Hall",
    vendorTypeLabel: "Venue",
    initialOutreachSentAt: "2026-09-09T00:00:00.000Z",
    now: "2026-09-14T00:00:00.000Z",
    createdAt: 1,
  });

  assert.equal(state.dayCount, 5);
  assert.equal(state.stage, "follow_up_due");
  assert.equal(state.stageLabel, "Second attempt due");
  assert.deepEqual(state.options.map((option) => option.id), ["send_one_follow_up"]);
  assert.match(state.decisionPrompt, /Draft one follow-up/i);
  assert.match(state.taskItem.dueLabel ?? "", /5 days/i);
});

test("buildWeddingOutreachEscalationState escalates to user at day seven with three options", () => {
  const state = buildWeddingOutreachEscalationState({
    metadata,
    vendorLabel: "Venue X",
    vendorTypeLabel: "Venue",
    vendorPhoneLabel: "+61 2 5555 0100",
    initialOutreachSentAt: "2026-09-07T00:00:00.000Z",
    now: "2026-09-14T00:00:00.000Z",
    createdAt: 1,
  });

  assert.equal(state.dayCount, 7);
  assert.equal(state.stage, "escalate_to_user");
  assert.match(state.decisionPrompt, /follow up again, move on, or call/i);
  assert.deepEqual(state.options.map((option) => option.id), ["follow_up_again", "move_on", "call_vendor"]);
  assert.equal(state.options.find((option) => option.id === "follow_up_again")?.approvalRequired, true);
  assert.match(state.options.find((option) => option.id === "call_vendor")?.label ?? "", /\+61 2 5555 0100/);
});

test("buildWeddingOutreachEscalationState marks unresponsive at day ten and suggests alternatives", () => {
  const state = buildWeddingOutreachEscalationState({
    metadata,
    vendorLabel: "Venue X",
    vendorTypeLabel: "Venue",
    initialOutreachSentAt: "2026-09-04T00:00:00.000Z",
    now: "2026-09-14T00:00:00.000Z",
    alternativeVendorLabels: ["Venue Y", "Venue Z"],
    createdAt: 1,
  });
  const workspace = buildWeddingResponseWorkspaceState({
    metadata,
    artifacts: [state.artifactInput],
    query: "unresponsive alternatives",
  });

  assert.equal(state.dayCount, 10);
  assert.equal(state.stage, "mark_unresponsive");
  assert.equal(state.status, "unresponsive");
  assert.deepEqual(state.options.map((option) => option.id), ["suggest_alternatives", "call_vendor"]);
  assert.match(state.taskItem.title, /Mark Venue X unresponsive/i);
  assert.match(state.markdown, /Venue Y/i);
  assert.equal(workspace.resultCount, 1);
});

test("wedding outreach escalation projects artifact and task through existing queues", () => {
  const state = buildWeddingOutreachEscalationState({
    metadata,
    vendorLabel: "Venue X",
    vendorTypeLabel: "Venue",
    initialOutreachSentAt: "2026-09-07T00:00:00.000Z",
    now: "2026-09-14T00:00:00.000Z",
    alternativeVendorLabels: ["Venue Y"],
    createdAt: 1,
  });
  const queue = buildWeddingProjectionQueueState({
    artifacts: state.generatedArtifact ? [state.generatedArtifact] : [],
    taskItems: [state.taskItem],
    nowIso: "2026-09-14T00:00:00.000Z",
  });
  const taskSendInput = weddingTaskItemToAfpSendInput(state.taskItem, "2026-09-14T00:00:00.000Z");

  assert.ok(state.generatedArtifact);
  assert.equal(queue.pendingItems.length, 2);
  assert.deepEqual(queue.pendingSendInputs.map((input) => input.type), ["artifact", "task"]);
  assert.equal(taskSendInput.metadata.outreach_escalation_stage, "escalate_to_user");
  assert.equal(taskSendInput.metadata.second_order_loop, "contact_follow_up");
});

test("wedding outreach escalation remains visible in the existing task hierarchy", () => {
  const state = buildWeddingOutreachEscalationState({
    metadata,
    vendorLabel: "Venue X",
    initialOutreachSentAt: "2026-09-07T00:00:00.000Z",
    now: "2026-09-14T00:00:00.000Z",
    createdAt: 1,
  });
  const hierarchy = buildWeddingTaskHierarchyState([{
    task_id: `afp-wedding-task:${state.taskItem.id}`,
    title: state.taskItem.title,
    status: "open",
    priority: state.taskItem.priority ?? "normal",
    due_label: state.taskItem.dueLabel ?? undefined,
    wedding_task_kind: state.taskItem.kind,
    second_order_loop: (state.taskItem.metadata as Record<string, unknown>).second_order_loop as string,
    second_order_evidence_labels: ["day 7 escalation", "Venue X"],
  }], new Date("2026-09-14T00:00:00.000Z"));

  assert.equal(hierarchy.totalCount, 1);
  assert.equal(hierarchy.stages[0]?.id, "anytime");
  assert.equal(hierarchy.stages[0]?.items[0]?.loopLabel, "Contact follow-up loop");
  assert.ok(hierarchy.stages[0]?.items[0]?.evidenceLabels.includes("day 7 escalation"));
});

test("buildWeddingOutreachEscalationState closes the loop after a reply", () => {
  const state = buildWeddingOutreachEscalationState({
    metadata,
    vendorLabel: "Photo Team",
    initialOutreachSentAt: "2026-09-01T00:00:00.000Z",
    replyReceivedAt: "2026-09-12T00:00:00.000Z",
    now: "2026-09-14T00:00:00.000Z",
    createdAt: 1,
  });

  assert.equal(state.stage, "closed");
  assert.equal(state.status, "replied");
  assert.deepEqual(state.options.map((option) => option.id), ["no_action"]);
  assert.equal(state.taskItem.approvalState, "draft");
  assert.match(state.decisionPrompt, /Review the recorded response/i);
});

test("buildWeddingOutreachEscalationState uses the saved vendor reply excerpt", () => {
  const state = buildWeddingOutreachEscalationState({
    metadata,
    vendorLabel: "Photo Team",
    initialOutreachSentAt: "2026-09-01T00:00:00.000Z",
    replyReceivedAt: "2026-09-12T00:00:00.000Z",
    vendorReplySummary: "We are available and our $4,200 package includes a second photographer.",
    now: "2026-09-14T00:00:00.000Z",
    createdAt: 1,
  });

  assert.match(state.decisionPrompt, /available/i);
  assert.match(state.decisionPrompt, /second photographer/i);
});

test("buildWeddingOutreachEscalationStateFromVendorContact waits until the recorded follow-up date", () => {
  const state = buildWeddingOutreachEscalationStateFromVendorContact({
    metadata,
    now: "2026-09-14T00:00:00.000Z",
    createdAt: 1,
    vendor: {
      vendorId: "vendor:harbour-hall",
      vendorName: "Harbour Hall",
      category: "Venue",
      contactPhone: "+61 2 5555 0100",
      sourceLabel: "Editable wedding vendor directory",
      userContact: {
        contactMethod: "email",
        lastContactAt: "2026-09-12T00:00:00.000Z",
        followUpDueAt: "2026-09-17T00:00:00.000Z",
        receiptRef: "email:receipt-1",
        threadId: "thread:venue",
      },
    },
  });

  assert.equal(state.stage, "waiting_for_reply");
  assert.equal(state.status, "waiting");
  assert.equal(state.options[0]?.id, "no_action");
  assert.equal(state.taskItem.dueLabel, "Follow up on 2026-09-17");
  assert.equal((state.taskItem.metadata as Record<string, unknown>).vendor_id, "vendor:harbour-hall");
  assert.equal((state.taskItem.metadata as Record<string, unknown>).vendor_contact_receipt_ref, "email:receipt-1");
});

test("buildWeddingOutreachEscalationStateFromVendorContact converts due contact records into follow-up tasks", () => {
  const state = buildWeddingOutreachEscalationStateFromVendorContact({
    metadata,
    now: "2026-09-14T00:00:00.000Z",
    createdAt: 1,
    vendor: {
      vendorId: "vendor:photo-team",
      vendorName: "Photo Team",
      category: "Photographer",
      userContact: {
        contactMethod: "master_agent",
        lastContactAt: "2026-09-09T00:00:00.000Z",
        followUpDueAt: "2026-09-14T00:00:00.000Z",
      },
    },
  });

  assert.equal(state.stage, "follow_up_due");
  assert.equal(state.dayCount, 5);
  assert.equal(state.taskItem.kind, "vendor_follow_up");
  assert.equal((state.taskItem.metadata as Record<string, unknown>).vendor_contact_method, "master_agent");
  assert.equal((state.taskItem.metadata as Record<string, unknown>).follow_up_due_at, "2026-09-14T00:00:00.000Z");
});

test("silent vendor follow-up names relative drift only when two peer replies support it", () => {
  const tasks = buildWeddingVendorContactOutreachTaskItems({
    metadata,
    now: "2026-09-14T00:00:00.000Z",
    vendors: [{
      vendorName: "Harbour House",
      category: "Venue",
      userContact: { lastContactAt: "2026-09-08T00:00:00.000Z" },
    }, {
      vendorName: "Garden Hall",
      category: "Venue",
      userContact: { lastContactAt: "2026-09-01T00:00:00.000Z", responseReceivedAt: "2026-09-03T00:00:00.000Z" },
    }, {
      vendorName: "Stone Chapel",
      category: "Venue",
      userContact: { lastContactAt: "2026-09-04T00:00:00.000Z", responseReceivedAt: "2026-09-06T00:00:00.000Z" },
    }],
  });
  const harbour = tasks.find((task) => task.title.includes("Harbour House"));
  assert.ok(harbour);
  assert.match(harbour?.notes ?? "", /6 days vs about 2/i);
  assert.match(harbour?.notes ?? "", /Send the one follow-up/i);
  assert.equal((harbour?.metadata as Record<string, unknown>).peer_typical_reply_days, 2);
  assert.equal(harbour?.approvalState, "pending_user_approval");
});
