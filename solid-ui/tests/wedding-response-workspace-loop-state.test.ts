import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingResponseWorkspaceViewState } from "../src/lib/weddingResponseWorkspaceViewState.ts";
import {
  weddingArtifact as artifact,
  weddingMemoryStorage as memoryStorage,
  weddingResponseWorkspaceMetadata as metadata,
} from "./wedding-response-workspace-fixtures.ts";

test("buildWeddingResponseWorkspaceViewState exposes weather backup second-order loops", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        title: "Outdoor venue research",
        kind: "research",
        createdAt: 1,
        bodyText: "Outdoor garden ceremony with harbour photos. Venue details are still missing a clear wet-weather fallback.",
      }),
    ],
    taskItems: [{
      id: "task:confirm-backup",
      title: "Confirm wet-weather backup with venue",
      kind: "vendor_follow_up",
      dueLabel: "Before deposit",
      priority: "high",
    }],
    decisionRecords: [{
      id: "wedding_decision:venue:harbour-hall",
      artifactId: "artifact:venue-shortlist",
      artifactTitle: "Venue shortlist",
      artifactKind: "vendor_table",
      selectedOptionId: "row-1",
      selectedOptionLabel: "Harbour Hall",
      selectedOptionDetail: "Selected waterfront venue.",
      selectedOptionCells: ["Harbour Hall", "Sydney"],
      createdAt: "2026-09-12T00:00:00.000Z",
      source: "local_selection",
      metadataLabels: [],
    }],
    projectionStorage: memoryStorage(),
  });

  const weatherLoop = state.secondOrderLoopCards.find((card) => card.id === "second_order:weather_backup");
  assert.ok(weatherLoop);
  assert.match(weatherLoop.statusLabel, /backup/i);
  assert.ok(weatherLoop.evidenceLabels.some((label) => /weather-exposed/i.test(label)));
  assert.ok(weatherLoop.evidenceLabels.some((label) => /Harbour Hall/i.test(label)));
  assert.match(weatherLoop.detailLabel, /selected planning path/i);
  assert.equal(weatherLoop.action.kind, "open_tasks");
  assert.equal(weatherLoop.action.metadata?.second_order_loop, "weather_backup");
  assert.equal(weatherLoop.suggestedTask, null);
});

test("buildWeddingResponseWorkspaceViewState turns missing weather backup loop into a task projection", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        title: "Outdoor venue research",
        kind: "research",
        createdAt: 1,
        bodyText: "Outdoor garden ceremony beside the harbour. The current plan does not name an indoor option.",
      }),
    ],
    decisionRecords: [{
      id: "wedding_decision:venue:harbour-hall",
      artifactId: "artifact:venue-shortlist",
      artifactTitle: "Venue shortlist",
      artifactKind: "vendor_table",
      selectedOptionId: "row-1",
      selectedOptionLabel: "Harbour Hall",
      selectedOptionDetail: "Selected waterfront venue.",
      selectedOptionCells: ["Harbour Hall", "Sydney"],
      createdAt: "2026-09-12T00:00:00.000Z",
      source: "local_selection",
      metadataLabels: [],
    }],
    projectionStorage: memoryStorage(),
  });

  const weatherLoop = state.secondOrderLoopCards.find((card) => card.id === "second_order:weather_backup");
  assert.ok(weatherLoop?.suggestedTask);
  assert.equal(weatherLoop.suggestedTask.kind, "vendor_follow_up");
  assert.match(weatherLoop.suggestedTask.title, /Harbour Hall/);
  assert.match(weatherLoop.suggestedTask.notes ?? "", /selected planning path/i);
  const taskMetadata = weatherLoop.suggestedTask.metadata as Record<string, unknown>;
  assert.equal(taskMetadata.second_order_task, true);
  assert.equal(taskMetadata.second_order_loop, "weather_backup");
  assert.ok(Array.isArray(taskMetadata.second_order_evidence_labels));
  assert.equal((taskMetadata.selected_decision_scope as Record<string, unknown>).selected_option_label, "Harbour Hall");
  const taskGroup = state.projectionQueue?.groups.find((group) => group.kind === "task");
  assert.equal(
    taskGroup?.items.some((item) =>
      item.status === "pending"
      && item.title === weatherLoop.suggestedTask?.title
      && item.sourceId === weatherLoop.suggestedTask?.id),
    true,
  );
  assert.equal(state.projectionQueue?.dispatchPayload?.sendInputs.some((input) => input.type === "task"), true);
});

