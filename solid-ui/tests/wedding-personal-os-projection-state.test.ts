import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingOutreachEscalationState } from "../src/lib/weddingOutreachEscalationState.ts";
import { buildWeddingPersonalOsProjectionState } from "../src/lib/weddingPersonalOsProjectionState.ts";
import type { WeddingDecisionProjectionInput } from "../src/lib/weddingDecisionAfpProjectionState.ts";
import type {
  WeddingPersistedApprovalReceipt,
  WeddingPersistedDecisionDeferral,
} from "../src/lib/weddingPersistedWorkspaceState.ts";

const now = new Date("2026-09-13T10:00:00.000Z");

test("a dedicated setup choice suppresses dependent cards until the shared prerequisite is saved", () => {
  const state = buildWeddingPersonalOsProjectionState({
    now,
    setupItems: [{
      id: "wedding-setup:date",
      kind: "decision",
      title: "Add wedding date",
      pressureFamily: "obligation",
      rankWeight: 100_000,
      dueLabel: "Start here",
      dueAt: null,
      explanation: "The date unlocks planning.",
      evidenceLabels: ["date needed"],
      sourceSurface: "decision_queue",
      actionMetadata: { wedding_setup_decision: "date", wedding_workspace_menu: "timeline" },
    }],
    taskItems: [{
      id: "legal-after-date",
      title: "Prepare the notice of intended marriage",
      kind: "legal",
      reviewStatus: "accepted",
      approvalState: "draft",
    }],
  });

  assert.ok(state.rankedItems.some((item) => item.id === "task:legal-after-date"));
  assert.deepEqual(state.decisionLoadRelief.focusItems.map((item) => item.id), ["wedding-setup:date"]);
  assert.equal(state.decisionLoadRelief.focusItems[0]?.decisionContract?.answerRecord, "wedding_event_setup");
});

test("wedding PersonalOS projection ranks evidence-backed bride/groom action items for existing field and simulator lanes", () => {
  const state = buildWeddingPersonalOsProjectionState({
    now,
    taskItems: [{
      id: "weather-backup",
      title: "Confirm wet-weather backup for Harbour House",
      kind: "vendor_follow_up",
      dueAt: "2026-09-14T09:00:00.000Z",
      dueLabel: "Before deposit",
      priority: "high",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata: {
        second_order_task: true,
        second_order_loop: "weather_backup",
        second_order_evidence_labels: ["selected venue", "no backup artifact found"],
      },
    }, {
      id: "ignored-idea",
      title: "Browse random floral ideas",
      kind: "research",
      priority: "low",
      reviewStatus: "ignored",
      approvalState: "draft",
    }],
    scheduleItems: [{
      id: "noim",
      title: "NOIM reminder",
      kind: "noim_reminder",
      startAt: "2026-09-13T12:00:00.000Z",
      dateLabel: "Due today",
      reviewStatus: "accepted",
      approvalState: "draft",
    }],
  });

  assert.equal(state.hasWeddingPersonalOsSignal, true);
  assert.equal(state.rankedItems.length, 2);
  assert.equal(state.rankedItems[0]?.title, "Confirm wet-weather backup for Harbour House");
  assert.equal(state.rankedItems[0]?.pressureFamily, "attention");
  assert.equal(state.rankedItems[0]?.simulatorSeedKind, "response");
  assert.ok(state.rankedItems[0]?.evidenceLabels.includes("Smart Action"));
  assert.ok(state.fieldEnginePrimaryType === "attention" || state.fieldEnginePrimaryType === "obligation");
  assert.match(state.fieldEngineSummary ?? "", /Wedding (attention|obligation) pressure:/);
  assert.match(state.simulatorSeedSummary ?? "", /Use existing simulator as a bounded/);
  assert.ok(state.guardrailLabels.some((label) => /existing PersonalOS field engine and simulator/i.test(label)));
});

