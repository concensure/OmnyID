import assert from "node:assert/strict";
import test from "node:test";

import {
  WEDDING_CALENDAR_AFP_PROJECTIONS_KEY,
  WEDDING_TASK_AFP_PROJECTIONS_KEY,
  afpWeddingCalendarMessageToCalendarEvent,
  buildWeddingTaskAlertReminderScheduleItems,
  hasSentWeddingProjection,
  loadWeddingProjectionIds,
  markWeddingProjectionSent,
  shouldProjectWeddingScheduleItemToAfpCalendarEvent,
  shouldProjectWeddingTaskItemToAfpTaskMessage,
  unmarkWeddingProjectionSent,
  weddingScheduleItemToAfpCalendarMessage,
  weddingScheduleItemToAfpSendInput,
  weddingScheduleItemToCalendarEvent,
  weddingScheduleItemsToAfpCalendarMessages,
  weddingTaskItemToAfpSendInput,
  weddingTaskItemToAfpTaskMessage,
  weddingTaskItemsToAfpTaskMessages,
  type WeddingPlanningScheduleItem,
  type WeddingPlanningTaskItem,
} from "../src/lib/weddingCalendarProjectionState.ts";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const scheduleItem: WeddingPlanningScheduleItem = {
  id: "venue-tour-1",
  title: "Tour Harbour House",
  kind: "venue_tour",
  dateLabel: "Saturday morning",
  startAt: "2027-02-06T10:00:00+11:00",
  endAt: "2027-02-06T11:00:00+11:00",
  location: "Sydney Harbour",
  participants: ["partner"],
  source: "agent",
  approvalState: "approved",
  metadata: {
    wedding_plan_id: "wedding_plan:harbour",
    response_workspace_id: "response_workspace:venue-pass",
    source_response_id: "afp:response-1",
    supertags: ["wedding_vendor:venue"],
  },
  linkedArtifactId: "wedding_artifact:venue-table",
  notes: "Confirm wet-weather backup and minimum spend.",
};

const taskItem: WeddingPlanningTaskItem = {
  id: "follow-up-caterer",
  title: "Ask caterer for vegetarian pricing",
  kind: "vendor_follow_up",
  dueAt: "2027-01-15T17:00:00+11:00",
  priority: "high",
  assignee: "Ozan",
  source: "agent",
  approvalState: "draft",
  metadata: {
    wedding_plan_id: "wedding_plan:harbour",
    response_workspace_id: "response_workspace:venue-pass",
    source_response_id: "afp:response-1",
  },
  linkedArtifactId: "wedding_artifact:catering-research",
};

test("wedding schedule items project to first-class AFP calendar events", () => {
  assert.equal(shouldProjectWeddingScheduleItemToAfpCalendarEvent(scheduleItem), true);

  const message = weddingScheduleItemToAfpCalendarMessage(scheduleItem, "2026-09-11T00:00:00.000Z");
  assert.ok(message);
  assert.equal(message.type, "calendar_event");
  assert.equal(message.kind, "event");
  assert.equal(message.subtype, "wedding_event");
  assert.deepEqual(message.to, ["agent://calendar", "agent://wedding-planning"]);
  assert.ok(message.supertags?.includes("template:wedding_planning"));
  assert.ok(message.supertags?.includes("wedding_calendar:venue_tour"));
  assert.ok(message.supertags?.includes("approval:approved"));
  assert.equal(message.content.start_at, "2027-02-06T10:00:00+11:00");
  assert.equal(message.content.status, "confirmed");
  assert.equal(message.metadata?.wedding_plan_id, "wedding_plan:harbour");
  assert.equal(message.metadata?.projection, "wedding_schedule_item_to_afp_calendar_event");
  assert.equal(message.views[0]?.format, "calendar");
  assert.equal(message.references?.[0]?.type, "wedding_response");
  assert.equal(message.references?.[1]?.type, "wedding_artifact");
});