test("buildWeddingResponseWorkspaceViewState redacts imported artifact titles in second-order task metadata", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        title: "Outdoor venue research",
        kind: "research",
        createdAt: 1,
        bodyText: "Outdoor garden ceremony beside the harbour. The current plan does not name an indoor option.",
      }),
    ],
    decisionRecords: [{
      id: "wedding_decision:imported:harbour-hall",
      artifactId: "wedding_import:vendor_table:workspace:venues-xlsx",
      artifactTitle: "Imported XLSX: venues.xlsx",
      artifactKind: "vendor_table",
      selectedOptionId: "row-1",
      selectedOptionLabel: "Harbour Hall",
      selectedOptionDetail: "Selected waterfront venue.",
      selectedOptionCells: ["Harbour Hall", "Sydney"],
      sourceLabels: ["source: venues.xlsx"],
      createdAt: "2026-09-12T00:00:00.000Z",
      source: "local_selection",
      metadataLabels: [],
    }],
    projectionStorage: memoryStorage(),
  });

  const weatherLoop = state.secondOrderLoopCards.find((card) => card.id === "second_order:weather_backup");
  const taskMetadata = weatherLoop?.suggestedTask?.metadata as Record<string, unknown>;
  const decisionScope = taskMetadata.selected_decision_scope as Record<string, unknown>;

  assert.equal(decisionScope.artifact_title, "Imported private planning file");
  assert.equal(decisionScope.selected_option_label, "Harbour Hall");
  assert.equal(JSON.stringify(decisionScope).includes("venues.xlsx"), false);
});

test("buildWeddingResponseWorkspaceViewState redacts imported decision scopes across reusable surfaces", () => {
  const importedArtifactId = "wedding_import:vendor_table:workspace:venues-xlsx";
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    activeArtifactId: importedArtifactId,
    artifacts: [
      artifact({
        id: importedArtifactId,
        title: "Imported private planning file",
        kind: "vendor_table",
        createdAt: 1,
        metadata: {
          ...metadata,
          approval_state: "pending_user_approval",
          supertags: ["wedding_import", "wedding_import:spreadsheet"],
        },
        sourceLabels: ["source: venues.xlsx", "original upload saved"],
        bodyText: [
          "# Imported private planning file",
          "",
          "| Name | Location |",
          "| --- | --- |",
          "| Harbour Hall | Sydney |",
        ].join("\n"),
      }),
    ],
    decisionRecords: [{
      id: "wedding_decision:imported:harbour-hall",
      artifactId: importedArtifactId,
      artifactTitle: "Imported XLSX: venues.xlsx",
      artifactKind: "vendor_table",
      selectedOptionId: "row-1",
      selectedOptionLabel: "Harbour Hall",
      selectedOptionDetail: "Selected waterfront venue.",
      selectedOptionCells: ["Harbour Hall", "Sydney"],
      sourceLabels: ["source: venues.xlsx", "original upload saved"],
      sourceUrls: [
        "https://storage.example.test/uploads/venues.xlsx?token=private",
        "https://example.com/venue",
      ],
      sourceProviderLabels: ["manual_review"],
      createdAt: "2026-09-12T00:00:00.000Z",
      source: "local_selection",
      metadataLabels: ["source: venues.xlsx", "needs follow-up"],
    }],
  });

  const cardText = JSON.stringify(state.decisionRecordCards);
  assert.match(cardText, /Imported private planning file/);
  assert.match(cardText, /needs follow-up/);
  assert.equal(cardText.includes("venues.xlsx"), false);
  assert.equal(cardText.includes("original upload saved"), false);

  const continueAction = state.sidebarActions.find((action) => action.kind === "continue_chat");
  const scopes = continueAction?.metadata?.decision_scopes as Array<Record<string, unknown>> | undefined;
  assert.equal(scopes?.[0]?.artifact_title, "Imported private planning file");
  assert.deepEqual(scopes?.[0]?.source_labels, ["Imported private planning file"]);
  assert.deepEqual(scopes?.[0]?.source_urls, ["https://example.com/venue"]);
  assert.equal(JSON.stringify(scopes).includes("venues.xlsx"), false);
  assert.equal(JSON.stringify(scopes).includes("storage.example.test"), false);
  assert.equal(JSON.stringify(scopes).includes("token=private"), false);

  const approvalLines = state.activePreview?.approvalRequest?.disclosureLines ?? [];
  assert.ok(approvalLines.some((line) => /Selected choice: Harbour Hall from Imported private planning file/i.test(line)));
  assert.equal(JSON.stringify(approvalLines).includes("venues.xlsx"), false);

  assert.match(state.bundleExportPayload.content, /Harbour Hall from Imported private planning file/);
  assert.match(state.bundleExportPayload.content, /sources: Imported private planning file/);
  assert.doesNotMatch(state.bundleExportPayload.content, /venues\.xlsx/);
  assert.doesNotMatch(state.bundleExportPayload.content, /storage\.example\.test/);
  assert.doesNotMatch(state.bundleExportPayload.content, /token=private/);
  assert.doesNotMatch(state.bundleExportPayload.content, /original upload saved/);
});