test("wedding PersonalOS projection maps selected decisions with missing evidence into knowledge pressure", () => {
  const decision: WeddingDecisionProjectionInput = {
    id: "decision:venue",
    artifactId: "artifact:venue-shortlist",
    artifactTitle: "Venue shortlist",
    artifactKind: "vendor_table",
    sourceLabels: ["Google Places API", "source_linked"],
    sourceUrls: ["https://example.com/harbour-house"],
    sourceProviderLabels: ["google_places"],
    selectedOption: {
      id: "harbour-house",
      label: "Harbour House",
      detail: "Outdoor ceremony option",
      rowIndex: 0,
      cells: ["Harbour House", "Outdoor", "TBC wet weather"],
      preferenceSummaryLabel: "Some fit, verify backup",
      preferenceFitLabels: ["Sydney"],
      tradeoffLabels: ["Outdoor weather risk"],
      missingPreferenceLabels: ["No verified wet-weather backup"],
    },
  };

  const state = buildWeddingPersonalOsProjectionState({
    now,
    decisionItems: [decision],
  });

  assert.equal(state.fieldEnginePrimaryType, "knowledge");
  assert.equal(state.rankedItems[0]?.kind, "decision");
  assert.equal(state.rankedItems[0]?.sourceSurface, "decision_queue");
  assert.equal(state.rankedItems[0]?.simulatorSeedKind, "context");
  assert.ok(state.rankedItems[0]?.evidenceLabels.includes("provider: google_places"));
  assert.ok(state.rankedItems[0]?.evidenceLabels.includes("1 source url"));
  assert.match(state.rankedItems[0]?.explanation ?? "", /missing preference evidence/i);
});

test("wedding PersonalOS projection counts only usable selected-decision source URLs", () => {
  const state = buildWeddingPersonalOsProjectionState({
    now,
    decisionItems: [{
      id: "decision:venue",
      artifactId: "artifact:venue-shortlist",
      artifactTitle: "Venue shortlist",
      artifactKind: "vendor_table",
      sourceLabels: ["Mixed source"],
      sourceUrls: ["javascript:alert(1)", "not-a-url"],
      sourceProviderLabels: ["manual_review"],
      selectedOption: {
        id: "harbour-house",
        label: "Harbour House",
        detail: "Outdoor ceremony option",
        rowIndex: 0,
        cells: ["Harbour House", "Outdoor"],
        preferenceSummaryLabel: "No explicit preference-fit signals were detected for this row.",
        preferenceFitLabels: [],
        tradeoffLabels: ["Verify wet-weather terms"],
        missingPreferenceLabels: [],
      },
    }],
  });

  assert.equal(state.rankedItems[0]?.kind, "decision");
  assert.ok(!state.rankedItems[0]?.evidenceLabels.some((label) => /source url/i.test(label)));
});

test("wedding PersonalOS projection keeps deferred focus items out of the immediate list", () => {
  const deferrals: WeddingPersistedDecisionDeferral[] = [{
    id: "wedding_decision_deferral:workspace:task-weather-backup",
    focusItemId: "task:weather-backup",
    focusItemKind: "task",
    title: "Confirm wet-weather backup for Harbour House",
    pressureFamily: "attention",
    sourceSurface: "tasks",
    dueLabel: "Before deposit",
    dueAt: "2026-09-25T09:00:00.000Z",
    explanation: "The couple chose to decide this later.",
    evidenceLabels: ["Smart Action"],
    createdAt: "2026-09-13T10:00:00.000Z",
    metadataLabels: ["deferred decision"],
  }];
  const state = buildWeddingPersonalOsProjectionState({
    now,
    decisionDeferrals: deferrals,
    taskItems: [{
      id: "weather-backup",
      title: "Confirm wet-weather backup for Harbour House",
      kind: "vendor_follow_up",
      dueAt: "2026-09-14T09:00:00.000Z",
      dueLabel: "Before deposit",
      priority: "high",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata: {
        second_order_task: true,
        second_order_loop: "weather_backup",
        second_order_evidence_labels: ["selected venue"],
      },
    }, {
      id: "catering-count",
      title: "Confirm final catering count",
      kind: "vendor_follow_up",
      dueAt: "2026-09-14T09:00:00.000Z",
      dueLabel: "Tomorrow",
      priority: "high",
      reviewStatus: "accepted",
      approvalState: "draft",
    }],
  });

  assert.equal(state.rankedItems.some((item) => item.id === "task:weather-backup"), false);
  assert.equal(state.rankedItems.some((item) => item.id === "task:catering-count"), true);
  assert.equal(state.decisionLoadRelief.focusItems.some((item) => item.id === "task:weather-backup"), false);
});