test("wedding schedule projection stays conservative for missing or review-only dates", () => {
  assert.equal(shouldProjectWeddingScheduleItemToAfpCalendarEvent({ ...scheduleItem, startAt: null }), false);
  assert.equal(shouldProjectWeddingScheduleItemToAfpCalendarEvent({ ...scheduleItem, reviewStatus: "needs_review" }), false);
  assert.equal(shouldProjectWeddingScheduleItemToAfpCalendarEvent({ ...scheduleItem, reviewStatus: "ignored" }), false);
  assert.equal(weddingScheduleItemsToAfpCalendarMessages([
    scheduleItem,
    { ...scheduleItem, id: "missing-date", startAt: null },
  ]).length, 1);
});

test("wedding AFP calendar messages convert into calendar view events", () => {
  const message = weddingScheduleItemToAfpCalendarMessage(scheduleItem);
  assert.ok(message);

  const event = afpWeddingCalendarMessageToCalendarEvent(message);
  assert.ok(event);
  assert.equal(event.id, message.id);
  assert.equal(event.title, "Tour Harbour House");
  assert.equal(event.location, "Sydney Harbour");
  assert.equal(event.status, "confirmed");
  assert.equal(event.profile?.wedding_plan_id, "wedding_plan:harbour");
  assert.deepEqual(event.profile?.supertags, message.supertags);

  const directEvent = weddingScheduleItemToCalendarEvent(scheduleItem);
  assert.equal(directEvent?.title, "Tour Harbour House");
});

test("wedding AFP calendar conversion does not render encrypted event content while locked", () => {
  const message = weddingScheduleItemToAfpCalendarMessage(scheduleItem);
  assert.ok(message);
  const encrypted = {
    ...message,
    content: {
      ...message.content,
      title: "Hidden venue tour",
      start_at: "2027-02-06T10:00:00+11:00",
      ciphertext: "abc123",
      nonce: "nonce123",
    },
    encryption: { scheme: "xchacha20-poly1305", key_id: "device-key" },
  } as any;

  assert.equal(afpWeddingCalendarMessageToCalendarEvent(encrypted), null);
});

test("wedding task items project to first-class AFP task messages", () => {
  assert.equal(shouldProjectWeddingTaskItemToAfpTaskMessage(taskItem), true);

  const message = weddingTaskItemToAfpTaskMessage(taskItem, "2026-09-11T00:00:00.000Z");
  assert.ok(message);
  assert.equal(message.type, "task");
  assert.equal(message.kind, "task");
  assert.equal(message.subtype, "wedding_task");
  assert.deepEqual(message.to, ["agent://tasks", "agent://wedding-planning"]);
  assert.ok(message.supertags?.includes("wedding_task:vendor_follow_up"));
  assert.ok(message.supertags?.includes("priority:high"));
  assert.ok(message.supertags?.includes("assignee:ozan"));
  assert.equal(message.content.task_id, "afp-wedding-task:follow-up-caterer");
  assert.equal(message.content.due_at, "2027-01-15T17:00:00+11:00");
  assert.equal(message.content.due_date, "2027-01-15T17:00:00+11:00");
  assert.equal(message.content.milestone, "Wedding preparation");
  assert.equal(message.content.priority, "high");
  assert.equal(message.metadata?.projection, "wedding_task_item_to_afp_task");
  assert.equal(message.views[0]?.format, "task");
});

test("wedding task projection excludes ignored or archived items but allows actionable drafts", () => {
  assert.equal(shouldProjectWeddingTaskItemToAfpTaskMessage({ ...taskItem, reviewStatus: "ignored" }), false);
  assert.equal(shouldProjectWeddingTaskItemToAfpTaskMessage({ ...taskItem, approvalState: "archived" }), false);
  assert.equal(weddingTaskItemsToAfpTaskMessages([
    taskItem,
    { ...taskItem, id: "ignored", reviewStatus: "ignored" },
  ]).length, 1);
});