test("buildWeddingResponseWorkspaceViewState suppresses weather backup suggestions from loop metadata", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        title: "Outdoor venue research",
        kind: "research",
        createdAt: 1,
        bodyText: "Outdoor garden ceremony beside the harbour with no clear indoor fallback named.",
      }),
    ],
    taskItems: [{
      id: "task:persisted-second-order-weather",
      title: "Loop closure task",
      kind: "other",
      dueLabel: "Before deposit",
      priority: "high",
      metadata: {
        ...metadata,
        second_order_loop: "weather_backup",
      },
    }],
    projectionStorage: memoryStorage(),
  });

  const weatherLoop = state.secondOrderLoopCards.find((card) => card.id === "second_order:weather_backup");
  assert.ok(weatherLoop);
  assert.equal(weatherLoop.suggestedTask, null);
  assert.ok(weatherLoop.evidenceLabels.includes("1 backup task"));
});

test("buildWeddingResponseWorkspaceViewState exposes email contact closure loops", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        title: "Venue follow-up email",
        kind: "email_draft",
        createdAt: 1,
        metadata: { ...metadata, approval_state: "pending_user_approval" },
        bodyText: "To: venue@example.com\nSubject: Availability\n\nPlease confirm availability and backup options.",
      }),
    ],
    decisionRecords: [{
      id: "wedding_decision:venue:harbour-hall",
      artifactId: "artifact:venue-shortlist",
      artifactTitle: "Venue shortlist",
      artifactKind: "vendor_table",
      selectedOptionId: "row-1",
      selectedOptionLabel: "Harbour Hall",
      selectedOptionDetail: "Selected waterfront venue.",
      selectedOptionCells: ["Harbour Hall", "Sydney"],
      createdAt: "2026-09-12T00:00:00.000Z",
      source: "local_selection",
      metadataLabels: [],
    }],
  });

  const contactLoop = state.secondOrderLoopCards.find((card) => card.id === "second_order:contact_follow_up");
  assert.ok(contactLoop);
  assert.equal(contactLoop.statusLabel, "Drafts not closed");
  assert.ok(contactLoop.evidenceLabels.includes("1 email draft"));
  assert.ok(contactLoop.evidenceLabels.some((label) => /Harbour Hall/i.test(label)));
  assert.match(contactLoop.nextActionLabel, /selected option/i);
  assert.equal(contactLoop.action.kind, "open_tasks");
  assert.equal(contactLoop.action.enabled, false);
  assert.match(contactLoop.action.reason ?? "", /Create a follow-up task/i);
  assert.ok(contactLoop.suggestedTask);
  assert.match(contactLoop.suggestedTask.title, /Harbour Hall/);
  assert.match(contactLoop.suggestedTask.notes ?? "", /response deadline/i);
  const taskGroup = state.projectionQueue?.groups.find((group) => group.kind === "task");
  assert.ok((taskGroup?.pendingCount ?? 0) >= 1);
  assert.ok(taskGroup?.items.some((item) => /Track response follow-up for Harbour Hall/.test(item.title)));
  assert.equal(state.projectionQueue?.dispatchPayload?.sendInputs.some((input) => input.type === "task"), true);
});

