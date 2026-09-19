import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWeddingArtifactSummary } from "../src/lib/weddingArtifactState.ts";
import { buildWeddingKnowledgeGraphState } from "../src/lib/weddingKnowledgeGraphState.ts";
import { buildWeddingRecommendationExplanationState } from "../src/lib/weddingRecommendationExplanationState.ts";
import { setWeddingDecisionSelection } from "../src/lib/weddingDecisionSelectionState.ts";
import { buildWeddingResponseWorkspaceViewState } from "../src/lib/weddingResponseWorkspaceViewState.ts";
import { buildWeddingTemplateFollowUpState } from "../src/lib/weddingTemplateFollowUpState.ts";
import {
  weddingArtifact as artifact,
  weddingMemoryStorage as memoryStorage,
  weddingResponseWorkspaceMetadata as metadata,
} from "./wedding-response-workspace-fixtures.ts";

test("buildWeddingResponseWorkspaceViewState creates category rail and active artifact preview", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    adminDataConsentEnabled: true,
    collaboratorInvites: [{
      email: "planner@example.com",
      displayName: "Planner",
      role: "planner",
      status: "draft",
    }],
    delegatedResponsibilities: [{
      category: "legal_noim",
      personName: "Alex Partner",
      relationship: "partner",
      phone: "+61 400 000 000",
    }],
    ganttCategoryColors: {
      legal: "#123456",
    },
    activeArtifactId: "artifact:venue-shortlist",
    artifacts: [
      artifact({ title: "Venue research", kind: "research", createdAt: 3 }),
      artifact({
        title: "Venue shortlist",
        kind: "vendor_table",
        createdAt: 2,
        vendorLabels: ["Harbour House"],
        locationLabels: ["Sydney"],
        sourceLinks: [{ label: "Venue source", url: "https://example.com/venue" }],
        exportTargets: ["csv"],
        linkedCalendarEventIds: ["event:venue-tour"],
        bodyText: [
          "## Venue shortlist",
          "",
          "| Name | Location |",
          "| --- | --- |",
          "| Harbour House | Sydney |",
        ].join("\n"),
      }),
    ],
    scheduleItems: [{
      id: "schedule:noim",
      title: "NOIM lodgement window",
      kind: "noim_reminder",
      startAt: "2027-04-01T00:00:00.000Z",
      endAt: "2027-05-01T00:00:00.000Z",
      reviewStatus: "accepted",
    }],
  });

  assert.equal(state.headerTitle, "Wedding documents");
  assert.equal(state.headerSubtitle, "2 planning files");
  assert.deepEqual(state.categoryRail.map((item) => item.label), ["Research", "Vendors"]);
  assert.equal(state.categoryRail.find((item) => item.label === "Vendors")?.active, true);
  assert.equal(state.activePreview?.artifactId, "artifact:venue-shortlist");
  assert.match(state.activePreview?.bodyText ?? "", /Harbour House/);
  assert.equal(state.activePreview?.preview?.kind, "table");
  assert.equal(state.activePreview?.exportManifest.entries[0]?.id, "csv");
  assert.deepEqual(state.activePreview?.sourceLinks, [{ label: "Venue source", url: "https://example.com/venue" }]);
  assert.equal(state.activePreview?.evidenceSummary.statusLabel, "Links included");
  assert.equal(state.activePreview?.evidenceSummary.warningLabel, null);
  assert.ok(state.activePreview?.evidenceSummary.labels.includes("Link: Venue source"));
  assert.ok(state.activePreview?.metadataLabels.includes("Harbour House"));
  assert.equal(state.personalOsProjection.hasWeddingPersonalOsSignal, true);
  assert.equal(state.adminDataConsent.enabled, true);
  assert.equal(state.adminDataConsent.adminPacket?.anonymized, true);
  assert.equal(state.adminDataConsent.adminPacket?.submittedResponseCount, 2);
  assert.equal(state.collaboration.productionReady, false);
  assert.equal(state.collaboration.invites[0]?.roleLabel, "Wedding planner");
  assert.ok(state.collaboration.blockerLabels.includes("Workspace ACL backend not connected"));
  assert.equal(state.delegation.contactDrafts[0]?.phone, "+61 400 000 000");
  assert.equal(state.delegation.items[0]?.categoryLabel, "Legal and NOIM");
  assert.equal(state.ganttTimeline.rows[0]?.title, "NOIM lodgement window");
  assert.equal(state.ganttTimeline.rows[0]?.category, "legal");
  assert.equal(state.ganttTimeline.legend[0]?.color, "#123456");
  assert.equal(state.productionReadiness.oracleUploadAllowed, false);
  assert.equal(state.oracleUpdatePlan.status, "blocked");
  assert.ok(state.projectionQueue?.groups
    .find((group) => group.kind === "task")?.items
    .some((item) => /Unblock Oracle update/i.test(item.title)));
  assert.ok(!state.personalOsProjection.rankedItems.some((item) => item.evidenceLabels.includes("Oracle update gate")));
  assert.ok(!state.personalOsProjection.rankedItems.some((item) => /Unblock Oracle update/i.test(item.title)));
  assert.match(state.personalOsProjection.fieldEngineSummary ?? "", /Wedding .* pressure:/);
  assert.match(state.personalOsProjection.decisionLoadRelief.summaryLabel, /wedding decision|No decision-heavy wedding items/);
  assert.match(state.bundleExportPayload.content, /## What needs your yes\/no/);
  assert.match(state.bundleExportPayload.content, /Decision-focus note:/);
  assert.equal(state.bundleExportPayload.filename, "wedding-planning-bundle.md");
  assert.equal(state.htmlBundleExportPayload.filename, "wedding-planning-bundle.html");
  assert.equal(state.wordBundleExportPayload.filename, "wedding-planning-bundle.doc");
  assert.equal(state.htmlBundleExportPayload.targetId, "html");
  assert.equal(state.wordBundleExportPayload.targetId, "word_doc");
  assert.match(state.htmlBundleExportPayload.content, /<!doctype html>/);
  assert.match(state.wordBundleExportPayload.content, /<!doctype html>/);
  assert.deepEqual(state.bundleExportPayload.includedArtifactIds, ["artifact:venue-research", "artifact:venue-shortlist"]);
  assert.deepEqual(state.sensitiveBundleExportPayload.includedArtifactIds, ["artifact:venue-research", "artifact:venue-shortlist"]);
});

