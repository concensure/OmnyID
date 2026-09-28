import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingArtifactGenerationState } from "@/lib/weddingArtifactGenerationState";
import { buildWeddingApprovalRequestState, buildWeddingApprovalReceiptState } from "@/lib/weddingApprovalState";
import { weddingApprovalReceiptToAfpMessage } from "@/lib/weddingApprovalReceiptAfpProjectionState";
import { weddingGeneratedArtifactsToAfpMessages } from "@/lib/weddingArtifactAfpProjectionState";
import { buildWeddingAustralianLegalSetupState } from "@/lib/weddingAustralianLegalSetupState";
import {
  weddingScheduleItemToAfpCalendarMessage,
  weddingTaskItemToAfpTaskMessage,
  type WeddingPlanningScheduleItem,
  type WeddingPlanningTaskItem,
} from "@/lib/weddingCalendarProjectionState";
import { weddingNeedToKnowContextToAfpMessage } from "@/lib/weddingNeedToKnowAfpProjectionState";
import { buildWeddingPersistedWorkspaceState } from "@/lib/weddingPersistedWorkspaceState";
import { normalizeWeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";
import { weddingDecisionProjectionToAfpMessage } from "@/lib/weddingDecisionAfpProjectionState";
import { weddingDecisionDeferralToAfpMessage } from "@/lib/weddingDecisionDeferralAfpState";
import { buildWeddingBoundaryRequestDecision } from "@/lib/weddingBoundaryDecisionState";
import {
  weddingBoundaryLedgerObjectToAfpMessage,
  type WeddingBoundaryChangeRequest,
  type WeddingBoundaryPolicy,
} from "@/lib/weddingBoundaryLedgerState";
import {
  buildWeddingSeatingConstraintActionFromInstruction,
  weddingSeatingConstraintActionToAfpMessage,
} from "@/lib/weddingSeatingConstraintActionState";
import {
  buildWeddingSeatingOptimizationResult,
  weddingSeatingOptimizationResultToAfpMessage,
} from "@/lib/weddingSeatingOptimizationState";
import { weddingSeatingDraftArchiveToAfpMessage } from "@/lib/weddingSeatingDraftArchiveState";
import {
  buildWeddingInspirationItem,
  weddingInspirationItemsToAfpMessage,
} from "@/lib/weddingInspirationState";
import {
  buildWeddingVendorQuoteReplyFlowState,
  weddingVendorQuoteDraftAfpSendInput,
  weddingVendorQuoteIncomingAfpMessage,
} from "@/lib/weddingVendorQuoteReplyFlowState";

const metadata = {
  weddingPlanId: "wedding_plan:persisted",
  responseWorkspaceId: "response_workspace:persisted",
  sourceResponseId: "response:persisted",
  supertags: ["template:wedding_planning", "event:wedding"],
};

function persistedMessages() {
  const artifacts = buildWeddingArtifactGenerationState({
    metadata,
    researchNotes: ["Compare venues from persisted workspace messages."],
    vendors: [{
      name: "Harbour Hall",
      category: "Venue",
      location: "Sydney",
      priceEstimate: "$20k",
      capacity: "120",
      fitReason: "Close to hotels",
      source: "Venue website",
    }],
  }).artifacts;
  const legalSetup = buildWeddingAustralianLegalSetupState({
    metadata,
    location: "Sydney, NSW",
    noimDownloaded: "no",
    celebrantPath: "need_options",
  });
  const scheduleItem: WeddingPlanningScheduleItem = {
    id: "venue-tour",
    title: "Venue tour",
    kind: "venue_tour",
    startAt: "2027-09-18T10:00:00+10:00",
    location: "Sydney",
    metadata,
    linkedArtifactId: artifacts[0]?.summary.id,
    semanticKind: "wedding_active_loop",
    semanticTags: ["wedding_active_loop", "timeline"],
    semanticObject: {
      id: "semantic:schedule:venue-tour",
      kind: "wedding_active_loop",
      title: "Venue tour",
      stateLabel: "Scheduled",
      tone: "status",
      summary: "Venue tour is on the wedding timeline.",
      actions: [],
      semanticTags: ["wedding_active_loop", "timeline"],
    },
  };
  const taskItem: WeddingPlanningTaskItem = {
    id: "confirm-package",
    title: "Confirm package inclusions",
    kind: "vendor_follow_up",
    dueAt: "2027-09-20T17:00:00+10:00",
    priority: "high",
    metadata,
    linkedArtifactId: artifacts[0]?.summary.id,
    semanticKind: "wedding_external_wait",
    semanticTags: ["wedding_external_wait", "vendor_follow_up"],
    semanticObject: {
      id: "semantic:task:confirm-package",
      kind: "wedding_external_wait",
      title: "Confirm package inclusions",
      stateLabel: "Waiting on vendor",
      tone: "risk",
      summary: "Package inclusions need confirmation before the venue decision is final.",
      actions: [],
      semanticTags: ["wedding_external_wait", "vendor_follow_up"],
    },
  };
  const approvalRequest = buildWeddingApprovalRequestState({
    actionKind: "contact_vendor",
    title: "Contact Harbour Hall",
    metadata,
    recipients: ["events@harbour.example"],
    userApproved: true,
  });
  const approvalReceipt = buildWeddingApprovalReceiptState(approvalRequest, "2026-09-11T00:30:00.000Z");
  return [
    weddingNeedToKnowContextToAfpMessage({
      metadata: normalizeWeddingPlanningMetadata(metadata),
      planningContext: {
        dateOrSeason: "2027-10-03",
        location: "Sydney NSW",
        guestCount: 90,
        budgetComfort: "Mid-range",
        topPriorities: ["food", "photos"],
        countryCode: "AU",
        noimDownloaded: "no",
        celebrantPath: "need_options",
      },
      answeredLabels: ["Date/season: 2027-10-03", "Location: Sydney NSW", "Guest count: 90"],
      nextQuestionLabel: "Ready to generate the first recommendation set.",
      readyForFirstRecommendations: true,
    }, "2026-09-11T00:00:00.000Z"),
    ...weddingGeneratedArtifactsToAfpMessages(artifacts, "2026-09-11T00:00:00.000Z"),
    ...weddingGeneratedArtifactsToAfpMessages([legalSetup.artifact], "2026-09-11T00:00:00.000Z"),
    weddingScheduleItemToAfpCalendarMessage(scheduleItem, "2026-09-11T00:00:00.000Z"),
    weddingTaskItemToAfpTaskMessage(taskItem, "2026-09-11T00:00:00.000Z"),
    weddingDecisionProjectionToAfpMessage({
      id: "wedding_decision:persisted:harbour_hall",
      metadata,
      artifactId: artifacts[0]?.summary.id ?? "artifact:venue-options",
      artifactTitle: artifacts[0]?.summary.title ?? "Venue options",
      artifactKind: artifacts[0]?.summary.kind ?? "vendor_table",
      sourceLabels: ["Venue website", "Google Places API"],
      sourceUrls: ["https://harbour.example"],
      sourceProviderLabels: ["google_places"],
      selectedOption: {
        id: "row-1",
        label: "Harbour Hall",
        detail: "Sydney venue option selected from persisted shortlist.",
        rowIndex: 0,
        cells: ["Harbour Hall", "Venue", "Sydney", "$20k", "120"],
        selected: true,
        preferenceFitLabels: ["guest logistics"],
        missingPreferenceLabels: [],
        tradeoffLabels: [],
        preferenceSummaryLabel: "1 preference fit signal",
      },
      source: "local_selection",
    }, "2026-09-11T00:10:00.000Z"),
    weddingApprovalReceiptToAfpMessage({
      ...approvalReceipt,
      metadata: {
        ...approvalReceipt.metadata,
        external_id: "vendor:message-1",
        provider_receipt_id: "gmail-receipt-1",
        provider_message_id: "gmail-message-1",
        message_id: "rfc822-message-1",
        client_message_id: "local-message-1",
        delivery_channel: "email",
        delivery_subject: "Harbour Hall follow-up",
        delivery_thread_id: "wedding_vendor_quote:response_workspace:persisted:harbour-hall",
        delivery_in_reply_to: "<quote-message@harbour.example>",
        delivery_references: ["<quote-message@harbour.example>", "afp-quote-message-1"],
        delivery_recipients: ["events@harbour.example"],
        execution_mode: "omnyid_internal_approval_handoff",
        provider_capability: "email",
        required_provider: "Gmail or email provider",
        provider_credential_status: "missing",
        provider_executor_status: "missing",
        provider_executor_connected: false,
        provider_result_ok: true,
        external_delivery_performed: false,
        missing_durable_provider_receipt: false,
        provider_setup_view: "email",
        external_provider_required: true,
      },
    }),
  ].filter((message): message is NonNullable<typeof message> => Boolean(message));
}

test("buildWeddingPersistedWorkspaceState recovers persisted artifacts dates and tasks", () => {
  const state = buildWeddingPersistedWorkspaceState({
    messages: persistedMessages(),
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });

  assert.equal(state.hasPersistedData, true);
  assert.equal(state.contextItems.length, 1);
  assert.equal(state.artifacts.length, 3);
  assert.equal(state.approvalReceipts.length, 1);
  assert.equal(state.decisionRecords.length, 1);
  assert.equal(state.scheduleItems.length, 1);
  assert.equal(state.taskItems.length, 1);
  assert.equal(state.artifacts[0]?.metadata && typeof state.artifacts[0].metadata === "object"
    ? (state.artifacts[0].metadata as Record<string, unknown>).responseWorkspaceId
    : null, metadata.responseWorkspaceId);
  assert.ok(state.artifacts.some((artifact) => artifact.vendorLabels?.includes("Harbour Hall")));
  assert.ok(state.artifacts.some((artifact) => artifact.sourceLinks?.some((source) => /marriage\.ag\.gov\.au/i.test(source.url))));
  const firstArtifactMessage = persistedMessages().find((message) => message.subtype === "wedding_artifact");
  assert.equal(state.scheduleItems[0]?.linkedArtifactId, firstArtifactMessage?.content.artifact_id);
  assert.equal(state.taskItems[0]?.priority, "high");
  assert.equal(state.scheduleItems[0]?.semanticKind, "wedding_active_loop");
  assert.equal(state.scheduleItems[0]?.semanticObject?.id, "semantic:schedule:venue-tour");
  assert.equal(state.taskItems[0]?.semanticKind, "wedding_external_wait");
  assert.equal(state.taskItems[0]?.semanticObject?.id, "semantic:task:confirm-package");
  assert.equal(state.contextItems[0]?.planningContext.location, "Sydney NSW");
  assert.equal(state.contextItems[0]?.projectionSaved, true);
  assert.equal(state.approvalReceipts[0]?.actionKind, "contact_vendor");
  assert.equal(state.approvalReceipts[0]?.status, "executed");
  assert.equal(state.approvalReceipts[0]?.blockKind, null);
  assert.equal(state.approvalReceipts[0]?.externalId, "vendor:message-1");
  assert.equal(state.approvalReceipts[0]?.providerReceiptId, "gmail-receipt-1");
  assert.equal(state.approvalReceipts[0]?.providerMessageId, "gmail-message-1");
  assert.equal(state.approvalReceipts[0]?.messageId, "rfc822-message-1");
  assert.equal(state.approvalReceipts[0]?.clientMessageId, "local-message-1");
  assert.equal(state.approvalReceipts[0]?.deliveryChannel, "email");
  assert.equal(state.approvalReceipts[0]?.deliverySubject, "Harbour Hall follow-up");
  assert.equal(state.approvalReceipts[0]?.deliveryThreadId, "wedding_vendor_quote:response_workspace:persisted:harbour-hall");
  assert.equal(state.approvalReceipts[0]?.deliveryInReplyTo, "<quote-message@harbour.example>");
  assert.deepEqual(state.approvalReceipts[0]?.deliveryReferences, ["<quote-message@harbour.example>", "afp-quote-message-1"]);
  assert.deepEqual(state.approvalReceipts[0]?.deliveryRecipients, ["events@harbour.example"]);
  assert.equal(state.approvalReceipts[0]?.providerCapability, "email");
  assert.equal(state.approvalReceipts[0]?.requiredProvider, "Gmail or email provider");
  assert.equal(state.approvalReceipts[0]?.providerExecutorStatus, "missing");
  assert.equal(state.approvalReceipts[0]?.providerResultOk, true);
  assert.equal(state.approvalReceipts[0]?.externalDeliveryPerformed, false);
  assert.equal(state.approvalReceipts[0]?.missingDurableProviderReceipt, false);
  assert.equal(state.approvalReceipts[0]?.providerSetupView, "email");
  assert.equal(state.decisionRecords[0]?.selectedOptionLabel, "Harbour Hall");
  assert.equal(state.decisionRecords[0]?.artifactTitle, artifactsTitleFromState(state));
  assert.ok(state.decisionRecords[0]?.selectedOptionCells.includes("Sydney"));
  assert.deepEqual(state.decisionRecords[0]?.sourceProviderLabels, ["google_places"]);
  assert.ok(state.decisionRecords[0]?.sourceLabels?.includes("Venue website"));
  assert.ok(state.decisionRecords[0]?.sourceUrls?.includes("https://harbour.example"));
  assert.equal(state.decisionRecords[0]?.semanticKind, "wedding_decision");
  assert.ok(state.decisionRecords[0]?.semanticTags?.includes("wedding_approval_required"));
  assert.equal(state.decisionRecords[0]?.semanticObject?.title, "Decision: Harbour Hall");
  assert.equal(state.boundaryObjects.length, 0);
  assert.deepEqual(state.sourceMessageIds.length, 8);
});

test("buildWeddingPersistedWorkspaceState recovers vendor quote thread artifacts", () => {
  const quote = {
    kind: "quote" as const,
    vendorName: "Chloe's Florals",
    amount: 799,
    amountLabel: "AUD $799",
    currency: "AUD",
    budgetDeltaAmount: 200,
    budgetDeltaLabel: "$200 over budget",
    inclusions: ["Bridal bouquet", "Ceremony arrangements"],
    validUntil: "2026-10-15",
    attachmentUrl: "https://example.com/chloe-quote.pdf",
  };
  const incoming = weddingVendorQuoteIncomingAfpMessage({
    quote,
    metadata,
    subject: "Floral quote",
    createdAt: "2026-09-27T00:00:00.000Z",
  });
  const flow = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    quoteMessageId: incoming.id,
  });
  const draft = weddingVendorQuoteDraftAfpSendInput({
    flow,
    recipient: flow.recipient,
    subject: flow.subject,
    body: flow.draftBody,
    parentId: incoming.id,
    createdAt: "2026-09-27T00:01:00.000Z",
  });
  const state = buildWeddingPersistedWorkspaceState({
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
    messages: [
      incoming,
      {
        ...draft,
        id: String(draft.metadata?.id ?? "draft-message"),
        timestamp: draft.timestamp ?? "2026-09-27T00:01:00.000Z",
        kind: draft.kind ?? null,
        subtype: draft.subtype ?? null,
        metadata: draft.metadata ?? {},
        views: draft.views ?? [],
        attachments: draft.attachments ?? [],
      },
    ],
  });

  assert.equal(state.artifacts.length, 2);
  const quoteArtifact = state.artifacts.find((artifact) => artifact.kind === "vendor_table");
  const draftArtifact = state.artifacts.find((artifact) => artifact.kind === "email_draft");
  assert.equal(quoteArtifact?.id, incoming.id);
  assert.equal(quoteArtifact?.title, "Chloe's Florals quote");
  assert.match(quoteArtifact?.bodyText ?? "", /Quote amount: AUD \$799/);
  assert.match(quoteArtifact?.bodyText ?? "", /Original PDF: https:\/\/example.com\/chloe-quote.pdf/);
  assert.ok(quoteArtifact?.sourceLabels?.includes("Vendor quote thread"));
  assert.equal(draftArtifact?.id, draft.metadata?.id);
  assert.equal(draftArtifact?.title, "Floral quote");
  assert.match(draftArtifact?.bodyText ?? "", /Recipient: hello@chloes.example/);
  assert.match(draftArtifact?.bodyText ?? "", /Thanks Chloe, we would like to proceed/);
});