test("buildWeddingResponseWorkspaceViewState surfaces outreach escalation stage in contact loop", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        title: "Venue outreach escalation",
        kind: "email_draft",
        createdAt: 1,
        bodyText: "No reply from Venue X after 7 days. Options: follow up again, move on, or call.",
      }),
    ],
    taskItems: [{
      id: "task:venue-x-escalation",
      title: "Decide next outreach step for Venue X",
      kind: "vendor_follow_up",
      priority: "high",
      metadata: {
        ...metadata,
        second_order_loop: "contact_follow_up",
        outreach_escalation_stage: "escalate_to_user",
        vendor_label: "Venue X",
      },
    }],
    projectionStorage: memoryStorage(),
  });

  const contactLoop = state.secondOrderLoopCards.find((card) => card.id === "second_order:contact_follow_up");
  assert.ok(contactLoop);
  assert.equal(contactLoop.statusLabel, "Escalation needs user choice");
  assert.ok(contactLoop.evidenceLabels.includes("day 7 escalation"));
  assert.match(contactLoop.detailLabel, /No reply after 7 days/i);
  assert.match(contactLoop.nextActionLabel, /final follow-up, move on/i);
  assert.equal(contactLoop.suggestedTask, null);
});

test("buildWeddingResponseWorkspaceViewState projects editable-vendor contact follow-ups into workspace tasks", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    nowIso: "2026-09-14T00:00:00.000Z",
    weddingVendors: [{
      vendorId: "vendor:photo-team",
      vendorName: "Photo Team",
      category: "Photographer",
      sourceLabel: "Editable wedding vendor directory",
      userContact: {
        contactMethod: "email",
        lastContactAt: "2026-09-09T00:00:00.000Z",
        followUpDueAt: "2026-09-14T00:00:00.000Z",
        receiptRef: "email:photo-team-1",
        threadId: "thread:photo-team",
      },
    }],
  });

  const taskGroup = state.projectionQueue?.groups.find((group) => group.kind === "task");
  const task = taskGroup?.items.find((item) => /Photo Team/i.test(item.title));
  const sendInput = state.projectionQueue?.dispatchPayload?.sendInputs.find((input) =>
    input.type === "task" && /Photo Team/i.test(String(input.content.title ?? "")),
  );

  assert.ok(task);
  assert.equal(sendInput?.metadata.vendor_id, "vendor:photo-team");
  assert.equal(sendInput?.metadata.vendor_contact_receipt_ref, "email:photo-team-1");
  assert.equal((sendInput?.content as Record<string, unknown> | undefined)?.vendor_contact_thread_id, "thread:photo-team");
});

