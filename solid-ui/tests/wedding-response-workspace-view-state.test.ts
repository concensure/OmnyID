import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWeddingArtifactSummary } from "../src/lib/weddingArtifactState.ts";
import { buildWeddingKnowledgeGraphState } from "../src/lib/weddingKnowledgeGraphState.ts";
import { buildWeddingRecommendationExplanationState } from "../src/lib/weddingRecommendationExplanationState.ts";
import { buildWeddingVendorPursuitClosureTaskItem } from "../src/lib/weddingBudgetTrackingState.ts";
import {
  WEDDING_TASK_AFP_PROJECTIONS_KEY,
  markWeddingProjectionSent,
} from "../src/lib/weddingCalendarProjectionState.ts";
import {
  markWeddingDecisionAfpProjectionSent,
} from "../src/lib/weddingDecisionAfpProjectionState.ts";
import {
  setWeddingDecisionSelection,
  setWeddingDecisionSelections,
} from "../src/lib/weddingDecisionSelectionState.ts";
import { buildWeddingResponseWorkspaceViewState } from "../src/lib/weddingResponseWorkspaceViewState.ts";
import { buildWeddingTemplateFollowUpState } from "../src/lib/weddingTemplateFollowUpState.ts";
import { weddingVendorQuoteIncomingAfpMessage } from "../src/lib/weddingVendorQuoteReplyFlowState.ts";
import { buildWeddingVendorComparisonArtifactState } from "../src/lib/weddingVendorSearchArtifactState.ts";
import { runWeddingVendorSearchExecution } from "../src/lib/weddingVendorSearchExecutorState.ts";
import { buildWeddingVendorSearchReadinessState } from "../src/lib/weddingVendorSearchReadinessState.ts";
import {
  weddingArtifact as artifact,
  weddingMemoryStorage as memoryStorage,
  weddingResponseWorkspaceMetadata as metadata,
} from "./wedding-response-workspace-fixtures.ts";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

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
  assert.equal(state.adminDataConsent.enabled, true);
  assert.ok(state.adminDataConsent.excludedLabels.includes("message or draft text"));
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
    .some((item) => /Finish launch check/i.test(item.title)));
  assert.ok(!state.personalOsProjection.rankedItems.some((item) => item.evidenceLabels.includes("live update check")));
  assert.ok(!state.personalOsProjection.rankedItems.some((item) => /Finish launch check/i.test(item.title)));
  assert.match(state.personalOsProjection.fieldEngineSummary ?? "", /Wedding .* pressure:/);
  assert.match(state.personalOsProjection.decisionLoadRelief.summaryLabel, /things need your attention|No decision-heavy wedding items/);
  assert.match(state.bundleExportPayload.content, /## Wedding action queue/);
  assert.match(state.bundleExportPayload.content, /Attention note:/);
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

test("buildWeddingResponseWorkspaceViewState projects wedding helper AFP contacts into People helpers", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    afpMessages: [{
      id: "afp-helper-mia",
      thread_id: "wedding_helper_contact:workspace:mia",
      from: "system://wedding-planning",
      to: ["agent://wedding-planning", "agent://contacts"],
      timestamp: "2027-07-21T00:00:00.000Z",
      type: "ledger",
      kind: "wedding_helper_contact",
      subtype: "wedding_helper_contact_upsert",
      supertags: ["template:wedding_planning", "wedding_helper_contact"],
      content: {
        kind: "wedding_helper_contact",
        name: "Mia Chen",
        role: "Coordinator",
      },
      metadata: {
        helper_name: "Mia Chen",
        wedding_plan_id: "wedding_plan:harbour",
        response_workspace_id: "response_workspace:planning-pass",
      },
      views: [],
      attachments: [],
    }],
  });

  assert.ok(state.helperContactNames.includes("Mia Chen"));
  assert.ok(state.boundaryState.familyVisibleObjects.some((item) => /Mia Chen/i.test(item.title)));
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
  assert.equal(state.sidebarActions.find((action) => action.kind === "continue_chat")?.label, "Ask planner about this");
  assert.equal(state.sidebarActions.find((action) => action.kind === "export_bundle")?.enabled, true);
  assert.equal(state.sidebarActions.find((action) => action.kind === "open_calendar")?.enabled, false);
  assert.equal(state.sidebarActions.find((action) => action.kind === "open_calendar")?.label, "Open wedding calendar");
  assert.match(state.sidebarActions.find((action) => action.kind === "open_calendar")?.reason ?? "", /document with a wedding date/i);
  assert.equal(state.sidebarActions.find((action) => action.kind === "open_graph")?.enabled, false);
  assert.equal(state.sidebarActions.find((action) => action.kind === "open_graph")?.label, "Show related details");
  assert.equal(state.sidebarActions.find((action) => action.kind === "open_tasks")?.label, "Open wedding tasks");
  assert.equal(state.sidebarActions.find((action) => action.kind === "approve_action")?.label, "Review before sending");
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
  assert.equal(state.sidebarActions.find((action) => action.kind === "open_graph")?.label, "Show related details");
  assert.equal(state.recommendationCards[0]?.graphAction.kind, "open_graph");
  assert.equal(state.recommendationCards[0]?.graphAction.label, "Show related details");
  assert.match(String(state.recommendationCards[0]?.graphAction.metadata?.graph_context), /\[object Object\]/);
  const graphContext = state.recommendationCards[0]?.graphAction.metadata?.graph_context as Record<string, unknown> | undefined;
  assert.equal(graphContext?.recommendation_id, state.recommendationCards[0]?.id);
  assert.ok(Array.isArray(graphContext?.source_node_ids));
  assert.ok(state.recommendationCards[0]?.graphContextLabels.some((label) => /related detail/i.test(label)));
});