test("wedding PersonalOS projection resurfaces deferred items when due soon", () => {
  const state = buildWeddingPersonalOsProjectionState({
    now,
    decisionDeferrals: [{
      id: "wedding_decision_deferral:workspace:task-weather-backup",
      focusItemId: "task:weather-backup",
      focusItemKind: "task",
      title: "Confirm wet-weather backup for Harbour House",
      pressureFamily: "attention",
      sourceSurface: "tasks",
      dueLabel: "Tomorrow",
      dueAt: "2026-09-14T09:00:00.000Z",
      explanation: "The couple chose to decide this later.",
      evidenceLabels: ["Smart Action"],
      createdAt: "2026-09-13T08:00:00.000Z",
      metadataLabels: ["deferred decision"],
    }],
    taskItems: [{
      id: "weather-backup",
      title: "Confirm wet-weather backup for Harbour House",
      kind: "vendor_follow_up",
      dueAt: "2026-09-14T09:00:00.000Z",
      dueLabel: "Tomorrow",
      priority: "high",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata: {
        second_order_task: true,
        second_order_loop: "weather_backup",
        second_order_evidence_labels: ["selected venue"],
      },
    }],
  });

  assert.equal(state.rankedItems.some((item) => item.id === "task:weather-backup"), true);
  assert.equal(state.decisionLoadRelief.focusItems.some((item) => item.id === "task:weather-backup"), true);
});

test("wedding PersonalOS projection resurfaces deferred items when evidence changes", () => {
  const state = buildWeddingPersonalOsProjectionState({
    now,
    decisionDeferrals: [{
      id: "wedding_decision_deferral:workspace:task-weather-backup",
      focusItemId: "task:weather-backup",
      focusItemKind: "task",
      title: "Confirm wet-weather backup for Harbour House",
      pressureFamily: "attention",
      sourceSurface: "tasks",
      dueLabel: "Before deposit",
      dueAt: "2026-09-25T09:00:00.000Z",
      explanation: "The couple chose to decide this later.",
      evidenceLabels: ["Smart Action"],
      createdAt: "2026-09-13T08:00:00.000Z",
      deferredUntilAt: "2026-09-22T09:00:00.000Z",
      staleAfterAt: "2026-09-20T08:00:00.000Z",
      dependencyFingerprint: "older-evidence-fingerprint",
      metadataLabels: ["deferred decision"],
    }],
    taskItems: [{
      id: "weather-backup",
      title: "Confirm wet-weather backup for Harbour House",
      kind: "vendor_follow_up",
      dueAt: "2026-09-25T09:00:00.000Z",
      dueLabel: "Before deposit",
      priority: "high",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata: {
        second_order_task: true,
        second_order_loop: "weather_backup",
        second_order_evidence_labels: ["new venue note added"],
      },
    }],
  });

  assert.equal(state.rankedItems.some((item) => item.id === "task:weather-backup"), true);
  assert.equal(state.decisionLoadRelief.focusItems.some((item) => item.id === "task:weather-backup"), true);
});

test("wedding PersonalOS projection resurfaces stale deferrals without due dates", () => {
  const state = buildWeddingPersonalOsProjectionState({
    now,
    decisionDeferrals: [{
      id: "wedding_decision_deferral:workspace:task-photographer",
      focusItemId: "task:photographer",
      focusItemKind: "task",
      title: "Choose photographer",
      pressureFamily: "opportunity",
      sourceSurface: "tasks",
      dueLabel: null,
      dueAt: null,
      explanation: "The couple chose to decide this later.",
      evidenceLabels: ["vendor search freshness"],
      createdAt: "2026-09-05T08:00:00.000Z",
      metadataLabels: ["deferred decision"],
    }],
    taskItems: [{
      id: "photographer",
      title: "Choose photographer",
      kind: "vendor_follow_up",
      priority: "high",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata: {
        second_order_task: true,
        second_order_loop: "vendor_search",
        second_order_evidence_labels: ["vendor search freshness"],
      },
    }],
  });

  assert.equal(state.rankedItems.some((item) => item.id === "task:photographer"), true);
});