test("buildWeddingResponseWorkspaceViewState exposes editable-vendor contact cards", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    nowIso: "2026-09-14T00:00:00.000Z",
    weddingVendors: [
      {
        vendorId: "vendor:waiting-venue",
        vendorName: "Waiting Venue",
        category: "Venue",
        userContact: {
          contactMethod: "agent_email_draft",
          lastContactAt: "2026-09-13T00:00:00.000Z",
          followUpDueAt: "2026-09-18T00:00:00.000Z",
          threadId: "thread:waiting",
        },
      },
      {
        vendorId: "vendor:due-caterer",
        vendorName: "Due Caterer",
        category: "Caterer",
        userContact: {
          contactMethod: "personal_email",
          lastContactAt: "2026-09-09T00:00:00.000Z",
          followUpDueAt: "2026-09-14T00:00:00.000Z",
          receiptRef: "mail:due-caterer",
        },
      },
      {
        vendorId: "vendor:closed-band",
        vendorName: "Closed Band",
        category: "Band",
        userContact: {
          contactMethod: "email",
          lastContactAt: "2026-09-08T00:00:00.000Z",
          responseReceivedAt: "2026-09-10T00:00:00.000Z",
        },
      },
    ],
  });

  assert.deepEqual(state.vendorContactCards.map((card) => card.vendorName), ["Due Caterer", "Waiting Venue", "Closed Band"]);
  assert.equal(state.vendorContactCards[0]?.statusLabel, "Second attempt due");
  assert.equal(state.vendorContactCards[0]?.tone, "due");
  assert.equal(state.vendorContactCards[0]?.nextActionLabel, "Send one follow-up");
  assert.equal(state.vendorContactCards[0]?.primaryActionLabel, "Review and approve follow-up");
  assert.equal(state.vendorContactCards[0]?.lastContactLabel, "2026-09-09");
  assert.equal(state.vendorContactCards[0]?.followUpDueLabel, "2026-09-14");
  assert.ok(state.vendorContactCards[0]?.metadataLabels.includes("personal email"));
  assert.equal(state.vendorContactCards[1]?.statusLabel, "Waiting for reply");
  assert.equal(state.vendorContactCards[1]?.tone, "waiting");
  assert.equal(state.vendorContactCards[1]?.actionMode, "waiting");
  assert.equal(state.vendorContactCards[1]?.primaryActionLabel, "Open follow-up task");
  assert.equal(state.vendorContactCards[2]?.statusLabel, "Reply received");
  assert.equal(state.vendorContactCards[2]?.tone, "closed");
  assert.equal(state.vendorContactCards[2]?.actionMode, "reply_recorded");
  assert.equal(state.vendorContactCards[2]?.primaryActionLabel, "View response");
  assert.equal(state.vendorContactCards[2]?.replyLabel, "2026-09-10");
  assert.match(state.vendorContactCards[2]?.detailLabel ?? "", /Continue from the response/i);
});

test("buildWeddingResponseWorkspaceViewState turns commitment timing gaps into task projections", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        title: "Venue contract notes",
        kind: "research",
        createdAt: 1,
        bodyText: "Harbour Hall requires a deposit before contract signing. Confirm cancellation terms and celebrant/NOIM timing before paying.",
      }),
    ],
    decisionRecords: [{
      id: "wedding_decision:venue:harbour-hall",
      artifactId: "artifact:venue-shortlist",
      artifactTitle: "Venue shortlist",
      artifactKind: "vendor_table",
      selectedOptionId: "row-1",
      selectedOptionLabel: "Harbour Hall",
      selectedOptionDetail: "Selected waterfront venue.",
      selectedOptionCells: ["Harbour Hall", "Sydney"],
      createdAt: "2026-09-12T00:00:00.000Z",
      source: "local_selection",
      metadataLabels: [],
    }],
    projectionStorage: memoryStorage(),
  });

  const commitmentLoop = state.secondOrderLoopCards.find((card) => card.id === "second_order:commitment_timing");
  assert.ok(commitmentLoop?.suggestedTask);
  assert.equal(commitmentLoop.statusLabel, "Commitment timing needs review");
  assert.match(commitmentLoop.suggestedTask.title, /Harbour Hall/);
  assert.equal(commitmentLoop.suggestedTask.kind, "legal");
  assert.match(commitmentLoop.suggestedTask.notes ?? "", /NOIM\/celebrant requirements/i);
  assert.ok(commitmentLoop.evidenceLabels.some((label) => /selected scope/i.test(label)));
  const taskGroup = state.projectionQueue?.groups.find((group) => group.kind === "task");
  assert.ok(taskGroup?.items.some((item) => /Verify legal, deposit, and contract timing/.test(item.title)));
});

