import assert from "node:assert/strict";
import test from "node:test";

import type { WeddingDecisionProjectionInput } from "@/lib/weddingDecisionAfpProjectionState";
import { buildWeddingProjectionQueueViewState } from "@/lib/weddingProjectionQueueViewState";
import { buildWeddingSelectedVendorFollowUpCtaState } from "@/lib/weddingSelectedVendorFollowUpCtaState";
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
  };
}

const metadata = {
  wedding_plan_id: "wedding_plan:harbour",
  response_workspace_id: "response_workspace:planning-pass",
  source_response_id: "afp:response-1",
};

function selectedVendorDecision(): WeddingDecisionProjectionInput {
  return {
    id: "wedding_decision:workspace:vendor-comparison:harbour-studio",
    metadata: {
      ...metadata,
      source: "vendor_search_comparison",
      vendorComparisonSelection: {
        selectedVendorsContinueToFollowUp: true,
        unselectedVendorsLeaveActiveQueues: true,
        approvalRequiredBeforeOutreach: true,
        noExternalSendWithoutApproval: true,
      },
    },
    artifactId: "artifact:top-vendor-comparison",
    artifactTitle: "Top vendor comparison",
    artifactKind: "vendor_table",
    selectedOption: {
      id: "vendor_choice:harbour_studio:1",
      rowIndex: 0,
      label: "Harbour Studio",
      detail: "Sydney documentary wedding photographer with transparent packages.",
      cells: ["#1 Harbour Studio", "Transparent packages", "https://harbour-studio.example"],
      selected: true,
      preferenceFitLabels: ["documentary"],
      missingPreferenceLabels: [],
      tradeoffLabels: [],
      preferenceSummaryLabel: "Selected by user",
    },
  };
}

function selectedVendorDraftTask(): WeddingPlanningTaskItem {
  return {
    id: "task:vendor-outreach:harbour",
    title: "Draft outreach to Harbour Studio",
    kind: "vendor_follow_up",
    priority: "high",
    source: "agent",
    reviewStatus: "accepted",
    approvalState: "draft",
    metadata: {
      ...metadata,
      vendor_outreach_from_selected_decision: true,
      vendor_outreach_vendor_label: "Harbour Studio",
      vendor_outreach_draft_subject: "Wedding quote request",
      vendor_outreach_draft_body: "Please confirm availability and current quote details.",
      vendor_outreach_draft_requires_approval: true,
      approval_required_before_outreach: true,
    },
  };
}

test("buildWeddingSelectedVendorFollowUpCtaState points selected vendor decisions to the approval card", () => {
  const queue = buildWeddingProjectionQueueViewState({
    decisionItems: [selectedVendorDecision()],
    storage: memoryStorage(),
  });
  const state = buildWeddingSelectedVendorFollowUpCtaState(queue);

  assert.equal(state.target, "projection_queue");
  assert.equal(state.targetSectionId, "approval");
  assert.equal(state.shouldScrollToTarget, true);
  assert.match(state.noticeLabel, /Selected vendor decision ready to save/i);
  assert.match(state.noticeLabel, /move unselected vendors to the log/i);
});

test("buildWeddingSelectedVendorFollowUpCtaState distinguishes vendor draft tasks from external sends", () => {
  const queue = buildWeddingProjectionQueueViewState({
    taskItems: [selectedVendorDraftTask()],
    storage: memoryStorage(),
  });
  const state = buildWeddingSelectedVendorFollowUpCtaState(queue);

  assert.equal(state.target, "projection_queue");
  assert.equal(state.targetSectionId, "approval");
  assert.equal(state.shouldScrollToTarget, true);
  assert.match(state.noticeLabel, /Vendor follow-up draft ready to save/i);
  assert.match(state.noticeLabel, /without sending anything externally/i);
});

test("buildWeddingSelectedVendorFollowUpCtaState explains combined selected-vendor decisions and drafts", () => {
  const queue = buildWeddingProjectionQueueViewState({
    decisionItems: [selectedVendorDecision()],
    taskItems: [selectedVendorDraftTask()],
    storage: memoryStorage(),
  });
  const state = buildWeddingSelectedVendorFollowUpCtaState(queue);

  assert.equal(state.target, "projection_queue");
  assert.equal(state.targetSectionId, "approval");
  assert.equal(state.shouldScrollToTarget, true);
  assert.match(state.noticeLabel, /Selected vendor decision and follow-up draft task ready to save/i);
  assert.match(state.noticeLabel, /move unselected vendors to the log/i);
  assert.match(state.noticeLabel, /without sending anything externally/i);
});

test("buildWeddingSelectedVendorFollowUpCtaState handles empty queues calmly", () => {
  const state = buildWeddingSelectedVendorFollowUpCtaState(null);

  assert.equal(state.target, "saved_or_empty");
  assert.equal(state.targetSectionId, null);
  assert.equal(state.shouldScrollToTarget, false);
  assert.match(state.noticeLabel, /No selected-vendor follow-up is waiting/i);
});