test("buildWeddingPersistedWorkspaceState prefers explicit artifacts over recovered vendor thread fallbacks", () => {
  const quote = {
    kind: "quote" as const,
    vendorName: "Chloe's Florals",
    amount: 799,
    amountLabel: "AUD $799",
    currency: "AUD",
    budgetDeltaAmount: 200,
    budgetDeltaLabel: "$200 over budget",
    inclusions: ["Bridal bouquet"],
    validUntil: "2026-10-15",
    attachmentUrl: "https://example.com/chloe-quote.pdf",
  };
  const incoming = weddingVendorQuoteIncomingAfpMessage({
    quote,
    metadata,
    subject: "Floral quote",
    createdAt: "2026-09-27T00:00:00.000Z",
  });
  const explicitArtifact = {
    ...incoming,
    subtype: "wedding_artifact",
    content: {
      artifact_id: incoming.id,
      artifact_kind: "vendor_table",
      title: "Explicit Chloe quote artifact",
      markdown: [
        "# Explicit Chloe quote artifact",
        "",
        "Vendor: Chloe's Florals",
        "Quote amount: AUD $799",
        "Budget delta: $200 over budget",
        "",
        "This body came from the explicit artifact projection.",
      ].join("\n"),
    },
    metadata: {
      ...incoming.metadata,
      artifact_kind: "vendor_table",
      artifact_title: "Explicit Chloe quote artifact",
    },
  };
  const state = buildWeddingPersistedWorkspaceState({
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
    messages: [incoming, explicitArtifact],
  });

  assert.equal(state.artifacts.length, 1);
  assert.equal(state.artifacts[0]?.id, incoming.id);
  assert.equal(state.artifacts[0]?.title, "Explicit Chloe quote artifact");
  assert.match(state.artifacts[0]?.bodyText ?? "", /explicit artifact projection/i);
});