test("wedding PersonalOS projection redacts imported selected-decision private source evidence", () => {
  const state = buildWeddingPersonalOsProjectionState({
    now,
    decisionItems: [{
      id: "decision:imported-budget",
      metadata: {
        wedding_plan_id: "wedding_plan:harbour",
        response_workspace_id: "response_workspace:planning-pass",
        supertags: ["wedding_import", "wedding_import:spreadsheet", "wedding_import_status:synthesized"],
      },
      artifactId: "artifact:imported-budget",
      artifactTitle: "Imported XLSX: private-family-budget.xlsx",
      artifactKind: "research",
      sourceLabels: ["original upload saved", "source: private-family-budget.xlsx"],
      sourceUrls: [
        "https://storage.example.test/uploads/private-family-budget.xlsx?token=private",
        "https://example.com/vendor-quote",
      ],
      sourceProviderLabels: [],
      selectedOption: {
        id: "row-1",
        label: "Budget option from upload",
        detail: "Imported row selected for follow-up",
        rowIndex: 0,
        cells: ["Budget option from upload"],
        preferenceSummaryLabel: "Imported option needs review",
        preferenceFitLabels: [],
        tradeoffLabels: ["Verify imported totals"],
        missingPreferenceLabels: [],
      },
    }],
  });
  const serialized = JSON.stringify(state);

  assert.equal(state.rankedItems[0]?.kind, "decision");
  assert.ok(state.rankedItems[0]?.evidenceLabels.includes("source: Imported private planning file"));
  assert.ok(state.rankedItems[0]?.evidenceLabels.includes("1 source url"));
  assert.equal(serialized.includes("private-family-budget.xlsx"), false);
  assert.equal(serialized.includes("storage.example.test"), false);
  assert.equal(serialized.includes("token=private"), false);
  assert.equal(serialized.includes("vendor-quote"), false);
  assert.equal(serialized.includes("original upload saved"), false);
});

test("wedding PersonalOS projection carries blocked approvals without treating executed receipts as open pressure", () => {
  const receipts: WeddingPersistedApprovalReceipt[] = [{
    id: "approval:block",
    requestId: "request:block",
    title: "Send venue follow-up email",
    status: "blocked",
    actionKind: "send_email",
    blockKind: "provider_setup",
    blockedReason: "Email provider is not connected.",
    createdAt: "2026-09-13T09:00:00.000Z",
    disclosureLines: ["Email draft requires provider setup."],
    artifactIds: ["artifact:email"],
    scheduleItemIds: [],
    taskItemIds: [],
    riskLabels: ["external send requires approval"],
    externalId: null,
  }, {
    id: "approval:done",
    requestId: "request:done",
    title: "Already sent email",
    status: "executed",
    actionKind: "send_email",
    blockKind: null,
    blockedReason: null,
    createdAt: "2026-09-13T08:00:00.000Z",
    disclosureLines: ["Email was already executed."],
    artifactIds: [],
    scheduleItemIds: [],
    taskItemIds: [],
    riskLabels: [],
    externalId: "msg-1",
  }];

  const state = buildWeddingPersonalOsProjectionState({
    now,
    approvalReceipts: receipts,
  });

  assert.equal(state.rankedItems.length, 1);
  assert.equal(state.rankedItems[0]?.kind, "approval");
  assert.equal(state.rankedItems[0]?.pressureFamily, "attention");
  assert.equal(state.rankedItems[0]?.sourceSurface, "approval_queue");
  assert.match(state.rankedItems[0]?.explanation ?? "", /Email provider is not connected/);
});

test("wedding PersonalOS projection prioritizes day-seven outreach escalation over ordinary follow-up", () => {
  const escalation = buildWeddingOutreachEscalationState({
    metadata: {
      wedding_plan_id: "wedding_plan:harbour",
      response_workspace_id: "response_workspace:outreach",
    },
    vendorLabel: "Venue X",
    vendorPhoneLabel: "+61 2 5555 0100",
    initialOutreachSentAt: "2026-09-06T10:00:00.000Z",
    now: "2026-09-13T10:00:00.000Z",
    createdAt: 1,
  });
  const state = buildWeddingPersonalOsProjectionState({
    now,
    taskItems: [
      escalation.taskItem,
      {
        id: "ordinary-follow-up",
        title: "Check florist availability",
        kind: "vendor_follow_up",
        priority: "normal",
        reviewStatus: "accepted",
        approvalState: "draft",
      },
    ],
  });

  assert.equal(state.rankedItems[0]?.title, "Decide next outreach step for Venue X");
  assert.ok(state.rankedItems[0]?.evidenceLabels.includes("day 7 escalation"));
  assert.match(state.rankedItems[0]?.explanation ?? "", /final follow-up, move on, or call/i);
  assert.equal(state.rankedItems[0]?.pressureFamily, "attention");
  assert.equal(state.rankedItems[0]?.simulatorSeedKind, "response");
});