test("wedding task projection preserves second-order loop metadata", () => {
  const message = weddingTaskItemToAfpTaskMessage({
    ...taskItem,
    id: "second-order-weather",
    title: "Confirm wet-weather backup for Harbour Hall",
    metadata: {
      ...(taskItem.metadata as Record<string, unknown>),
      second_order_task: true,
      second_order_loop: "weather_backup",
      second_order_evidence_labels: ["weather-exposed plan", "selected scope: venue: Harbour Hall"],
      selected_decision_scope: {
        selected_option_label: "Harbour Hall",
        artifact_id: "artifact:venue-shortlist",
      },
    },
  });

  assert.ok(message);
  assert.equal(message.metadata?.second_order_task, true);
  assert.equal(message.metadata?.second_order_loop, "weather_backup");
  assert.deepEqual(message.metadata?.second_order_evidence_labels, ["weather-exposed plan", "selected scope: venue: Harbour Hall"]);
  assert.equal((message.metadata?.selected_decision_scope as Record<string, unknown>).selected_option_label, "Harbour Hall");
  assert.ok((message.metadata?.searchable_terms as string[]).includes("weather_backup"));
  assert.ok((message.metadata?.searchable_terms as string[]).includes("Harbour Hall"));
});

test("wedding task projection redacts imported selected-decision scope metadata", () => {
  const message = weddingTaskItemToAfpTaskMessage({
    ...taskItem,
    id: "imported-scope-review",
    title: "Review selected imported budget option",
    metadata: {
      ...(taskItem.metadata as Record<string, unknown>),
      selected_decision_scope: {
        selected_option_label: "Garden Hall",
        artifact_title: "Imported XLSX: private-family-budget.xlsx",
        artifactTitle: "Imported XLSX: private-family-budget.xlsx",
        source_labels: ["original upload saved", "source: private-family-budget.xlsx"],
        sourceLabels: ["source: private-family-budget.xlsx"],
        source_urls: [
          "https://storage.example.test/uploads/private-family-budget.xlsx?token=private",
          "https://example.com/vendor-quote",
        ],
        sourceUrls: ["https://storage.example.test/uploads/private-family-budget.xlsx?token=private"],
        metadata_labels: ["source: private-family-budget.xlsx", "needs follow-up"],
        metadataLabels: ["wedding_import:spreadsheet"],
      },
    },
  });
  assert.ok(message);
  const selectedScope = message.metadata?.selected_decision_scope as Record<string, unknown>;
  const serialized = JSON.stringify(message.metadata);

  assert.equal(selectedScope.artifact_title, "Imported private planning file");
  assert.deepEqual(selectedScope.source_labels, ["Imported private planning file"]);
  assert.deepEqual(selectedScope.source_urls, ["https://example.com/vendor-quote"]);
  assert.deepEqual(selectedScope.metadata_labels, ["needs follow-up"]);
  assert.equal(selectedScope.selected_option_label, "Garden Hall");
  assert.equal(selectedScope.artifactTitle, undefined);
  assert.equal(selectedScope.sourceLabels, undefined);
  assert.equal(selectedScope.sourceUrls, undefined);
  assert.equal(selectedScope.metadataLabels, undefined);
  assert.equal(serialized.includes("private-family-budget.xlsx"), false);
  assert.equal(serialized.includes("storage.example.test"), false);
  assert.equal(serialized.includes("token=private"), false);
  assert.equal(serialized.includes("original upload saved"), false);
  assert.equal(serialized.includes("wedding_import:spreadsheet"), false);
});