test("buildWeddingResponseWorkspaceViewState suppresses commitment timing suggestions when task exists", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        title: "Payment and contract notes",
        kind: "research",
        createdAt: 1,
        bodyText: "Deposit and cancellation terms need review before signing the venue contract.",
      }),
    ],
    taskItems: [{
      id: "task:contract-review",
      title: "Review venue contract and deposit terms",
      kind: "budget_review",
      dueLabel: "Before signing",
      priority: "high",
    }],
    projectionStorage: memoryStorage(),
  });

  const commitmentLoop = state.secondOrderLoopCards.find((card) => card.id === "second_order:commitment_timing");
  assert.ok(commitmentLoop);
  assert.equal(commitmentLoop.suggestedTask, null);
  assert.equal(commitmentLoop.action.kind, "open_tasks");
  assert.ok(commitmentLoop.evidenceLabels.includes("1 commitment task"));
});

test("buildWeddingResponseWorkspaceViewState turns guest logistics gaps into task projections", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        title: "Venue access notes",
        kind: "map_collection",
        createdAt: 1,
        locationLabels: ["Sydney CBD"],
        bodyText: "Guest transport, accommodation, parking, stairs, and wheelchair access still need checking before final venue decision.",
      }),
    ],
    decisionRecords: [{
      id: "wedding_decision:venue:harbour-hall",
      artifactId: "artifact:venue-shortlist",
      artifactTitle: "Venue shortlist",
      artifactKind: "vendor_table",
      selectedOptionId: "row-1",
      selectedOptionLabel: "Harbour Hall",
      selectedOptionDetail: "Selected waterfront venue.",
      selectedOptionCells: ["Harbour Hall", "Sydney"],
      createdAt: "2026-09-12T00:00:00.000Z",
      source: "local_selection",
      metadataLabels: [],
    }],
    projectionStorage: memoryStorage(),
  });

  const logisticsLoop = state.secondOrderLoopCards.find((card) => card.id === "second_order:guest_logistics");
  assert.ok(logisticsLoop?.suggestedTask);
  assert.equal(logisticsLoop.statusLabel, "Guest logistics needs check");
  assert.match(logisticsLoop.suggestedTask.title, /Harbour Hall/);
  assert.match(logisticsLoop.suggestedTask.notes ?? "", /transport, parking, accommodation, accessibility/i);
  assert.ok(logisticsLoop.evidenceLabels.some((label) => /map\/location evidence/i.test(label)));
  const taskGroup = state.projectionQueue?.groups.find((group) => group.kind === "task");
  assert.ok(taskGroup?.items.some((item) => /Verify transport, access, and guest logistics/.test(item.title)));
});

test("buildWeddingResponseWorkspaceViewState suppresses guest logistics suggestions when task exists", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        title: "Venue logistics notes",
        kind: "research",
        createdAt: 1,
        bodyText: "Guest transport and parking should be checked for the reception venue.",
      }),
    ],
    taskItems: [{
      id: "task:guest-logistics",
      title: "Verify guest transport and accessibility",
      kind: "research",
      dueLabel: "Before final venue choice",
      priority: "normal",
    }],
    projectionStorage: memoryStorage(),
  });

  const logisticsLoop = state.secondOrderLoopCards.find((card) => card.id === "second_order:guest_logistics");
  assert.ok(logisticsLoop);
  assert.equal(logisticsLoop.suggestedTask, null);
  assert.equal(logisticsLoop.action.kind, "open_tasks");
  assert.ok(logisticsLoop.evidenceLabels.includes("1 logistics task"));
});