test("wedding PersonalOS projection ranks delegated responsibility confirmation tasks", () => {
  const state = buildWeddingPersonalOsProjectionState({
    now,
    taskItems: [{
      id: "wedding_delegation:legal-noim:maya-chen",
      title: "Confirm Maya Chen owns Legal and NOIM",
      kind: "vendor_coordination",
      priority: "high",
      assignee: "Maya Chen",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata: {
        delegation_task: true,
        delegated_category: "legal_noim",
        delegated_scope_label: "Legal and NOIM",
        delegate_name: "Maya Chen",
      },
    }],
  });

  assert.equal(state.rankedItems[0]?.title, "Confirm Maya Chen owns Legal and NOIM");
  assert.ok(state.rankedItems[0]?.evidenceLabels.includes("delegated responsibility"));
  assert.match(state.rankedItems[0]?.explanation ?? "", /ownership should be confirmed/i);
});

test("wedding PersonalOS projection ranks final-phase coordination tasks", () => {
  const state = buildWeddingPersonalOsProjectionState({
    now,
    taskItems: [{
      id: "wedding_task:final-phase:final-vendor-confirmations:workspace",
      title: "Confirm final vendors, balances, and payment deadlines",
      kind: "vendor_coordination",
      priority: "high",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata: {
        final_phase_task: true,
        final_phase_action_id: "final-vendor-confirmations",
        second_order_loop: "commitment_timing",
      },
    }],
  });

  assert.equal(state.rankedItems[0]?.title, "Confirm final vendors, balances, and payment deadlines");
  assert.ok(state.rankedItems[0]?.evidenceLabels.includes("final-phase coordination"));
  assert.match(state.rankedItems[0]?.explanation ?? "", /run sheet, confirmations, day-of fallback/i);
});

test("wedding PersonalOS projection ranks legal administration tasks", () => {
  const state = buildWeddingPersonalOsProjectionState({
    now,
    taskItems: [{
      id: "wedding_task:legal-doc:proof-of-birth:workspace",
      title: "Confirm proof of date/place of birth documents",
      kind: "document_checklist",
      priority: "high",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata: {
        legal_administration_task: true,
        legal_document_checklist_item: "proof-of-birth",
        second_order_loop: "commitment_timing",
      },
    }],
  });

  assert.equal(state.rankedItems[0]?.title, "Confirm proof of date/place of birth documents");
  assert.ok(state.rankedItems[0]?.evidenceLabels.includes("legal administration"));
  assert.match(state.rankedItems[0]?.explanation ?? "", /no form is lodged automatically/i);
});

test("wedding PersonalOS projection ranks vendor search freshness tasks", () => {
  const state = buildWeddingPersonalOsProjectionState({
    now,
    taskItems: [{
      id: "wedding_vendor_search_task:verify-price-availability:workspace",
      title: "Verify price, package inclusions, and availability for selected vendors",
      kind: "budget_review",
      priority: "high",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata: {
        vendor_search_review_task: true,
        vendor_search_action_id: "verify-price-availability",
        source_verification_required: true,
        vendor_price_freshness_required: true,
        vendor_availability_freshness_required: true,
        second_order_loop: "vendor_evidence_freshness",
      },
    }],
  });

  assert.equal(state.rankedItems[0]?.title, "Verify price, package inclusions, and availability for selected vendors");
  assert.ok(state.rankedItems[0]?.evidenceLabels.includes("vendor search freshness"));
  assert.match(state.rankedItems[0]?.explanation ?? "", /Review the shortlist and choose who you want to contact/i);
});