test("buildWeddingPersistedWorkspaceState reloads boundary ledger decisions from AFP messages", () => {
  const policy: WeddingBoundaryPolicy = {
    id: "policy:no-extra-plus-ones",
    kind: "wedding_boundary_policy",
    title: "No extra plus-ones",
    status: "active",
    visibility: "family_visible",
    ruleType: "plus_one",
    enforcement: "require_approval",
    plainLanguage: "Extra plus-ones need couple approval.",
  };
  const pendingRequest: WeddingBoundaryChangeRequest = {
    id: "request:taylor-plus-one",
    kind: "wedding_boundary_change_request",
    title: "Add Taylor's plus-one",
    visibility: "approved_shared",
    requestId: "request:taylor-plus-one",
    requestedBy: "person:janet",
    changeType: "plus_one_change",
    targetPersonId: "person:taylor",
    requestStatus: "pending",
    approvalRequired: true,
    policyIds: ["policy:no-extra-plus-ones"],
    publicReason: "Janet asked for this.",
  };
  const decision = buildWeddingBoundaryRequestDecision({
    request: pendingRequest,
    decision: "approve",
    decidedAt: "2026-09-24T09:00:00.000Z",
    publicReason: "Approved by the couple.",
    privateRationaleCiphertext: "sealed:private-couple-rationale",
  });
  const state = buildWeddingPersistedWorkspaceState({
    messages: [
      weddingBoundaryLedgerObjectToAfpMessage(policy, metadata, "2026-09-24T08:00:00.000Z"),
      weddingBoundaryLedgerObjectToAfpMessage(pendingRequest, metadata, "2026-09-24T08:05:00.000Z"),
      weddingBoundaryLedgerObjectToAfpMessage(decision.updatedRequest, metadata, "2026-09-24T09:00:00.000Z"),
      weddingBoundaryLedgerObjectToAfpMessage(decision.rationale!, metadata, "2026-09-24T09:00:00.000Z"),
    ],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });

  const request = state.boundaryObjects.find(
    (object): object is WeddingBoundaryChangeRequest => object.kind === "wedding_boundary_change_request",
  );

  assert.equal(state.hasPersistedData, true);
  assert.equal(state.boundaryObjects.length, 3);
  assert.equal(request?.requestStatus, "approved");
  assert.equal(request?.approvalRequired, false);
  assert.equal(request?.semanticKind, "wedding_active_loop");
  assert.ok(request?.semanticTags?.includes("wedding_boundary_change_request"));
  assert.equal(request?.semanticObject?.title, "Add Taylor's plus-one");
  assert.equal((request?.metadata as Record<string, unknown> | undefined)?.persisted_boundary_ledger, true);
  assert.equal((request?.metadata as Record<string, unknown> | undefined)?.semantic_kind, "wedding_active_loop");
  assert.equal(typeof (request?.metadata as Record<string, unknown> | undefined)?.persisted_afp_message_id, "string");
  assert.ok(state.boundaryObjects.some((object) => object.kind === "wedding_boundary_policy"));
  assert.ok(state.boundaryObjects.some((object) => object.kind === "wedding_boundary_decision_rationale"));
});