test("buildWeddingResponseWorkspaceViewState exposes vendor quote reply flows from quote artifacts", () => {
  const quoteArtifacts = [
    artifact({
      title: "Chloe florals quote",
      kind: "vendor_table",
      createdAt: 2,
      bodyText: [
        "# Chloe's Florals quote",
        "",
        "Vendor: Chloe's Florals",
        "Quote amount: AUD $799",
        "Budget delta: $200 over budget",
        "Valid until: 2026-10-15",
        "Original PDF: https://example.com/chloe-quote.pdf",
        "",
        "## Inclusions",
        "",
        "- Bridal bouquet",
        "- Ceremony arrangements",
      ].join("\n"),
    }),
    artifact({
      title: "Older reply to Chloe's Florals",
      kind: "email_draft",
      createdAt: 1,
      bodyText: [
        "Recipient: hello@chloes.example",
        "Subject: Floral quote",
        "",
        "## Draft",
        "",
        "Thanks Chloe, this was the older wording.",
      ].join("\n"),
    }),
    artifact({
      title: "Internal florist planning note",
      kind: "email_draft",
      createdAt: 4,
      bodyText: [
        "Recipient: planner@example.test",
        "Subject: Internal planning note",
        "",
        "## Draft",
        "",
        "Ask Chloe's Florals about the quote after we compare backups.",
      ].join("\n"),
    }),
    artifact({
      title: "Latest reply to Chloe's Florals",
      kind: "email_draft",
      createdAt: 3,
      bodyText: [
        "Recipient: hello@chloes.example",
        "Subject: Floral quote",
        "",
        "## Draft",
        "",
        "Thanks Chloe, latest wording says we would like to proceed.",
      ].join("\n"),
    }),
  ];
  const incomingQuote = weddingVendorQuoteIncomingAfpMessage({
    quote: {
      kind: "quote",
      vendorName: "Chloe's Florals",
      amount: 799,
      amountLabel: "AUD $799",
      currency: "AUD",
      budgetDeltaAmount: 200,
      budgetDeltaLabel: "$200 over budget",
      inclusions: ["Bridal bouquet", "Ceremony arrangements"],
      validUntil: "2026-10-15",
      attachmentUrl: "https://example.com/chloe-quote.pdf",
    },
    metadata,
    subject: "Floral quote",
    createdAt: "2026-09-27T00:00:00.000Z",
  });
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: quoteArtifacts,
    afpMessages: [incomingQuote],
  });

  assert.equal(state.vendorQuoteReplyFlows.length, 1);
  const flow = state.vendorQuoteReplyFlows[0];
  assert.equal(flow?.quote.vendorName, "Chloe's Florals");
  assert.equal(flow?.recipient, "hello@chloes.example");
  assert.equal(flow?.subject, "Floral quote");
  assert.equal(flow?.stage, "draft_ready");
  assert.equal(flow?.semanticObject.kind, "wedding_approval_required");
  assert.match(flow?.draftBody ?? "", /latest wording/);
  assert.equal(flow?.draftMessageId, "artifact:latest-reply-to-chloe-s-florals");
  assert.equal(state.vendorQuoteAttachmentParserStates.length, 1);
  assert.equal(state.vendorQuoteAttachmentParserStates[0]?.status, "request_ready");
  assert.equal(state.vendorQuoteAttachmentParserStates[0]?.parserInput?.source_attachment_id, incomingQuote.attachments[0]?.id);

  const extractedState = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: quoteArtifacts,
    afpMessages: [
      incomingQuote,
      {
        id: "msg:parsed-chloe-quote",
        type: "parsed_document",
        kind: "parsed_document",
        subtype: "parsed_document",
        thread_id: incomingQuote.thread_id,
        content: {
          source_attachment_id: incomingQuote.attachments[0]?.id,
          parser_used: "pdf_parser",
          title: "chloe-quote.pdf",
          content_text: "Total AUD $799. Bridal bouquet and ceremony arrangements.",
        },
        metadata: {
          ...metadata,
          source_attachment_id: incomingQuote.attachments[0]?.id,
          extraction_mode: "pdf_parser",
        },
        created_at: "2026-09-27T00:01:00.000Z",
        updated_at: "2026-09-27T00:01:00.000Z",
        version: 1,
        parents: [],
        links: [],
        attachments: [],
        visibility: "private",
        priority: null,
        expires_at: null,
        ttl: null,
        tags: [],
        supertags: ["parsed_document"],
        confidence: null,
      },
    ],
  });
  assert.equal(extractedState.vendorQuoteAttachmentParserStates[0]?.status, "already_extracted");
  assert.equal(extractedState.vendorQuoteAttachmentParserStates[0]?.parserInput, null);
  assert.ok(extractedState.vendorQuoteAttachmentParserStates[0]?.evidenceLabels.some((label) => /pdf_parser/i.test(label)));

  const localReceiptOnly = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: quoteArtifacts,
    approvalReceipts: [{
      id: "receipt:local-only",
      requestId: flow?.approvalRequest.id ?? "",
      actionKind: "send_email",
      title: "Send reply to Chloe's Florals",
      status: "executed",
      createdAt: "2026-09-27T01:00:07.000Z",
      disclosureLines: [],
      riskLabels: [],
      blockedReason: null,
      blockKind: null,
      externalId: null,
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
  });

  assert.equal(localReceiptOnly.vendorQuoteReplyFlows[0]?.stage, "blocked");
  assert.match(localReceiptOnly.vendorQuoteReplyFlows[0]?.failureMessage ?? "", /missing a provider receipt/i);

  const providerReceipt = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: quoteArtifacts,
    approvalReceipts: [{
      id: "receipt:gmail",
      requestId: flow?.approvalRequest.id ?? "",
      actionKind: "send_email",
      title: "Send reply to Chloe's Florals",
      status: "executed",
      createdAt: "2026-09-27T01:00:07.000Z",
      disclosureLines: [],
      riskLabels: [],
      blockedReason: null,
      blockKind: null,
      externalId: "gmail-message-123",
      externalDeliveryPerformed: true,
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
  });

  assert.equal(providerReceipt.vendorQuoteReplyFlows[0]?.stage, "sent");
  assert.equal(providerReceipt.vendorQuoteReplyFlows[0]?.sentReceiptId, "gmail-message-123");
  assert.equal(providerReceipt.activeVendorQuoteReplyFlows.length, 0);
  assert.equal(providerReceipt.vendorQuoteReplyLogFlows.length, 1);
  assert.equal(providerReceipt.vendorQuoteReplyLogFlows[0]?.sentReceiptId, "gmail-message-123");

  const providerMessageOnlyReceipt = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: quoteArtifacts,
    approvalReceipts: [{
      id: "receipt:gmail-provider-message",
      requestId: flow?.approvalRequest.id ?? "",
      actionKind: "send_email",
      title: "Send reply to Chloe's Florals",
      status: "executed",
      createdAt: "2026-09-27T01:00:07.000Z",
      disclosureLines: [],
      riskLabels: [],
      blockedReason: null,
      blockKind: null,
      externalId: null,
      providerMessageId: "gmail-message-from-provider",
      clientMessageId: "local-message-from-provider",
      externalDeliveryPerformed: true,
      deliverySubject: "Floral quote",
      deliveryThreadId: flow?.threadId ?? null,
      deliveryInReplyTo: "<quote-message@example.com>",
      deliveryReferences: ["<quote-message@example.com>", "afp-quote-message-1"],
      deliveryRecipients: ["hello@chloes.example"],
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
  });

  const restoredFlow = providerMessageOnlyReceipt.vendorQuoteReplyFlows[0];
  assert.equal(restoredFlow?.stage, "sent");
  assert.equal(restoredFlow?.sentReceiptId, "gmail-message-from-provider");
  assert.equal(restoredFlow?.approvalRequest.delivery?.references.includes(restoredFlow.quoteMessageId ?? ""), true);

  const unprovenProviderReceipt = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: quoteArtifacts,
    approvalReceipts: [{
      id: "receipt:gmail-unproven-provider-message",
      requestId: flow?.approvalRequest.id ?? "",
      actionKind: "send_email",
      title: "Send reply to Chloe's Florals",
      status: "executed",
      createdAt: "2026-09-27T01:00:07.000Z",
      disclosureLines: [],
      riskLabels: [],
      blockedReason: null,
      blockKind: null,
      externalId: "gmail-unproven-message",
      providerMessageId: "gmail-unproven-message",
      deliverySubject: "Floral quote",
      deliveryThreadId: flow?.threadId ?? null,
      deliveryRecipients: ["hello@chloes.example"],
      executionMode: "provider_executor",
      providerCapability: "email",
      providerResultOk: true,
      externalDeliveryPerformed: false,
      missingDurableProviderReceipt: false,
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
  });

  const unprovenFlow = unprovenProviderReceipt.vendorQuoteReplyFlows[0];
  assert.equal(unprovenFlow?.stage, "blocked");
  assert.equal(unprovenFlow?.sentReceiptId, null);
  assert.equal(unprovenFlow?.execution?.status, "blocked");
  assert.equal(unprovenFlow?.execution?.canRetry, true);
  assert.equal(unprovenFlow?.execution?.receipt.metadata.external_delivery_performed, false);
  assert.match(unprovenFlow?.failureMessage ?? "", /delivery did not complete/i);

  const threadMatchedReceipt = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: quoteArtifacts,
    approvalReceipts: [{
      id: "receipt:gmail-thread-fallback",
      requestId: "legacy-request-id-before-thread-stabilized",
      actionKind: "send_email",
      title: "Send reply to Chloe's Florals",
      status: "executed",
      createdAt: "2026-09-27T01:00:07.000Z",
      disclosureLines: [],
      riskLabels: [],
      blockedReason: null,
      blockKind: null,
      externalId: null,
      providerMessageId: "gmail-thread-fallback-message",
      externalDeliveryPerformed: true,
      deliveryThreadId: flow?.threadId ?? null,
      deliverySubject: "Floral quote",
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
  });

  assert.equal(threadMatchedReceipt.vendorQuoteReplyFlows[0]?.stage, "sent");
  assert.equal(threadMatchedReceipt.vendorQuoteReplyFlows[0]?.sentReceiptId, "gmail-thread-fallback-message");

  const unrelatedThreadReceipt = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: quoteArtifacts,
    approvalReceipts: [{
      id: "receipt:wrong-thread",
      requestId: "legacy-request-id-before-thread-stabilized",
      actionKind: "send_email",
      title: "Send reply to another vendor",
      status: "executed",
      createdAt: "2026-09-27T01:00:07.000Z",
      disclosureLines: [],
      riskLabels: [],
      blockedReason: null,
      blockKind: null,
      externalId: "gmail-wrong-thread",
      deliveryThreadId: "wedding_vendor_quote:workspace-1:other-vendor:floral-quote",
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
    }, {
      id: "receipt:wrong-action",
      requestId: "legacy-request-id-before-thread-stabilized",
      actionKind: "publish_registry",
      title: "Publish registry",
      status: "executed",
      createdAt: "2026-09-27T01:00:07.000Z",
      disclosureLines: [],
      riskLabels: [],
      blockedReason: null,
      blockKind: null,
      externalId: "registry-published",
      deliveryThreadId: flow?.threadId ?? null,
      executionMode: "provider_executor",
      providerCapability: "registry",
      requiredProvider: "Registry provider",
      providerCredentialStatus: "connected",
      providerExecutorStatus: "available",
      providerExecutorConnected: true,
      providerSetupView: "connected_apps",
      externalProviderRequired: true,
      artifactIds: [],
      scheduleItemIds: [],
      taskItemIds: [],
    }],
  });

  assert.equal(unrelatedThreadReceipt.vendorQuoteReplyFlows[0]?.stage, "draft_ready");
  assert.equal(unrelatedThreadReceipt.vendorQuoteReplyFlows[0]?.sentReceiptId, null);
});