test("wedding PersonalOS projection ranks top-three vendor comparison decisions", () => {
  const state = buildWeddingPersonalOsProjectionState({
    now,
    taskItems: [{
      id: "wedding_vendor_search_task:choose-top-vendor-comparison:workspace",
      title: "Choose preferred vendors from the top-three comparison",
      kind: "decision",
      priority: "high",
      reviewStatus: "accepted",
      approvalState: "draft",
      linkedArtifactId: "wedding_artifact:vendor_comparison_top3:workspace",
      metadata: {
        vendor_search_review_task: true,
        vendor_comparison_decision_task: true,
        vendor_search_action_id: "choose-top-vendor-comparison",
        vendor_comparison_top_choice_labels: ["Harbour Studio", "Budget Lens", "Portrait Hall"],
        selected_decision_required: true,
        wedding_workspace_menu: "documents",
        second_order_loop: "vendor_choice_narrowing",
      },
    }],
  });

  assert.equal(state.rankedItems[0]?.title, "Choose preferred vendors from the top-three comparison");
  assert.ok(state.rankedItems[0]?.evidenceLabels.includes("top-three vendor comparison"));
  assert.equal(state.rankedItems[0]?.linkedArtifactId, "wedding_artifact:vendor_comparison_top3:workspace");
  assert.equal(state.rankedItems[0]?.workspaceMenu, "documents");
  assert.match(state.rankedItems[0]?.explanation ?? "", /choose preferred vendors before outreach/i);
  assert.equal(state.decisionLoadRelief.focusItems[0]?.title, "Choose preferred vendors from the top-three comparison");
});

test("wedding PersonalOS projection explains seeded vendor review tasks", () => {
  const state = buildWeddingPersonalOsProjectionState({
    now,
    taskItems: [{
      id: "wedding_vendor_seed_task:verify-seeded-price-availability:workspace",
      title: "Verify seeded vendor price and date-specific availability",
      kind: "research",
      priority: "high",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata: {
        vendor_search_review_task: true,
        vendor_seed_review_task: true,
        vendor_seed_action_id: "verify-seeded-price-availability",
        second_order_loop: "vendor_evidence_freshness",
      },
    }],
  });

  assert.equal(state.rankedItems[0]?.title, "Verify seeded vendor price and date-specific availability");
  assert.ok(state.rankedItems[0]?.evidenceLabels.includes("seeded vendor data"));
  assert.match(state.rankedItems[0]?.explanation ?? "", /planning hints only/i);
});

test("wedding PersonalOS projection ranks expected-behavior gap tasks", () => {
  const state = buildWeddingPersonalOsProjectionState({
    now,
    taskItems: [{
      id: "wedding_task:expected-behavior:weather-contingency:workspace",
      title: "Connect verified weather contingency evidence",
      kind: "weather_contingency",
      priority: "high",
      reviewStatus: "needs_review",
      approvalState: "draft",
      metadata: {
        expected_behavior_gap: true,
        expected_behavior_capability: "weather_contingency",
        expected_behavior_status: "provider_blocked",
        expected_behavior_blocker_labels: ["Needs BOM/weather provider evidence before calling forecasts verified."],
        second_order_loop: "weather_backup",
      },
    }],
  });

  assert.equal(state.rankedItems[0]?.title, "Connect verified weather contingency evidence");
  assert.ok(state.rankedItems[0]?.evidenceLabels.includes("launch check"));
  assert.match(state.rankedItems[0]?.explanation ?? "", /needs proof/i);
});

test("wedding PersonalOS projection ranks live launch check tasks", () => {
  const state = buildWeddingPersonalOsProjectionState({
    now,
    taskItems: [{
      id: "wedding_oracle_update_task:prod:blocker",
      title: "Finish launch check: Provider executor integrations",
      kind: "other",
      priority: "urgent",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata: {
        oracle_update_plan_task: true,
        oracle_update_step_kind: "blocked",
        oracle_update_step_id: "oracle-update-blocker:1",
        oracle_update_target_label: "Oracle wedding prod",
        oracle_update_blocked: true,
        production_readiness_oracle_gate: true,
        oracle_update_blocker_labels: ["Provider executor integrations"],
        second_order_loop: "commitment_timing",
      },
    }],
  });

  assert.equal(state.rankedItems[0]?.title, "Finish launch check: Provider executor integrations");
  assert.ok(state.rankedItems[0]?.evidenceLabels.includes("live update check"));
  assert.match(state.rankedItems[0]?.explanation ?? "", /cannot be updated/i);
});