test("buildWeddingPersistedWorkspaceState preserves auto-blocked boundary gate history without pending review", () => {
  const blockedRequest: WeddingBoundaryChangeRequest = {
    id: "request:auto-blocked-child",
    kind: "wedding_boundary_change_request",
    title: "Add a child guest",
    visibility: "approved_shared",
    requestId: "request:auto-blocked-child",
    requestedBy: "person:janet",
    changeType: "add_guest",
    targetPersonId: "person:child",
    requestStatus: "auto_blocked",
    approvalRequired: true,
    policyIds: ["policy:no-children"],
    publicReason: "A couple-approved rule blocks this change.",
  };
  const message = weddingBoundaryLedgerObjectToAfpMessage(blockedRequest, metadata, "2026-09-24T08:05:00.000Z");
  const state = buildWeddingPersistedWorkspaceState({
    messages: [message],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });
  const request = state.boundaryObjects.find(
    (object): object is WeddingBoundaryChangeRequest => object.kind === "wedding_boundary_change_request",
  );

  assert.equal(message.content.approval_required, false);
  assert.equal(message.content.approval_gate_recorded, true);
  assert.equal(request?.requestStatus, "auto_blocked");
  assert.equal(request?.approvalRequired, true);
});

test("buildWeddingPersistedWorkspaceState reloads saved seating constraints from AFP messages", () => {
  const action = buildWeddingSeatingConstraintActionFromInstruction({
    instruction: "Move Uncle David away from Mum.",
    people: [
      { id: "mum", label: "Mum" },
      { id: "uncle-david", label: "Uncle David" },
    ],
  });
  assert.ok(action);
  const state = buildWeddingPersistedWorkspaceState({
    messages: [
      weddingSeatingConstraintActionToAfpMessage({ action, metadata, createdAt: "2026-09-26T00:00:00.000Z" }),
    ],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });

  assert.equal(state.hasPersistedData, true);
  assert.equal(state.seatingConstraints.length, 1);
  assert.equal(state.seatingConstraints[0]?.kind, "keep_apart");
  assert.equal(state.seatingConstraints[0]?.primaryPersonId, "uncle-david");
  assert.equal(state.seatingConstraints[0]?.relatedPersonId, "mum");
});