test("buildWeddingResponseWorkspaceViewState exposes conservative artifact evidence summaries", () => {
  const labelled = buildWeddingResponseWorkspaceViewState({
    metadata,
    activeArtifactId: "artifact:celebrant-notes",
    artifacts: [
      artifact({
        title: "Celebrant notes",
        kind: "research",
        createdAt: 1,
        sourceLabels: ["User note"],
      }),
    ],
  });
  assert.equal(labelled.activePreview?.evidenceSummary.statusLabel, "Sources named");
  assert.match(labelled.activePreview?.evidenceSummary.warningLabel ?? "", /Check prices, availability/);
  assert.ok(labelled.activePreview?.evidenceSummary.labels.includes("Source: User note"));

  const unverified = buildWeddingResponseWorkspaceViewState({
    metadata,
    activeArtifactId: "artifact:vendor-draft",
    artifacts: [
      artifact({
        title: "Vendor draft",
        kind: "research",
        createdAt: 1,
        sourceLabels: [],
      }),
    ],
  });
  assert.equal(unverified.activePreview?.evidenceSummary.statusLabel, "Needs a fact check");
  assert.equal(unverified.activePreview?.evidenceSummary.sourceCountLabel, "No sources listed yet");
  assert.match(unverified.activePreview?.evidenceSummary.warningLabel ?? "", /Confirm the facts/);
});