test("wedding PersonalOS projection ranks production remaining-work tasks", () => {
  const state = buildWeddingPersonalOsProjectionState({
    now,
    taskItems: [{
      id: "wedding_production_remaining_work:provider-executor-integrations",
      title: "Clear launch blocker: Connected app integrations",
      kind: "vendor_coordination",
      priority: "urgent",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata: {
        production_remaining_work_task: true,
        production_remaining_work_item_id: "provider_executor_integrations",
        production_remaining_work_tier: "oracle_blocker",
        production_remaining_work_required_for_oracle: true,
        production_remaining_work_estimated_passes: 2,
        production_readiness_oracle_gate: true,
        second_order_loop: "commitment_timing",
      },
    }],
  });

  assert.equal(state.rankedItems[0]?.title, "Clear launch blocker: Connected app integrations");
  assert.ok(state.rankedItems[0]?.evidenceLabels.includes("launch blocker"));
  assert.match(state.rankedItems[0]?.explanation ?? "", /must clear before Oracle upload/i);
});

test("wedding PersonalOS respects an explicit focus limit while retaining ordinary planning tasks", () => {
  const decision: WeddingDecisionProjectionInput = {
    id: "decision:venue",
    artifactId: "artifact:venue-shortlist",
    artifactTitle: "Venue shortlist",
    artifactKind: "vendor_table",
    sourceLabels: ["source_linked"],
    sourceUrls: ["https://example.com/venue"],
    sourceProviderLabels: ["google_places"],
    selectedOption: {
      id: "harbour-house",
      label: "Harbour House",
      detail: "Outdoor ceremony option",
      rowIndex: 0,
      cells: ["Harbour House", "Outdoor", "TBC wet weather"],
      preferenceSummaryLabel: "Some fit, verify backup",
      preferenceFitLabels: ["Sydney"],
      tradeoffLabels: ["Outdoor weather risk"],
      missingPreferenceLabels: ["No verified wet-weather backup"],
    },
  };
  const state = buildWeddingPersonalOsProjectionState({
    now,
    decisionFocusLimit: 2,
    decisionItems: [decision],
    taskItems: [{
      id: "final-count",
      title: "Decide final caterer headcount",
      kind: "decision",
      priority: "high",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata: { guest_final_count_decision: true },
    }, {
      id: "payment-review",
      title: "Verify venue balance before payment",
      kind: "budget_review",
      priority: "high",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata: { budget_payment_review: true },
    }, {
      id: "ordinary",
      title: "Pack emergency kit",
      kind: "other",
      priority: "normal",
      reviewStatus: "accepted",
      approvalState: "draft",
    }],
  });

  assert.equal(state.decisionLoadRelief.focusLimit, 2);
  assert.equal(state.decisionLoadRelief.focusItems.length, 2);
  assert.equal(state.decisionLoadRelief.backlogCount, 2);
  assert.match(state.decisionLoadRelief.summaryLabel, /2 things need your attention; 2 can wait/);
  assert.ok(state.decisionLoadRelief.focusItems.some((item) => /Decide final caterer headcount|Verify venue balance/i.test(item.title)));
  assert.equal(state.decisionLoadRelief.focusItems.some((item) => /Pack emergency kit/i.test(item.title)), false);
  assert.ok(state.rankedItems.some((item) => /Pack emergency kit/i.test(item.title)));
  assert.deepEqual(state.decisionLoadRelief.reliefLabels, []);
});

test("wedding PersonalOS drops to one focus when decisions are piling up", () => {
  const tasks = Array.from({ length: 7 }, (_, index) => ({
    id: `task-${index + 1}`,
    title: `Planning task ${index + 1}`,
    kind: "other" as const,
    priority: "normal" as const,
    approvalState: "draft" as const,
  }));
  const state = buildWeddingPersonalOsProjectionState({ now, taskItems: tasks });

  assert.equal(state.decisionLoadRelief.focusItems.length, 1);
  assert.equal(state.decisionLoadRelief.backlogCount, 6);
  assert.equal(state.decisionLoadRelief.focusLimit, 1);
  assert.equal(state.rankedItems.length, 7);
});