test("buildWeddingPersistedWorkspaceState reloads saved seating drafts from AFP messages", () => {
  const result = buildWeddingSeatingOptimizationResult({
    people: [
      { id: "mum", label: "Mum" },
      { id: "uncle-david", label: "Uncle David", conflictPersonIds: ["mum"] },
    ],
    tables: [
      { id: "table-1", label: "Table 1", capacity: 10 },
      { id: "table-2", label: "Table 2", capacity: 10 },
    ],
  });
  const newerResult = {
    ...result,
    assignments: result.assignments.map((assignment) => assignment.personId === "mum"
      ? { ...assignment, tableId: "table-2", tableLabel: "Table 2" }
      : assignment),
    explanationLabels: ["Newer saved seating draft."],
  };
  const state = buildWeddingPersistedWorkspaceState({
    messages: [
      weddingSeatingOptimizationResultToAfpMessage({ result: newerResult, metadata, createdAt: "2026-09-26T00:10:00.000Z" }),
      weddingSeatingOptimizationResultToAfpMessage({ result, metadata, createdAt: "2026-09-26T00:05:00.000Z" }),
    ],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });

  assert.equal(state.hasPersistedData, true);
  assert.equal(state.seatingOptimizations.length, 2);
  assert.equal(state.seatingOptimizations[0]?.explanationLabels[0], result.explanationLabels[0]);
  assert.equal(state.seatingOptimizations.at(-1)?.explanationLabels[0], "Newer saved seating draft.");
  assert.equal(state.seatingOptimizations.at(-1)?.assignments.find((assignment) => assignment.personId === "mum")?.tableLabel, "Table 2");
});