test("buildWeddingResponseWorkspaceViewState redacts imported source filenames in preview labels", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    activeArtifactId: "wedding_import:guest_list:workspace:rsvp-csv",
    artifacts: [
      artifact({
        id: "wedding_import:guest_list:workspace:rsvp-csv",
        title: "Imported CSV: rsvp.csv",
        kind: "guest_list",
        createdAt: 1,
        metadata: {
          ...metadata,
          approval_state: "pending_user_approval",
          supertags: ["wedding_import", "wedding_import:csv"],
        },
        sourceLabels: ["CSV import: rsvp.csv"],
        sourceLinks: [
          { label: "Original upload: rsvp.csv", url: "https://storage.example.test/uploads/rsvp.csv?token=private" },
        ],
        bodyText: [
          "# Imported CSV: rsvp.csv",
          "",
          "| Name | RSVP |",
          "| --- | --- |",
          "| Alex | Yes |",
        ].join("\n"),
      }),
    ],
  });

  assert.equal(state.activePreview?.title, "Imported private planning file");
  assert.deepEqual(state.activePreview?.sourceLabels, ["Imported private planning file"]);
  assert.deepEqual(state.activePreview?.sourceLinks, []);
  assert.equal(state.activePreview?.exportManifest.title, "Imported private planning file");
  assert.equal(state.activePreview?.exportManifest.baseFilename, "imported-private-planning-file.md");
  assert.equal(JSON.stringify(state.activePreview?.exportManifest).includes("rsvp.csv"), false);
  assert.equal(state.activePreview?.approvalRequest?.title, "Approve Imported private planning file");
  assert.equal(JSON.stringify(state.activePreview?.approvalRequest?.disclosureLines).includes("rsvp.csv"), false);
  assert.equal(state.activePreview?.evidenceSummary.sourceCountLabel, "2 sources listed");
  assert.ok(state.activePreview?.evidenceSummary.labels.includes("Source: Imported private planning file"));
  assert.equal(state.activePreview?.evidenceSummary.labels.some((label) => /rsvp\.csv/i.test(label)), false);
  assert.equal(JSON.stringify(state.activePreview).includes("storage.example.test"), false);
  assert.equal(JSON.stringify(state.activePreview).includes("token=private"), false);
});

test("buildWeddingResponseWorkspaceViewState creates filter chips from visible results", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    query: "house",
    artifacts: [
      artifact({
        title: "Venue shortlist",
        kind: "vendor_table",
        createdAt: 2,
        vendorLabels: ["Harbour House"],
        locationLabels: ["Sydney"],
        exportTargets: ["csv"],
        sourceLinks: [{ label: "Venue source", url: "https://example.com/venue" }],
      }),
      artifact({
        title: "Budget sheet",
        kind: "budget_sheet",
        createdAt: 1,
        vendorLabels: ["Garden Hall"],
        exportTargets: ["csv"],
      }),
    ],
  });

  assert.equal(state.workspace.resultCount, 1);
  assert.ok(state.filterChips.some((chip) => chip.kind === "artifact_kind" && chip.query === "vendor_table"));
  assert.ok(state.filterChips.some((chip) => chip.kind === "vendor" && chip.query === "Harbour House"));
  assert.ok(state.filterChips.some((chip) => chip.kind === "location" && chip.query === "Sydney"));
  assert.ok(state.filterChips.some((chip) => chip.kind === "export_target" && chip.query === "csv"));
  assert.ok(state.filterChips.some((chip) => chip.kind === "evidence_status" && chip.query === "source_linked"));
  assert.equal(state.filterChips.some((chip) => chip.query === "Garden Hall"), false);
});

test("buildWeddingResponseWorkspaceViewState surfaces pending approval requests for active artifacts", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        title: "Venue email",
        kind: "email_draft",
        createdAt: 1,
        metadata: { ...metadata, approval_state: "pending_user_approval" },
        vendorLabels: ["Harbour House"],
      }),
    ],
  });

  assert.equal(state.activePreview?.approvalRequest?.actionKind, "send_email");
  assert.equal(state.activePreview?.approvalRequest?.canExecute, false);
  assert.equal(state.activePreview?.integrationReadiness.capability, "email");
  assert.equal(state.activePreview?.integrationReadiness.setupActionLabel, "Connect email");
  assert.equal(state.sidebarActions.find((action) => action.kind === "approve_action")?.enabled, true);
});

test("buildWeddingResponseWorkspaceViewState keeps unavailable sidebar actions visible but disabled", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [artifact({ title: "Venue research", kind: "research", createdAt: 1 })],
  });

  assert.equal(state.sidebarActions.find((action) => action.kind === "continue_chat")?.enabled, true);
  assert.equal(state.sidebarActions.find((action) => action.kind === "export_bundle")?.enabled, true);
  assert.equal(state.sidebarActions.find((action) => action.kind === "open_calendar")?.enabled, false);
  assert.match(state.sidebarActions.find((action) => action.kind === "open_calendar")?.reason ?? "", /linked wedding calendar/i);
  assert.equal(state.sidebarActions.find((action) => action.kind === "open_graph")?.enabled, false);
});