test("buildWeddingResponseWorkspaceViewState turns budget drift gaps into task projections", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        title: "Venue budget sheet",
        kind: "budget_sheet",
        createdAt: 1,
        bodyText: "Venue estimate is TBC. Minimum spend, overtime, GST, service fees, travel fee, and cancellation exclusions need confirmation.",
      }),
    ],
    decisionRecords: [{
      id: "wedding_decision:venue:harbour-hall",
      artifactId: "artifact:venue-shortlist",
      artifactTitle: "Venue shortlist",
      artifactKind: "vendor_table",
      selectedOptionId: "row-1",
      selectedOptionLabel: "Harbour Hall",
      selectedOptionDetail: "Selected waterfront venue.",
      selectedOptionCells: ["Harbour Hall", "Sydney"],
      createdAt: "2026-09-12T00:00:00.000Z",
      source: "local_selection",
      metadataLabels: [],
    }],
    projectionStorage: memoryStorage(),
  });

  const budgetLoop = state.secondOrderLoopCards.find((card) => card.id === "second_order:budget_drift");
  assert.ok(budgetLoop?.suggestedTask);
  assert.equal(budgetLoop.statusLabel, "Budget needs verification");
  assert.match(budgetLoop.suggestedTask.title, /Harbour Hall/);
  assert.equal(budgetLoop.suggestedTask.kind, "budget_review");
  assert.match(budgetLoop.suggestedTask.notes ?? "", /minimum spend, overtime, tax\/GST, service fees/i);
  assert.ok(budgetLoop.evidenceLabels.some((label) => /unknown or hidden-cost cue/i.test(label)));
  const taskGroup = state.projectionQueue?.groups.find((group) => group.kind === "task");
  assert.ok(taskGroup?.items.some((item) => /Verify unknown costs/.test(item.title)));
});

test("buildWeddingResponseWorkspaceViewState suppresses budget drift suggestions when task exists", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        title: "Vendor quote notes",
        kind: "budget_sheet",
        createdAt: 1,
        bodyText: "Estimate excludes overtime, GST, travel fees, and cancellation terms.",
      }),
    ],
    taskItems: [{
      id: "task:budget-review",
      title: "Review quote hidden costs and GST",
      kind: "budget_review",
      dueLabel: "Before vendor decision",
      priority: "high",
    }],
    projectionStorage: memoryStorage(),
  });

  const budgetLoop = state.secondOrderLoopCards.find((card) => card.id === "second_order:budget_drift");
  assert.ok(budgetLoop);
  assert.equal(budgetLoop.suggestedTask, null);
  assert.equal(budgetLoop.action.kind, "open_tasks");
  assert.ok(budgetLoop.evidenceLabels.includes("1 budget task"));
});

test("buildWeddingResponseWorkspaceViewState suppresses loop suggestions from structured task metadata", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        title: "Venue planning notes",
        kind: "budget_sheet",
        createdAt: 1,
        bodyText: "Deposit, cancellation terms, transport, parking, accessibility, TBC estimates, overtime, GST, and service fees still need review.",
      }),
      artifact({
        title: "Venue follow-up draft",
        kind: "email_draft",
        createdAt: 2,
        bodyText: "Please confirm details.",
      }),
    ],
    taskItems: [
      {
        id: "task:commitment-loop",
        title: "Loop closure task",
        kind: "other",
        metadata: { ...metadata, second_order_loop: "commitment_timing" },
      },
      {
        id: "task:logistics-loop",
        title: "Loop closure task",
        kind: "other",
        metadata: { ...metadata, second_order_loop: "guest_logistics" },
      },
      {
        id: "task:budget-loop",
        title: "Loop closure task",
        kind: "other",
        metadata: { ...metadata, second_order_loop: "budget_drift" },
      },
      {
        id: "task:contact-loop",
        title: "Loop closure task",
        kind: "other",
        metadata: { ...metadata, second_order_loop: "contact_follow_up" },
      },
    ],
    projectionStorage: memoryStorage(),
  });

  for (const loopId of [
    "second_order:commitment_timing",
    "second_order:guest_logistics",
    "second_order:budget_drift",
    "second_order:contact_follow_up",
  ]) {
    const loop = state.secondOrderLoopCards.find((card) => card.id === loopId);
    assert.ok(loop, loopId);
    assert.equal(loop.suggestedTask, null, loopId);
  }
});