test("buildWeddingPersistedWorkspaceState reloads hidden seating draft records", () => {
  const state = buildWeddingPersistedWorkspaceState({
    messages: [
      weddingSeatingDraftArchiveToAfpMessage({
        fingerprint: "guest-1:table-1",
        metadata,
        createdAt: "2026-09-26T00:15:00.000Z",
      }),
    ],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });

  assert.equal(state.hasPersistedData, true);
  assert.equal(state.seatingDraftArchives.length, 1);
  assert.equal(state.seatingDraftArchives[0]?.fingerprint, "guest-1:table-1");
});

test("buildWeddingPersistedWorkspaceState reloads wedding inspiration knowledge", () => {
  const state = buildWeddingPersistedWorkspaceState({
    messages: [
      weddingInspirationItemsToAfpMessage({
        items: [buildWeddingInspirationItem({
          title: "Reception inspiration",
          note: "warm lighting and long table",
          createdAt: "2026-09-26T00:00:00.000Z",
        })],
        metadata,
        createdAt: "2026-09-26T00:20:00.000Z",
      }),
    ],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });

  assert.equal(state.hasPersistedData, true);
  assert.equal(state.inspirationItems.length, 1);
  assert.ok(state.inspirationItems[0]?.tags.includes("warm lighting"));
});