test("buildWeddingResponseWorkspaceViewState carries graph-backed recommendations into sidebar cards", () => {
  const vendor = normalizeWeddingArtifactSummary(artifact({
    title: "Venue shortlist",
    kind: "vendor_table",
    createdAt: 2,
    vendorLabels: ["Harbour House"],
  }));
  assert.ok(vendor);
  const recommendations = buildWeddingRecommendationExplanationState(buildWeddingKnowledgeGraphState({
    metadata,
    artifacts: [vendor],
    risks: [{ title: "No wet-weather backup confirmed", severity: "high" }],
  }));
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [artifact({ title: "Venue shortlist", kind: "vendor_table", createdAt: 2 })],
    recommendations,
  });

  assert.ok(state.recommendationCards.length > 0);
  assert.equal(state.sidebarActions.find((action) => action.kind === "open_graph")?.enabled, true);
  assert.equal(state.recommendationCards[0]?.graphAction.kind, "open_graph");
  assert.match(String(state.recommendationCards[0]?.graphAction.metadata?.graph_context), /\[object Object\]/);
  const graphContext = state.recommendationCards[0]?.graphAction.metadata?.graph_context as Record<string, unknown> | undefined;
  assert.equal(graphContext?.recommendation_id, state.recommendationCards[0]?.id);
  assert.ok(Array.isArray(graphContext?.source_node_ids));
  assert.ok(state.recommendationCards[0]?.graphContextLabels.some((label) => /source node/i.test(label)));
});

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
  assert.ok(approvalLines.some((line) => /Selected decision scope: Harbour Hall from Imported private planning file/i.test(line)));
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
  assert.ok(state.vendorContactCards[0]?.metadataLabels.includes("personal email"));
  assert.equal(state.vendorContactCards[1]?.statusLabel, "Waiting for reply");
  assert.equal(state.vendorContactCards[1]?.tone, "waiting");
  assert.equal(state.vendorContactCards[2]?.statusLabel, "Reply received");
  assert.equal(state.vendorContactCards[2]?.tone, "closed");
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

test("buildWeddingResponseWorkspaceViewState exposes Need-To-Know context cards", () => {
  const followUp = buildWeddingTemplateFollowUpState({
    weddingPlanId: "wedding_plan:harbour",
    responseWorkspaceId: "response_workspace:planning-pass",
    dateOrSeason: "2027-10-03",
    location: "Sydney NSW",
    guestCount: 90,
    budgetComfort: "Mid-range",
    topPriorities: ["food", "photos"],
    projectionStorage: memoryStorage(),
  });
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: followUp.artifactGeneration.artifactInputs,
    contextItems: [{ ...followUp.contextProjection, projectionSaved: true }],
    projectionStorage: memoryStorage(),
  });

  assert.equal(state.contextCards.length, 1);
  assert.equal(state.contextCards[0]?.statusLabel, "Saved context");
  assert.ok(state.contextCards[0]?.answeredLabels.includes("Location: Sydney NSW"));
  assert.ok(state.contextCards[0]?.metadataLabels.includes("response_workspace:planning-pass"));
  assert.equal(state.projectionQueue?.groups.find((group) => group.label === "Context")?.sentCount, 1);
});

test("buildWeddingResponseWorkspaceViewState exposes persisted approval receipt cards", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [artifact({ title: "Venue email", kind: "email_draft", createdAt: 1 })],
    approvalReceipts: [{
      id: "receipt:venue-email",
      requestId: "request:venue-email",
      actionKind: "send_email",
      title: "Send venue email",
      status: "blocked",
      createdAt: "2026-09-12T00:00:00.000Z",
      disclosureLines: ["Recipient: venue@example.com"],
      riskLabels: ["No executor is connected."],
      blockedReason: "No executor is connected for this wedding action.",
      blockKind: "provider_missing",
      externalId: null,
      executionMode: "omnyid_internal_approval_handoff",
      providerCapability: "email",
      requiredProvider: "Gmail or email provider",
      providerCredentialStatus: "missing",
      providerExecutorStatus: "missing",
      providerExecutorConnected: false,
      providerSetupView: "email",
      externalProviderRequired: true,
      artifactIds: ["artifact:venue-email"],
      scheduleItemIds: ["event:venue-tour"],
      taskItemIds: ["task:follow-up"],
    }],
  });

  assert.equal(state.approvalReceiptCards.length, 1);
  assert.equal(state.providerHandoffAuditCard?.statusLabel, "Setup needed");
  assert.match(state.providerHandoffAuditCard?.detailLabel ?? "", /1 approved wedding action/i);
  assert.ok(state.providerHandoffAuditCard?.metadataLabels.includes("email"));
  assert.ok(state.providerHandoffAuditCard?.metadataLabels.includes("setup: email"));
  assert.deepEqual(state.providerHandoffAuditCard?.pendingReceiptTitles, ["Send venue email"]);
  assert.equal(state.providerHandoffAuditCard?.action.kind, "open_connected_apps");
  assert.equal(state.providerHandoffAuditCard?.action.enabled, true);
  assert.equal(state.providerHandoffAuditCard?.action.label, "Open Connected Apps");
  assert.equal(state.approvalReceiptCards[0]?.statusLabel, "Blocked");
  assert.equal(state.approvalReceiptCards[0]?.blockLabel, "provider missing");
  assert.match(state.approvalReceiptCards[0]?.detailLabel ?? "", /No executor/i);
  assert.ok(state.approvalReceiptCards[0]?.metadataLabels.includes("provider: email"));
  assert.ok(state.approvalReceiptCards[0]?.metadataLabels.includes("Gmail or email provider"));
  assert.ok(state.approvalReceiptCards[0]?.metadataLabels.includes("executor: missing"));
  assert.ok(state.approvalReceiptCards[0]?.metadataLabels.includes("external handoff pending"));
  assert.ok(state.approvalReceiptCards[0]?.metadataLabels.includes("1 artifact link"));
  assert.deepEqual(state.approvalReceiptCards[0]?.riskLabels, ["No executor is connected."]);
});