test("wedding task projection preserves preparation checklist alert metadata", () => {
  const message = weddingTaskItemToAfpTaskMessage({
    ...taskItem,
    id: "prep-cake",
    title: "Book cake baker, tasting, design, delivery, and cutting plan",
    kind: "cake",
    dueAt: "2027-07-20T10:00:00.000Z",
    dueLabel: "6-9 months out; final details 4-6 weeks out",
    metadata: {
      ...(taskItem.metadata as Record<string, unknown>),
      preparation_checklist: true,
      preparation_checklist_item: "cake",
      alert_offset_days: [60, 30, 14],
      schedule_basis: "wedding_date",
      second_order_loop: "vendor_confirmation",
      user_selectable: true,
      can_deselect_before_commit: true,
    },
  }, "2026-09-11T00:00:00.000Z");

  assert.ok(message);
  assert.equal(message.content.preparation_checklist, true);
  assert.equal(message.content.preparation_checklist_item, "cake");
  assert.deepEqual(message.content.alert_offset_days, [60, 30, 14]);
  assert.deepEqual(message.content.alert_dates, ["2027-05-21", "2027-06-20", "2027-07-06"]);
  assert.equal(message.content.schedule_basis, "wedding_date");
  assert.equal(message.content.second_order_loop, "vendor_confirmation");
  assert.deepEqual(message.content.second_order_evidence_labels, [
    "Alert 60 days before",
    "Alert 30 days before",
    "Alert 14 days before",
  ]);
  assert.equal(message.metadata?.preparation_checklist_item, "cake");
  assert.deepEqual(message.metadata?.alert_offset_days, [60, 30, 14]);
  assert.deepEqual(message.metadata?.alert_dates, ["2027-05-21", "2027-06-20", "2027-07-06"]);
  assert.ok((message.metadata?.searchable_terms as string[]).includes("Alert 30 days before"));
  assert.ok((message.metadata?.searchable_terms as string[]).includes("2027-06-20"));
  assert.equal(message.views[0]?.content.preparation_checklist_item, "cake");
  assert.deepEqual(message.views[0]?.content.alert_dates, ["2027-05-21", "2027-06-20", "2027-07-06"]);
});

test("wedding task projection preserves final-phase search metadata", () => {
  const message = weddingTaskItemToAfpTaskMessage({
    ...taskItem,
    id: "final-vendor-confirmations",
    title: "Confirm final vendors, balances, and payment deadlines",
    kind: "vendor_coordination",
    dueLabel: "Before final vendor deadlines",
    metadata: {
      ...(taskItem.metadata as Record<string, unknown>),
      final_phase_task: true,
      final_phase_action_id: "final-vendor-confirmations",
      preparation_checklist: true,
      preparation_checklist_item: "final-vendor-confirmations",
      second_order_loop: "commitment_timing",
    },
  });

  assert.ok(message);
  assert.equal(message.metadata?.final_phase_task, true);
  assert.equal(message.metadata?.final_phase_action_id, "final-vendor-confirmations");
  assert.ok((message.metadata?.searchable_terms as string[]).includes("final confirmations"));
  assert.ok((message.metadata?.searchable_terms as string[]).includes("run sheet"));
});

test("wedding task projection preserves legal administration search metadata", () => {
  const message = weddingTaskItemToAfpTaskMessage({
    ...taskItem,
    id: "legal-proof-of-birth",
    title: "Confirm proof of date/place of birth documents",
    kind: "document_checklist",
    dueLabel: "Before NOIM appointment or celebrant review",
    metadata: {
      ...(taskItem.metadata as Record<string, unknown>),
      legal_administration_task: true,
      legal_document_checklist_item: "proof-of-birth",
      preparation_checklist: true,
      preparation_checklist_item: "legal-proof-of-birth",
      second_order_loop: "commitment_timing",
    },
  });

  assert.ok(message);
  assert.equal(message.metadata?.legal_administration_task, true);
  assert.equal(message.metadata?.legal_document_checklist_item, "proof-of-birth");
  assert.ok((message.metadata?.searchable_terms as string[]).includes("legal administration"));
  assert.ok((message.metadata?.searchable_terms as string[]).includes("NOIM"));
  assert.ok((message.metadata?.searchable_terms as string[]).includes("document checklist"));
});