test("buildWeddingPersistedWorkspaceState coalesces duplicate inspiration saves newest-first", () => {
  const original = buildWeddingInspirationItem({
    title: "Reception inspiration",
    note: "warm lighting",
    createdAt: "2026-09-26T00:00:00.000Z",
  });
  const refined = {
    ...original,
    note: "warm lighting and long table",
    tags: [...original.tags, "long table"],
    preferenceSignals: [...original.preferenceSignals, "communal table style"],
  };
  const state = buildWeddingPersistedWorkspaceState({
    messages: [
      weddingInspirationItemsToAfpMessage({
        items: [refined],
        metadata,
        createdAt: "2026-09-26T00:30:00.000Z",
      }),
      weddingInspirationItemsToAfpMessage({
        items: [original],
        metadata,
        createdAt: "2026-09-26T00:20:00.000Z",
      }),
    ],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });

  assert.equal(state.hasPersistedData, true);
  assert.equal(state.inspirationItems.length, 1);
  assert.equal(state.inspirationItems[0]?.note, "warm lighting and long table");
  assert.ok(state.inspirationItems[0]?.tags.includes("long table"));
});

function artifactsTitleFromState(state: ReturnType<typeof buildWeddingPersistedWorkspaceState>): string | undefined {
  return state.artifacts.find((artifact) => artifact.id === state.decisionRecords[0]?.artifactId)?.title;
}