test("buildWeddingResponseWorkspaceViewState summarizes connected provider handoffs", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    approvalReceipts: [{
      id: "receipt:calendar",
      requestId: "request:calendar",
      actionKind: "create_external_calendar_event",
      title: "Create tasting event",
      status: "executed",
      createdAt: "2026-09-12T00:00:00.000Z",
      disclosureLines: [],
      riskLabels: [],
      blockedReason: null,
      blockKind: null,
      externalId: "gcal:event-1",
      executionMode: "provider_executor",
      providerCapability: "calendar",
      requiredProvider: "Google Calendar or calendar provider",
      providerCredentialStatus: "connected",
      providerExecutorStatus: "available",
      providerExecutorConnected: true,
      providerSetupView: "calendar",
      externalProviderRequired: true,
      artifactIds: [],
      scheduleItemIds: ["event:tasting"],
      taskItemIds: [],
    }],
  });

  assert.equal(state.providerHandoffAuditCard?.statusLabel, "Connected");
  assert.match(state.providerHandoffAuditCard?.detailLabel ?? "", /1 approved wedding action/i);
  assert.ok(state.providerHandoffAuditCard?.metadataLabels.includes("0 need setup"));
  assert.deepEqual(state.providerHandoffAuditCard?.pendingReceiptTitles, []);
  assert.equal(state.providerHandoffAuditCard?.action.enabled, false);
  assert.match(state.providerHandoffAuditCard?.action.reason ?? "", /already have connected apps/i);
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

test("buildWeddingResponseWorkspaceViewState sanitizes selected decision source URLs in reusable context", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        id: "artifact:venue-shortlist",
        title: "Venue shortlist",
        kind: "vendor_table",
        createdAt: 1,
        bodyText: "# Venue shortlist\n\nHarbour Hall",
      }),
    ],
    decisionRecords: [{
      id: "decision:venue",
      artifactId: "artifact:venue-shortlist",
      artifactTitle: "Venue shortlist",
      artifactKind: "vendor_table",
      selectedOptionId: "0:harbour-hall",
      selectedOptionLabel: "Harbour Hall",
      selectedOptionDetail: "Selected waterfront venue.",
      selectedOptionCells: ["Harbour Hall", "Venue", "Sydney"],
      sourceLabels: ["Mixed source packet"],
      sourceUrls: ["javascript:alert(1)", "not-a-url", "https://example.com/venue"],
      sourceProviderLabels: ["manual_review"],
      createdAt: "2026-09-14T00:00:00.000Z",
      source: "local_selection",
      metadataLabels: [],
    }],
  });
  const continueAction = state.sidebarActions.find((action) => action.kind === "continue_chat");
  const scopes = continueAction?.metadata?.decision_scopes as Array<Record<string, unknown>> | undefined;

  assert.deepEqual(scopes?.[0]?.source_urls, ["https://example.com/venue"]);
  assert.match(state.bundleExportPayload.content, /1 source URL/);
  assert.doesNotMatch(state.bundleExportPayload.content, /javascript:alert/);
  assert.doesNotMatch(state.bundleExportPayload.content, /not-a-url/);
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