test("wedding task projection preserves vendor-search freshness and outreach metadata", () => {
  const message = weddingTaskItemToAfpTaskMessage({
    ...taskItem,
    id: "vendor-search-review",
    title: "Verify price, package inclusions, and availability for selected vendors",
    kind: "budget_review",
    metadata: {
      ...(taskItem.metadata as Record<string, unknown>),
      vendor_search_review_task: true,
      vendor_search_action_id: "verify-price-availability",
      vendor_search_provider_labels: ["Brave Search"],
      vendor_search_provider_kinds: ["brave_search"],
      vendor_search_categories: ["Photographer"],
      source_verification_required: true,
      vendor_price_freshness_required: true,
      vendor_availability_freshness_required: true,
      approval_required_before_outreach: true,
      preparation_checklist: true,
      preparation_checklist_item: "vendor-search-verify-price-availability",
    },
  });

  assert.ok(message);
  assert.equal(message.metadata?.vendor_search_review_task, true);
  assert.equal(message.metadata?.vendor_search_action_id, "verify-price-availability");
  assert.deepEqual(message.metadata?.vendor_search_provider_labels, ["Brave Search"]);
  assert.equal(message.metadata?.vendor_price_freshness_required, true);
  assert.equal(message.metadata?.approval_required_before_outreach, true);
  assert.ok((message.metadata?.searchable_terms as string[]).includes("vendor search review"));
  assert.ok((message.metadata?.searchable_terms as string[]).includes("Brave Search"));
  assert.ok((message.metadata?.searchable_terms as string[]).includes("Photographer"));
});

test("wedding task projection routes budget work to DecisionOS and knowledge graph", () => {
  const message = weddingTaskItemToAfpTaskMessage({
    ...taskItem,
    id: "budget-payment-garden-hall",
    title: "Review Garden Hall payment schedule",
    kind: "budget_review",
    dueAt: "2027-01-15T17:00:00.000Z",
    metadata: {
      ...(taskItem.metadata as Record<string, unknown>),
      budget_payment_review: true,
      budget_payment_candidate_id: "payment:garden-hall:deposit",
      budget_payment_due_amount_label: "$3000",
      budget_payment_due_date_label: "2027-01-15",
      budget_vendor_label: "Garden Hall",
      budget_category_label: "Venue",
      budget_source_label: "Uploaded contract",
      second_order_loop: "budget_drift",
      second_order_evidence_labels: ["Payment schedule needs follow-up."],
      preparation_checklist: true,
      preparation_checklist_item: "payment_review",
    },
  }, "2026-09-11T00:00:00.000Z");

  assert.ok(message);
  assert.ok(message.to?.includes("agent://decision-queue"));
  assert.ok(message.to?.includes("agent://knowledge-graph"));
  assert.ok(message.to?.includes("agent://topology"));
  assert.ok(message.supertags?.includes("wedding_budget"));
  assert.ok(message.supertags?.includes("wedding_budget:payment_schedule"));
  assert.ok(message.supertags?.includes("topology:budget_drift"));
  assert.equal(message.content.budget_payment_review, true);
  assert.equal(message.content.budget_payment_due_amount_label, "$3000");
  assert.equal(message.content.budget_vendor_label, "Garden Hall");
  assert.equal(message.metadata?.budget_payment_review, true);
  assert.equal(message.metadata?.budget_payment_candidate_id, "payment:garden-hall:deposit");
  assert.ok((message.metadata?.searchable_terms as string[]).includes("budget payment review"));
  assert.equal(message.views[0]?.content.budget_vendor_label, "Garden Hall");
});

