import assert from "node:assert/strict";
import test from "node:test";

import { type WeddingArtifactInput } from "../src/lib/weddingArtifactState.ts";
import { setWeddingDecisionSelection } from "../src/lib/weddingDecisionSelectionState.ts";
import { buildWeddingResponseWorkspaceViewState } from "../src/lib/weddingResponseWorkspaceViewState.ts";

const metadata = {
  wedding_plan_id: "wedding_plan:harbour",
  response_workspace_id: "response_workspace:planning-pass",
  source_response_id: "afp:response-1",
};

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  } as Storage;
}

function artifact(input: Partial<WeddingArtifactInput> & Pick<WeddingArtifactInput, "title" | "kind" | "createdAt">): WeddingArtifactInput {
  return {
    id: `artifact:${String(input.title).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    metadata,
    sourceLabels: ["Agent research"],
    ...input,
  };
}

test("buildWeddingResponseWorkspaceViewState exposes expected behaviour audit gaps", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        title: "Outdoor venue research",
        kind: "research",
        createdAt: 1,
        bodyText: "Outdoor garden ceremony with venue and photographer research, but no verified weather provider.",
      }),
    ],
  });

  assert.equal(state.expectedBehaviorAuditCard.id, "expected-behaviour-audit");
  assert.equal(state.expectedBehaviorAuditCard.statusLabel, "Needs setup");
  assert.match(state.expectedBehaviorAuditCard.readyCountLabel, /^\d+\/25 ready$/);
  assert.ok(state.expectedBehaviorAuditCard.blockedItems.some((item) => item.capability === "weather_contingency"));
  assert.ok(state.expectedBehaviorAuditCard.blockedItems.some((item) => item.capability === "vendor_matching"));
  assert.ok(state.expectedBehaviorAuditCard.suggestedTaskItems.some((task) => task.kind === "weather_contingency"));
  assert.ok(state.expectedBehaviorAuditCard.suggestedTaskItems.some((task) =>
    (task.metadata as Record<string, unknown>).expected_behavior_capability === "vendor_matching"
  ));
  assert.equal(state.expectedBehaviorAuditCard.action.kind, "open_tasks");
  assert.equal(state.expectedBehaviorAuditCard.action.enabled, true);
  const auditMetadata = state.expectedBehaviorAuditCard.action.metadata?.expected_behavior_audit as Record<string, unknown> | undefined;
  assert.ok(Array.isArray(auditMetadata?.blocked_capabilities));
  assert.ok(Array.isArray(auditMetadata?.suggested_task_ids));
  assert.ok(Array.isArray(auditMetadata?.suggested_task_titles));
  assert.ok((auditMetadata?.suggested_task_titles as string[]).some((title) => /vendor search/i.test(title)));
  assert.equal(
    state.projectionQueue?.dispatchPayload?.sendInputs.some((input) =>
      input.type === "task" && /expected-behavior/.test(String(input.id))
    ),
    false,
  );
});

test("buildWeddingResponseWorkspaceViewState can mark expected behaviour audit ready from workspace evidence", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        title: "Australian legal setup",
        kind: "legal",
        createdAt: 5,
        bodyText: "Australian NOIM and Attorney-General marriage.gov.au legal setup.",
        sourceLinks: [{ label: "AGD NOIM", url: "https://www.ag.gov.au/families-and-marriage/publications/notice-intended-marriage" }],
      }),
      artifact({
        title: "Verified vendor shortlist",
        kind: "vendor_table",
        createdAt: 4,
        vendorLabels: ["Harbour House"],
        sourceLinks: [{ label: "Venue source", url: "https://example.com/venue" }],
      }),
      artifact({
        title: "Final run sheet with BOM forecast",
        kind: "timeline",
        createdAt: 3,
        bodyText: "Run sheet, weather contingency, RSVP, seating chart, dietary and accessibility brief. Day-of real-time vendor delay playbook, vendor no-show fallback, E2EE guest-safe live updates for transport/lost item incidents, and payment receipt verification are ready.",
        sourceLabels: ["BOM forecast provider"],
      }),
      artifact({
        title: "Guest RSVP export",
        kind: "guest_list",
        createdAt: 2,
        bodyText: "Guest RSVP, dietary requirements, accessibility needs, and seating chart.",
        sourceLinks: [{ label: "RSVP provider", url: "https://example.com/rsvp" }],
      }),
      artifact({
        title: "Post-wedding wrap-up log",
        kind: "decision_log",
        createdAt: 1,
        exportTargets: ["markdown", "html", "word_doc", "browser_pdf", "bundle_planned"],
        bodyText: "Post-wedding thank-you notes for guests, vendors, and family. Private vendor feedback ratings and secure PDF wedding log plus digital scrapbook export are ready.",
        sourceLabels: ["Known wedding memories", "Secure PDF export", "Digital scrapbook export"],
      }),
    ],
    contextItems: [{
      metadata: {
        weddingPlanId: "wedding_plan:harbour",
        responseWorkspaceId: "response_workspace:planning-pass",
        sourceResponseId: "afp:response-1",
      },
      answeredLabels: ["Location: Sydney NSW"],
      nextQuestionLabel: "Ready",
      readyForFirstRecommendations: true,
      projectionSaved: true,
    }],
    approvalReceipts: [{
      id: "receipt:email",
      requestId: "request:email",
      actionKind: "send_email",
      title: "Send vendor email",
      status: "executed",
      createdAt: "2026-09-12T00:00:00.000Z",
      disclosureLines: [],
      riskLabels: [],
      blockedReason: null,
      blockKind: null,
      externalId: "email:1",
      executionMode: "provider_executor",
      providerCapability: "email",
      requiredProvider: "Gmail or email provider",
      providerCredentialStatus: "connected",
      providerExecutorStatus: "available",
      providerExecutorConnected: true,
      providerSetupView: "email",
      externalProviderRequired: true,
      artifactIds: [],
      scheduleItemIds: [],
      taskItemIds: [],
    }],
    decisionRecords: [{
      id: "wedding_decision:venue-shortlist:harbour-hall",
      artifactId: "artifact:verified-vendor-shortlist",
      artifactTitle: "Verified vendor shortlist",
      artifactKind: "vendor_table",
      selectedOptionId: "row-1",
      selectedOptionLabel: "Harbour House",
      selectedOptionDetail: "Selected waterfront venue.",
      selectedOptionCells: ["Harbour House", "Sydney"],
      createdAt: "2026-09-12T00:00:00.000Z",
      source: "local_selection",
      metadataLabels: [],
    }],
    scheduleItems: [{
      id: "schedule:run-sheet",
      title: "Ceremony",
      kind: "other",
      startAt: "2027-10-03T12:00:00.000Z",
      allDay: false,
      source: "agent",
      reviewStatus: "accepted",
      approvalState: "draft",
    }],
    taskItems: [
      { id: "task:run-sheet", title: "Confirm run sheet", kind: "run_sheet", dueLabel: "6-1 months out", priority: "high" },
      { id: "task:weather", title: "Confirm weather plan", kind: "weather_contingency", dueLabel: "1 month out", priority: "high" },
      { id: "task:rsvp", title: "Collect RSVPs", kind: "rsvp", dueLabel: "2 months out", priority: "normal" },
      { id: "task:seating", title: "Confirm seating chart", kind: "seating", dueLabel: "1 month out", priority: "normal" },
      { id: "task:documents", title: "Confirm legal documents", kind: "document_checklist", dueLabel: "Before NOIM", priority: "high" },
    ],
  });

  assert.equal(state.expectedBehaviorAuditCard.statusLabel, "Ready");
  assert.equal(state.expectedBehaviorAuditCard.readyCountLabel, "25/25 ready");
  assert.equal(state.expectedBehaviorAuditCard.blockedItems.length, 0);
  assert.equal(state.expectedBehaviorAuditCard.suggestedTaskItems.length, 0);
  assert.equal(state.expectedBehaviorAuditCard.action.enabled, false);
});

test("buildWeddingResponseWorkspaceViewState audits the whole workspace even when search filters results", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    query: "guest",
    artifacts: [
      artifact({
        title: "Verified vendor shortlist",
        kind: "vendor_table",
        createdAt: 4,
        vendorLabels: ["Harbour House"],
        sourceLinks: [{ label: "Venue source", url: "https://example.com/venue" }],
      }),
      artifact({
        title: "Guest RSVP export",
        kind: "guest_list",
        createdAt: 2,
        bodyText: "Guest RSVP, dietary requirements, accessibility needs, and seating chart.",
        sourceLinks: [{ label: "RSVP provider", url: "https://example.com/rsvp" }],
      }),
    ],
  });

  assert.equal(state.workspace.resultCount, 1);
  assert.equal(state.workspace.results[0]?.title, "Guest RSVP export");
  assert.equal(state.workspace.artifacts.length, 2);
  assert.equal(
    state.expectedBehaviorAuditCard.blockedItems.some((item) => item.capability === "vendor_matching"),
    false,
  );
});

test("buildWeddingResponseWorkspaceViewState suppresses audit task candidates when existing tasks cover them", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        title: "Outdoor venue research",
        kind: "research",
        createdAt: 1,
        bodyText: "Outdoor ceremony still needs a verified weather provider.",
      }),
    ],
    taskItems: [{
      id: "task:weather",
      title: "Existing weather proof task",
      kind: "weather_contingency",
      dueLabel: "Before outdoor plan is final",
      priority: "high",
      metadata: {
        ...metadata,
        expected_behavior_capability: "weather_contingency",
      },
    }],
  });

  assert.ok(state.expectedBehaviorAuditCard.blockedItems.some((item) => item.capability === "weather_contingency"));
  assert.equal(
    state.expectedBehaviorAuditCard.suggestedTaskItems.some((task) =>
      (task.metadata as Record<string, unknown>).expected_behavior_capability === "weather_contingency"
    ),
    false,
  );
});

test("buildWeddingResponseWorkspaceViewState exposes persisted decision record cards", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [artifact({ title: "Venue shortlist", kind: "vendor_table", createdAt: 1 })],
    decisionRecords: [{
      id: "wedding_decision:venue-shortlist:harbour-hall",
      artifactId: "artifact:venue-shortlist",
      artifactTitle: "Venue shortlist",
      artifactKind: "vendor_table",
      selectedOptionId: "row-1",
      selectedOptionLabel: "Harbour Hall",
      selectedOptionDetail: "Sydney venue option selected from the shortlist.",
      selectedOptionCells: ["Harbour Hall", "Sydney", "$20k"],
      createdAt: "2026-09-12T00:00:00.000Z",
      source: "local_selection",
      metadataLabels: ["wedding_decision_selection_to_afp"],
    }],
  });

  assert.equal(state.decisionRecordCards.length, 1);
  assert.equal(state.decisionRecordCards[0]?.title, "Harbour Hall");
  assert.equal(state.decisionRecordCards[0]?.statusLabel, "Decision scope saved");
  assert.match(state.decisionRecordCards[0]?.detailLabel ?? "", /selected from the shortlist/i);
  assert.ok(state.decisionRecordCards[0]?.metadataLabels.includes("Venue shortlist"));
  assert.ok(state.decisionRecordCards[0]?.metadataLabels.includes("vendor table"));
  assert.ok(state.decisionRecordCards[0]?.evidenceLabels.includes("Sydney"));
  const continueAction = state.sidebarActions.find((action) => action.kind === "continue_chat");
  const scopes = continueAction?.metadata?.decision_scopes as Array<Record<string, unknown>> | undefined;
  assert.equal(scopes?.[0]?.selected_option_label, "Harbour Hall");
  assert.ok(continueAction?.contextLabels?.includes("Selected vendor table: Harbour Hall"));
  assert.match(state.bundleExportPayload.content, /## Selected choice/);
  assert.match(state.bundleExportPayload.content, /Harbour Hall from Venue shortlist/);
  assert.match(state.htmlBundleExportPayload.content, /Harbour Hall from Venue shortlist/);
});

test("buildWeddingResponseWorkspaceViewState carries selected scope into approval previews", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    activeArtifactId: "artifact:venue-shortlist",
    artifacts: [artifact({
      id: "artifact:venue-shortlist",
      title: "Venue shortlist",
      kind: "vendor_table",
      createdAt: 1,
      metadata: { ...metadata, approval_state: "pending_user_approval" },
    })],
    decisionRecords: [{
      id: "wedding_decision:venue-shortlist:harbour-hall",
      artifactId: "artifact:venue-shortlist",
      artifactTitle: "Venue shortlist",
      artifactKind: "vendor_table",
      selectedOptionId: "row-1",
      selectedOptionLabel: "Harbour Hall",
      selectedOptionDetail: "Sydney venue option selected from the shortlist.",
      selectedOptionCells: ["Harbour Hall", "Sydney"],
      createdAt: "2026-09-12T00:00:00.000Z",
      source: "local_selection",
      metadataLabels: [],
    }],
  });

  assert.ok(state.activePreview?.approvalRequest);
  assert.ok(state.activePreview?.approvalRequest?.disclosureLines.some((line) => /Selected choice: Harbour Hall/i.test(line)));
  assert.ok(state.activePreview?.approvalRequest?.riskLabels.some((line) => /scoped to the selected shortlist item/i.test(line)));
});

test("buildWeddingResponseWorkspaceViewState exposes explicit sensitive bundle payload", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({ title: "Venue research", kind: "research", createdAt: 1 }),
      artifact({ title: "Guest list", kind: "guest_list", createdAt: 2 }),
    ],
  });

  assert.deepEqual(state.bundleExportPayload.includedArtifactIds, ["artifact:venue-research"]);
  assert.deepEqual(state.bundleExportPayload.excludedArtifactIds, ["artifact:guest-list"]);
  assert.deepEqual(state.htmlBundleExportPayload.includedArtifactIds, ["artifact:venue-research"]);
  assert.deepEqual(state.htmlBundleExportPayload.excludedArtifactIds, ["artifact:guest-list"]);
  assert.deepEqual(state.wordBundleExportPayload.includedArtifactIds, ["artifact:venue-research"]);
  assert.deepEqual(state.wordBundleExportPayload.excludedArtifactIds, ["artifact:guest-list"]);
  assert.deepEqual(
    [...state.sensitiveBundleExportPayload.includedArtifactIds].sort(),
    ["artifact:guest-list", "artifact:venue-research"],
  );
  assert.deepEqual(
    [...state.sensitiveHtmlBundleExportPayload.includedArtifactIds].sort(),
    ["artifact:guest-list", "artifact:venue-research"],
  );
  assert.equal(state.sensitiveHtmlBundleExportPayload.targetId, "html");
  assert.equal(state.sensitiveWordBundleExportPayload.targetId, "word_doc");
  assert.deepEqual(state.sensitiveBundleExportPayload.excludedArtifactIds, []);
  assert.ok(state.sensitiveBundleExportPayload.warningLabels.some((warning) => /Guest list exports/i.test(warning)));
});

test("buildWeddingResponseWorkspaceViewState exposes packet export capability labels", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [artifact({ title: "Venue research", kind: "research", createdAt: 1 })],
  });

  assert.deepEqual(state.packetExportCapability.readyFormats.map((format) => format.id), ["markdown", "html", "word_doc"]);
  assert.ok(state.packetExportCapability.readyFormats.some((format) => /Save as PDF/i.test(format.label)));
  assert.ok(state.packetExportCapability.plannedConversions.some((conversion) => conversion.id === "zip"));
  assert.ok(state.packetExportCapability.plannedConversions.every((conversion) => /not available yet/i.test(conversion.blockedReason)));
});

test("buildWeddingResponseWorkspaceViewState includes selected shortlist decisions in projection queue", () => {
  const storage = memoryStorage();
  setWeddingDecisionSelection("artifact:venue-shortlist", "0:harbour-house", storage);
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    activeArtifactId: "artifact:venue-shortlist",
    artifacts: [
      artifact({
        id: "artifact:venue-shortlist",
        title: "Venue shortlist",
        kind: "vendor_table",
        createdAt: 1,
        bodyText: [
          "# Venue shortlist",
          "",
          "| Name | Location | Fit |",
          "| --- | --- | --- |",
          "| Harbour House | Sydney | Water view and indoor backup |",
          "| Garden Hall | Sydney | Lower cost but weather exposed |",
        ].join("\n"),
      }),
    ],
    projectionStorage: storage,
  });

  const decisionGroup = state.projectionQueue?.groups.find((group) => group.kind === "decision");
  assert.equal(decisionGroup?.label, "Decisions");
  assert.equal(decisionGroup?.pendingCount, 1);
  assert.equal(state.projectionQueue?.dispatchPayload?.sendInputs.some((input) => input.type === "decision"), true);
});

test("buildWeddingResponseWorkspaceViewState projects committed preparation task alerts as calendar reminders", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    taskItems: [{
      id: "prep-cake",
      title: "Book cake baker",
      kind: "cake",
      dueAt: "2027-07-20T10:00:00.000Z",
      dueLabel: "6-9 months out",
      priority: "high",
      metadata: {
        ...metadata,
        preparation_checklist: true,
        preparation_checklist_item: "cake",
        alert_offset_days: [60, 30, 14],
        alert_dates: ["2027-05-21", "2027-06-20", "2027-07-06"],
      },
    }],
    projectionStorage: memoryStorage(),
  });

  const calendarGroup = state.projectionQueue?.groups.find((group) => group.kind === "calendar_event");
  assert.equal(calendarGroup?.pendingCount, 3);
  assert.equal(
    calendarGroup?.items.some((item) => item.title === "Reminder: Book cake baker"),
    true,
  );
  assert.equal(
    state.projectionQueue?.dispatchPayload?.sendInputs.filter((input) => input.type === "calendar_event").length,
    3,
  );
  assert.equal(
    state.ganttTimeline.rows.some((item) => item.id === "wedding_calendar:task-alert:prep-cake:2027-06-20"),
    true,
  );
});

test("buildWeddingResponseWorkspaceViewState updates budget tracking from selected vendor decisions", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    decisionRecords: [
      {
        id: "decision:photographer",
        artifactId: "artifact:photographer-shortlist",
        artifactTitle: "Photographer shortlist",
        artifactKind: "vendor_table",
        selectedOptionId: "0:harbour-photos",
        selectedOptionLabel: "Harbour Photos",
        selectedOptionDetail: "Projected package $4,000-$5,000; request current quote",
        selectedOptionCells: ["Harbour Photos", "Photographer", "$4,000-$5,000", "Projected package"],
        createdAt: "2026-09-14T00:00:00.000Z",
        source: "local_selection",
        metadataLabels: [],
      },
      {
        id: "decision:venue",
        artifactId: "artifact:venue-shortlist",
        artifactTitle: "Venue shortlist",
        artifactKind: "vendor_table",
        selectedOptionId: "0:garden-hall",
        selectedOptionLabel: "Garden Hall",
        selectedOptionDetail: "Quoted package AUD 12,000 including ceremony room",
        selectedOptionCells: ["Garden Hall", "Venue", "Quoted AUD 12,000", "Contract quote"],
        createdAt: "2026-09-14T00:00:00.000Z",
        source: "local_selection",
        metadataLabels: [],
      },
    ],
  });

  assert.equal(state.budgetTracking.lineItems.length, 2);
  assert.equal(state.budgetTracking.totalProjectedAmount, 4500);
  assert.equal(state.budgetTracking.totalQuotedAmount, 12000);
  assert.equal(state.budgetTracking.totalKnownAmount, 16500);
  assert.ok(state.budgetTracking.warningLabels.some((label) => /still projected/i.test(label)));
});

test("buildWeddingResponseWorkspaceViewState exposes guest operations tracking", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [{
      id: "artifact:guests",
      title: "Guest list",
      kind: "guest_list",
      createdAt: 1,
      metadata,
      bodyText: [
        "| Name | RSVP | Email | Meal | Dietary | Accessibility |",
        "| --- | --- | --- | --- | --- | --- |",
        "| Alex | Yes | alex@example.test | Fish | Nut allergy | Wheelchair access |",
        "| Blair | Pending |  |  | Vegan |  |",
      ].join("\n"),
    }],
  });

  assert.equal(state.guestTracking.guestFileCount, 1);
  assert.equal(state.guestTracking.guestRowCount, 2);
  assert.equal(state.guestTracking.attendingCount, 1);
  assert.equal(state.guestTracking.pendingCount, 1);
  assert.equal(state.guestTracking.dietaryCount, 2);
  assert.equal(state.guestTracking.accessibilityCount, 1);
  assert.ok(state.guestTracking.warningLabels.some((label) => /RSVP/i.test(label)));
});

test("buildWeddingResponseWorkspaceViewState exposes seating draft tracking", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [{
      id: "artifact:guests",
      title: "Guest list",
      kind: "guest_list",
      createdAt: 1,
      metadata,
      bodyText: [
        "| Name | RSVP | Table | Household | Role | Seating note | Accessibility |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        "| Alex | Yes | Table 1 | Bride family | Parent | VIP table | Wheelchair access |",
        "| Blair | Attending |  | Friends | Guest | Divorced - keep apart |  |",
      ].join("\n"),
    }],
  });

  assert.equal(state.seatingPlan.guestRowsConsidered, 2);
  assert.equal(state.seatingPlan.assignedSeatCount, 1);
  assert.equal(state.seatingPlan.unassignedAttendingCount, 1);
  assert.equal(state.seatingPlan.householdGroupCount, 2);
  assert.equal(state.seatingPlan.sensitiveConstraintCount, 1);
  assert.equal(state.seatingPlan.accessibilityConstraintCount, 1);
  assert.ok(state.seatingPlan.warningLabels.some((label) => /not assigned/i.test(label)));
});