test("buildWeddingResponseWorkspaceViewState creates contextual vendor quote reply drafts", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        title: "Harbour blooms quote",
        kind: "vendor_table",
        createdAt: 2,
        bodyText: [
          "# Harbour Blooms quote",
          "",
          "Vendor: Harbour Blooms",
          "Quote amount: AUD $1,450",
          "Budget delta: $150 under budget",
          "Valid until: 2026-11-01",
          "",
          "## Inclusions",
          "",
          "- Ceremony florals",
          "- Reception table bud vases",
        ].join("\n"),
      }),
    ],
  });

  const flow = state.vendorQuoteReplyFlows[0];
  assert.ok(flow);
  assert.match(flow.draftBody, /AUD \$1,450/);
  assert.match(flow.draftBody, /Ceremony florals/);
  assert.match(flow.draftBody, /\$150 under budget/);
  assert.match(flow.draftBody, /wedding date and expected guest count/i);
  assert.match(flow.draftBody, /deposit amount, payment milestones, cancellation terms/i);
  assert.match(flow.draftBody, /2026-11-01/);
  assert.match(flow.recommendationRationale, /Harbour Blooms/);
  assert.match(flow.recommendationRationale, /stays conditional/i);
});

test("buildWeddingResponseWorkspaceViewState asks over-budget quote vendors for trade-offs", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        title: "Harbour blooms premium quote",
        kind: "vendor_table",
        createdAt: 2,
        bodyText: [
          "# Harbour Blooms quote",
          "",
          "Vendor: Harbour Blooms",
          "Quote amount: AUD $2,450",
          "Budget delta: $450 over budget",
          "Valid until: 2026-11-01",
          "",
          "## Inclusions",
          "",
          "- Ceremony florals",
          "- Reception table bud vases",
        ].join("\n"),
      }),
    ],
  });

  const flow = state.vendorQuoteReplyFlows[0];
  assert.ok(flow);
  assert.match(flow.draftBody, /package adjustments/i);
  assert.match(flow.draftBody, /reduce the total/i);
  assert.match(flow.draftBody, /anything that is excluded/i);
  assert.match(flow.recommendationRationale, /package adjustments before approval/i);
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
  assert.equal(state.approvalReceiptCards[0]?.blockLabel, "connected app missing");
  assert.match(state.approvalReceiptCards[0]?.detailLabel ?? "", /No connected app/i);
  assert.ok(state.approvalReceiptCards[0]?.metadataLabels.includes("app type: email"));
  assert.ok(state.approvalReceiptCards[0]?.metadataLabels.includes("Gmail or email provider"));
  assert.ok(state.approvalReceiptCards[0]?.metadataLabels.includes("app action: missing"));
  assert.ok(state.approvalReceiptCards[0]?.metadataLabels.includes("connected app needed"));
  assert.ok(state.approvalReceiptCards[0]?.metadataLabels.includes("1 artifact link"));
  assert.deepEqual(state.approvalReceiptCards[0]?.riskLabels, ["No connected app is ready."]);
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