test("wedding task projection preserves seeded-vendor review metadata", () => {
  const message = weddingTaskItemToAfpTaskMessage({
    ...taskItem,
    id: "seeded-vendor-review",
    title: "Verify seeded vendor price and date-specific availability",
    kind: "research",
    metadata: {
      ...(taskItem.metadata as Record<string, unknown>),
      vendor_search_review_task: true,
      vendor_search_action_id: "seed-verify-seeded-price-availability",
      vendor_seed_review_task: true,
      vendor_seed_action_id: "verify-seeded-price-availability",
      vendor_source_kind: "seeded_vendor_database",
      vendor_seed_count: 3,
      stale_seed_count: 1,
      vendor_price_recheck_count: 2,
      vendor_availability_recheck_count: 2,
      vendor_relevance_blocker_count: 1,
    },
  });

  assert.ok(message);
  assert.equal(message.metadata?.vendor_seed_review_task, true);
  assert.equal(message.metadata?.vendor_seed_action_id, "verify-seeded-price-availability");
  assert.equal(message.metadata?.vendor_source_kind, "seeded_vendor_database");
  assert.equal(message.metadata?.stale_seed_count, 1);
  assert.ok((message.metadata?.searchable_terms as string[]).includes("seeded vendor review"));
  assert.ok((message.metadata?.searchable_terms as string[]).includes("seeded_vendor_database"));
});

test("wedding task projection preserves expected-behavior gap metadata", () => {
  const message = weddingTaskItemToAfpTaskMessage({
    ...taskItem,
    id: "expected-weather-gap",
    title: "Connect verified weather contingency evidence",
    kind: "weather_contingency",
    metadata: {
      ...(taskItem.metadata as Record<string, unknown>),
      expected_behavior_gap: true,
      expected_behavior_capability: "weather_contingency",
      expected_behavior_status: "provider_blocked",
      expected_behavior_title: "Weather backup planning is connected to real forecast evidence",
      expected_behavior_blocker_labels: ["Needs BOM/weather provider evidence before calling forecasts verified."],
      second_order_loop: "weather_backup",
    },
  });

  assert.ok(message);
  assert.equal(message.metadata?.expected_behavior_gap, true);
  assert.equal(message.metadata?.expected_behavior_capability, "weather_contingency");
  assert.equal(message.metadata?.expected_behavior_status, "provider_blocked");
  assert.deepEqual(message.metadata?.expected_behavior_blocker_labels, [
    "Needs BOM/weather provider evidence before calling forecasts verified.",
  ]);
  assert.ok((message.metadata?.searchable_terms as string[]).includes("expected behavior gap"));
  assert.ok((message.metadata?.searchable_terms as string[]).includes("weather_contingency"));
  assert.ok((message.metadata?.searchable_terms as string[]).includes("provider_blocked"));
});

test("wedding task projection preserves Oracle update gate metadata", () => {
  const message = weddingTaskItemToAfpTaskMessage({
    ...taskItem,
    id: "oracle-update-deploy",
    title: "Update Oracle production target",
    kind: "other",
    metadata: {
      ...(taskItem.metadata as Record<string, unknown>),
      oracle_update_plan_task: true,
      oracle_update_step_kind: "deploy",
      oracle_update_step_id: "oracle-update-deploy",
      oracle_update_target_label: "Oracle wedding prod",
      oracle_update_blocked: false,
      oracle_update_can_update: true,
      oracle_update_command_label: "scripts/deploy-oracle.ps1",
      oracle_update_blocker_labels: [],
      oracle_update_guardrail_labels: ["Record durable proof after deployment."],
      production_readiness_oracle_gate: true,
      second_order_loop: "commitment_timing",
    },
  });

  assert.ok(message);
  assert.equal(message.metadata?.oracle_update_plan_task, true);
  assert.equal(message.metadata?.oracle_update_step_kind, "deploy");
  assert.equal(message.metadata?.oracle_update_target_label, "Oracle wedding prod");
  assert.equal(message.metadata?.oracle_update_can_update, true);
  assert.equal(message.metadata?.production_readiness_oracle_gate, true);
  assert.ok((message.metadata?.searchable_terms as string[]).includes("live wedding planner update"));
  assert.ok((message.metadata?.searchable_terms as string[]).includes("scripts/deploy-oracle.ps1"));
});