test("buildWeddingPersistedWorkspaceState reloads approval receipt block kinds", () => {
  const blockedRequest = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send venue draft",
    metadata,
  });
  const blockedReceipt = buildWeddingApprovalReceiptState(blockedRequest, "2026-09-11T01:00:00.000Z");
  const state = buildWeddingPersistedWorkspaceState({
    messages: [weddingApprovalReceiptToAfpMessage(blockedReceipt)],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });

  assert.equal(state.approvalReceipts.length, 1);
  assert.equal(state.approvalReceipts[0]?.status, "blocked");
  assert.equal(state.approvalReceipts[0]?.blockKind, "needs_user_approval");
  assert.equal(state.approvalReceipts[0]?.semanticKind, "wedding_approval_required");
  assert.ok(state.approvalReceipts[0]?.semanticTags?.includes("wedding_approval_receipt"));
  assert.equal(state.approvalReceipts[0]?.semanticObject?.stateLabel, "Blocked");
});

test("buildWeddingPersistedWorkspaceState reloads deferred wedding decision records", () => {
  const message = weddingDecisionDeferralToAfpMessage({
    metadata,
    item: {
      id: "task:weather-backup",
      kind: "task",
      title: "Confirm wet-weather backup",
      pressureFamily: "attention",
      rankWeight: 72,
      dueLabel: "Before deposit",
      dueAt: "2026-09-27T09:00:00.000Z",
      explanation: "Weather backup is blocking venue confidence.",
      evidenceLabels: ["selected venue", "no backup found"],
      sourceSurface: "tasks",
      simulatorSeedKind: "response",
    },
  }, "2026-09-25T09:00:00.000Z");
  const state = buildWeddingPersistedWorkspaceState({
    messages: [message],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });

  assert.equal(state.hasPersistedData, true);
  assert.equal(state.decisionDeferrals.length, 1);
  assert.equal(state.decisionDeferrals[0]?.focusItemId, "task:weather-backup");
  assert.equal(state.decisionDeferrals[0]?.title, "Confirm wet-weather backup");
  assert.deepEqual(state.decisionDeferrals[0]?.evidenceLabels, ["selected venue", "no backup found"]);
  assert.equal(state.decisionDeferrals[0]?.deferredUntilAt, "2026-09-24T09:00:00.000Z");
  assert.equal(state.decisionDeferrals[0]?.staleAfterAt, "2026-10-02T09:00:00.000Z");
  assert.match(state.decisionDeferrals[0]?.dependencyFingerprint ?? "", /weather-backup/i);
  assert.ok(state.decisionDeferrals[0]?.metadataLabels.includes("deferred decision"));
  assert.ok(state.decisionDeferrals[0]?.metadataLabels.includes("bring back 2026-09-24"));
});

test("buildWeddingPersistedWorkspaceState reloads registry provider handoff metadata", () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "publish_registry",
    title: "Publish registry",
    metadata,
    userApproved: true,
  });
  const receipt = buildWeddingApprovalReceiptState(request, "2026-09-11T01:00:00.000Z");
  const message = weddingApprovalReceiptToAfpMessage({
    ...receipt,
    metadata: {
      ...receipt.metadata,
      execution_mode: "omnyid_internal_approval_handoff",
      provider_capability: "registry",
      required_provider: "Registry provider",
      provider_credential_status: "missing",
      provider_executor_status: "missing",
      provider_executor_connected: false,
      provider_setup_view: "connected_apps",
      external_provider_required: true,
    },
  });
  const state = buildWeddingPersistedWorkspaceState({
    messages: [message],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });

  assert.equal(state.approvalReceipts.length, 1);
  assert.equal(state.approvalReceipts[0]?.actionKind, "publish_registry");
  assert.equal(state.approvalReceipts[0]?.executionMode, "omnyid_internal_approval_handoff");
  assert.equal(state.approvalReceipts[0]?.providerCapability, "registry");
  assert.equal(state.approvalReceipts[0]?.requiredProvider, "Registry provider");
  assert.equal(state.approvalReceipts[0]?.providerCredentialStatus, "missing");
  assert.equal(state.approvalReceipts[0]?.providerExecutorStatus, "missing");
  assert.equal(state.approvalReceipts[0]?.providerExecutorConnected, false);
  assert.equal(state.approvalReceipts[0]?.providerSetupView, "connected_apps");
  assert.equal(state.approvalReceipts[0]?.externalProviderRequired, true);
});