test("a vendor-stated hold inside seven days outranks an otherwise identical undated card", () => {
  const task = (id: string, metadata: Record<string, unknown> = {}) => ({
    id,
    title: id === "hold" ? "Hold Harbour House for 20 November?" : "Review florist option",
    kind: "decision" as const,
    priority: "normal" as const,
    reviewStatus: "accepted" as const,
    approvalState: "draft" as const,
    metadata: { requirements_confirmed: true, ...metadata },
  });
  const state = buildWeddingPersonalOsProjectionState({
    now: new Date("2026-10-06T00:00:00Z"),
    taskItems: [
      task("undated"),
      task("hold", { vendor_date_hold_expires_at: "2026-10-10T00:00:00Z", venue_decision_state: "hold_expiring" }),
    ],
  });
  assert.equal(state.rankedItems[0]?.id, "task:hold");
  assert.equal(state.rankedItems[0]?.dueAt, "2026-10-10T00:00:00Z");
  assert.match(state.rankedItems[0]?.dueLabel ?? "", /date hold expires/i);
  assert.ok(state.rankedItems[0]?.evidenceLabels.some((label) => /Vendor date hold expires 2026-10-10/.test(label)));
  assert.equal(state.rankedItems[1]?.dueAt, null);
});

test("queue pressure explains venue-first relief and only reports sourced weekly catches", () => {
  const tasks = Array.from({ length: 5 }, (_, index) => ({
    id: `task-${index + 1}`,
    title: index === 0 ? "Compare venue shortlist" : `Open decision ${index + 1}`,
    kind: "decision" as const,
    priority: index === 0 ? "high" as const : "normal" as const,
    reviewStatus: "accepted" as const,
    approvalState: "draft" as const,
    metadata: index === 0 ? {
      requirements_confirmed: true,
      vendor_lead_time_research_task: true,
      vendor_lead_time_category_id: "venue",
      vendor_lead_time_must_decide_first: true,
      recent_focus_switch_count: 4,
      watcher_caught_kind: "expiring_hold",
      watcher_caught_at: "2026-10-04T00:00:00Z",
      checks_completed: 2,
      checks_total: 3,
    } : { requirements_confirmed: true },
  }));
  const state = buildWeddingPersonalOsProjectionState({ now: new Date("2026-10-06T00:00:00Z"), taskItems: tasks });
  assert.equal(state.decisionLoadRelief.focusItems.length, 1);
  assert.ok(state.decisionLoadRelief.reliefLabels.some((label) => /wait on the venue/i.test(label)));
  assert.ok(state.decisionLoadRelief.reliefLabels.some((label) => /Finish the venue shortlist/i.test(label)));
  assert.ok(state.decisionLoadRelief.reliefLabels.some((label) => /2 of 3 checks done/i.test(label)));
  assert.ok(state.decisionLoadRelief.reliefLabels.some((label) => /This week OmnyID caught 1 expiring hold/i.test(label)));
});

test("wedding PersonalOS uses must-decide-first as a bounded vendor urgency tie-break", () => {
  const vendorTask = (category: "venue" | "florist", priority: "normal" | "high" = "normal") => ({
    id: `lead-time-${category}`,
    title: `Search for ${category}`,
    kind: "research" as const,
    priority,
    reviewStatus: "accepted" as const,
    approvalState: "draft" as const,
    metadata: {
      vendor_lead_time_research_task: true,
      vendor_lead_time_category_id: category,
      vendor_lead_time_label: category === "venue" ? "Venue" : "Florist",
      vendor_lead_time_status: "open",
      vendor_lead_time_urgency_score: 32,
      vendor_lead_time_must_decide_first: category === "venue",
      vendor_search_review_task: true,
    },
  });

  const tied = buildWeddingPersonalOsProjectionState({
    now,
    taskItems: [vendorTask("florist"), vendorTask("venue")],
  });
  assert.equal(tied.rankedItems[0]?.actionMetadata?.vendor_lead_time_category_id, "venue");
  assert.equal((tied.rankedItems[0]?.rankWeight ?? 0) - (tied.rankedItems[1]?.rankWeight ?? 0), 2);

  const materiallyMoreUrgent = buildWeddingPersonalOsProjectionState({
    now,
    taskItems: [vendorTask("venue"), vendorTask("florist", "high")],
  });
  assert.equal(materiallyMoreUrgent.rankedItems[0]?.actionMetadata?.vendor_lead_time_category_id, "florist");
});