test("buildWeddingTaskAlertReminderScheduleItems derives calendar reminders from committed preparation tasks", () => {
  const reminders = buildWeddingTaskAlertReminderScheduleItems({
    taskItems: [{
      ...taskItem,
      id: "prep-cake",
      title: "Book cake baker",
      kind: "cake",
      dueAt: "2027-07-20T10:00:00.000Z",
      dueLabel: "6-9 months out",
      metadata: {
        ...(taskItem.metadata as Record<string, unknown>),
        preparation_checklist: true,
        preparation_checklist_item: "cake",
        alert_offset_days: [60, 30, 14],
        alert_dates: ["2027-05-21", "2027-06-20", "2027-07-06"],
      },
    }],
    existingScheduleItems: [{
      ...scheduleItem,
      id: "existing-cake-alert",
      kind: "task_reminder",
      startAt: "2027-06-20T09:00:00.000Z",
      metadata: {
        alert_reminder_for_task_id: "prep-cake",
        alert_date: "2027-06-20",
      },
    }],
  });

  assert.equal(reminders.length, 2);
  assert.deepEqual(reminders.map((item) => item.startAt), [
    "2027-05-21T09:00:00.000Z",
    "2027-07-06T09:00:00.000Z",
  ]);
  assert.equal(reminders[0]?.kind, "task_reminder");
  assert.equal(reminders[0]?.title, "Reminder: Book cake baker");
  assert.equal((reminders[0]?.metadata as Record<string, unknown>).alert_reminder, true);
  assert.equal(shouldProjectWeddingScheduleItemToAfpCalendarEvent(reminders[0]!), true);
  const message = weddingScheduleItemToAfpCalendarMessage(reminders[0]!, "2026-09-11T00:00:00.000Z");
  assert.ok(message);
  assert.equal(message.metadata?.alert_reminder, true);
  assert.equal(message.metadata?.alert_reminder_for_task_id, "prep-cake");
  assert.equal(message.metadata?.alert_date, "2027-05-21");
  assert.deepEqual(message.metadata?.alert_dates, ["2027-05-21"]);
  assert.ok((message.metadata?.searchable_terms as string[]).includes("prep-cake"));
  assert.ok((message.metadata?.searchable_terms as string[]).includes("2027-05-21"));
});

test("wedding projections expose send inputs for persistence wiring", () => {
  const calendarInput = weddingScheduleItemToAfpSendInput(scheduleItem, "2026-09-11T00:00:00.000Z");
  assert.ok(calendarInput);
  assert.equal(calendarInput.thread_id, "wedding_calendar_event:venue-tour-1");
  assert.equal(calendarInput.store_in_relational, true);

  const taskInput = weddingTaskItemToAfpSendInput(taskItem, "2026-09-11T00:00:00.000Z");
  assert.ok(taskInput);
  assert.equal(taskInput.thread_id, "wedding_task:follow-up-caterer");
  assert.equal(taskInput.store_in_relational, true);
  assert.ok(taskInput.supertags?.includes("wedding_task:vendor_follow_up"));
});

test("wedding projection sent markers are isolated by projection family", () => {
  const storage = new MemoryStorage();
  markWeddingProjectionSent("venue-tour-1", WEDDING_CALENDAR_AFP_PROJECTIONS_KEY, storage);
  markWeddingProjectionSent("follow-up-caterer", WEDDING_TASK_AFP_PROJECTIONS_KEY, storage);

  assert.equal(hasSentWeddingProjection("venue-tour-1", WEDDING_CALENDAR_AFP_PROJECTIONS_KEY, storage), true);
  assert.equal(hasSentWeddingProjection("venue-tour-1", WEDDING_TASK_AFP_PROJECTIONS_KEY, storage), false);
  assert.deepEqual(loadWeddingProjectionIds(WEDDING_TASK_AFP_PROJECTIONS_KEY, storage), ["follow-up-caterer"]);

  unmarkWeddingProjectionSent("venue-tour-1", WEDDING_CALENDAR_AFP_PROJECTIONS_KEY, storage);
  assert.equal(hasSentWeddingProjection("venue-tour-1", WEDDING_CALENDAR_AFP_PROJECTIONS_KEY, storage), false);
});
