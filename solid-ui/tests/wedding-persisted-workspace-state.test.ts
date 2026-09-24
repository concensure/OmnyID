import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingArtifactGenerationState } from "@/lib/weddingArtifactGenerationState";
import { buildWeddingApprovalRequestState, buildWeddingApprovalReceiptState } from "@/lib/weddingApprovalState";
import { weddingApprovalReceiptToAfpMessage } from "@/lib/weddingApprovalReceiptAfpProjectionState";
import { weddingGeneratedArtifactsToAfpMessages } from "@/lib/weddingArtifactAfpProjectionState";
import { buildWeddingAustralianLegalSetupState } from "@/lib/weddingAustralianLegalSetupState";
import {
  buildWeddingTaskAlertReminderScheduleItems,
  weddingScheduleItemToAfpCalendarMessage,
  weddingTaskItemToAfpTaskMessage,
  type WeddingPlanningScheduleItem,
  type WeddingPlanningTaskItem,
} from "@/lib/weddingCalendarProjectionState";
import { weddingNeedToKnowContextToAfpMessage } from "@/lib/weddingNeedToKnowAfpProjectionState";
import { buildWeddingPersistedWorkspaceState } from "@/lib/weddingPersistedWorkspaceState";
import { normalizeWeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";
import { weddingDecisionProjectionToAfpMessage } from "@/lib/weddingDecisionAfpProjectionState";
import { buildWeddingImportSynthesisState } from "@/lib/weddingImportSynthesisState";
import { buildWeddingBoundaryRequestDecision } from "@/lib/weddingBoundaryDecisionState";
import {
  weddingBoundaryLedgerObjectToAfpMessage,
  type WeddingBoundaryChangeRequest,
  type WeddingBoundaryPolicy,
} from "@/lib/weddingBoundaryLedgerState";

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
  };
  const taskItem: WeddingPlanningTaskItem = {
    id: "confirm-package",
    title: "Confirm package inclusions",
    kind: "vendor_follow_up",
    dueAt: "2027-09-20T17:00:00+10:00",
    priority: "high",
    metadata,
    linkedArtifactId: artifacts[0]?.summary.id,
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
        execution_mode: "omnyid_internal_approval_handoff",
        provider_capability: "email",
        required_provider: "Gmail or email provider",
        provider_credential_status: "missing",
        provider_executor_status: "missing",
        provider_executor_connected: false,
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
  assert.equal(state.contextItems[0]?.planningContext.location, "Sydney NSW");
  assert.equal(state.contextItems[0]?.projectionSaved, true);
  assert.equal(state.approvalReceipts[0]?.actionKind, "contact_vendor");
  assert.equal(state.approvalReceipts[0]?.status, "executed");
  assert.equal(state.approvalReceipts[0]?.blockKind, null);
  assert.equal(state.approvalReceipts[0]?.externalId, "vendor:message-1");
  assert.equal(state.approvalReceipts[0]?.providerCapability, "email");
  assert.equal(state.approvalReceipts[0]?.requiredProvider, "Gmail or email provider");
  assert.equal(state.approvalReceipts[0]?.providerExecutorStatus, "missing");
  assert.equal(state.approvalReceipts[0]?.providerSetupView, "email");
  assert.equal(state.decisionRecords[0]?.selectedOptionLabel, "Harbour Hall");
  assert.equal(state.decisionRecords[0]?.artifactTitle, artifactsTitleFromState(state));
  assert.ok(state.decisionRecords[0]?.selectedOptionCells.includes("Sydney"));
  assert.deepEqual(state.decisionRecords[0]?.sourceProviderLabels, ["google_places"]);
  assert.ok(state.decisionRecords[0]?.sourceLabels?.includes("Venue website"));
  assert.ok(state.decisionRecords[0]?.sourceUrls?.includes("https://harbour.example"));
  assert.equal(state.boundaryObjects.length, 0);
  assert.deepEqual(state.sourceMessageIds.length, 8);
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
  assert.equal((request?.metadata as Record<string, unknown> | undefined)?.persisted_boundary_ledger, true);
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

test("buildWeddingPersistedWorkspaceState preserves wedding import original-upload receipts", () => {
  const imports = buildWeddingImportSynthesisState({
    metadata,
    files: [{
      name: "rsvp.csv",
      text: "Name,RSVP\nAlex,Yes",
      uploadReceipt: {
        status: "saved",
        messageId: "upload-message-1",
        attachment: {
          id: "attachment-1",
          name: "rsvp.csv",
          mime_type: "text/csv",
          size_bytes: 19,
          storage: { backend: "local", key: "uploads/rsvp.csv" },
          encryption: { mode: "server" },
          sha256: "hash-1",
        },
      },
    }],
  });
  const state = buildWeddingPersistedWorkspaceState({
    messages: weddingGeneratedArtifactsToAfpMessages(imports.generatedArtifacts, "2026-09-11T00:00:00.000Z"),
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });
  const artifactMetadata = state.artifacts[0]?.metadata as Record<string, unknown>;

  assert.equal(state.artifacts.length, 1);
  assert.equal(artifactMetadata.originalUploadStatus, "saved");
  assert.equal(artifactMetadata.originalUploadMessageId, "upload-message-1");
  assert.equal(artifactMetadata.originalUploadAttachmentId, "attachment-1");
  assert.equal(artifactMetadata.originalUploadSha256, "hash-1");
  assert.deepEqual(artifactMetadata.originalUploadStorage, { backend: "local", key: "uploads/rsvp.csv" });
});

test("buildWeddingPersistedWorkspaceState bounds legacy original-upload receipts on reload", () => {
  const longId = "x".repeat(260);
  const imports = buildWeddingImportSynthesisState({
    metadata,
    files: [{
      name: "budget.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      text: "",
      uploadReceipt: {
        status: "saved",
        messageId: "upload-message-1",
        attachment: {
          id: "attachment-1",
          name: "budget.xlsx",
          mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          size_bytes: 19,
          storage: { backend: "local", key: "uploads/budget.xlsx" },
          encryption: { mode: "server" },
          sha256: "hash-1",
        },
      },
    }],
  });
  const [message] = weddingGeneratedArtifactsToAfpMessages(imports.generatedArtifacts, "2026-09-11T00:00:00.000Z");
  assert.ok(message);
  const state = buildWeddingPersistedWorkspaceState({
    messages: [{
      ...message,
      content: {
        ...message.content,
        original_upload_message_id: `msg-${longId}`,
        original_upload_attachment_id: `att-${longId}`,
        original_upload_sha256: `hash-${longId}`,
        original_upload_file_name: "../private/private-family-budget.xlsx",
        original_upload_mime_type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;${longId}`,
        original_upload_size_bytes: -42,
        original_upload_storage: {
          backend: "local",
          key: `uploads/private-family-budget.xlsx?${longId}`,
          nested: { unsafe: true },
        },
      },
    }],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });
  const artifactMetadata = state.artifacts[0]?.metadata as Record<string, unknown>;
  const storageReceipt = artifactMetadata.originalUploadStorage as Record<string, unknown>;

  assert.equal(state.artifacts.length, 1);
  assert.equal(artifactMetadata.originalUploadStatus, "saved");
  assert.equal(artifactMetadata.originalUploadFileName, "private-family-budget.xlsx");
  assert.equal(String(artifactMetadata.originalUploadMessageId).length, 200);
  assert.equal(String(artifactMetadata.originalUploadAttachmentId).length, 200);
  assert.equal(String(artifactMetadata.originalUploadSha256).length, 256);
  assert.equal(artifactMetadata.originalUploadSizeBytes, 0);
  assert.equal(storageReceipt.backend, "local");
  assert.match(storageReceipt.key as string, /^uploads\/private-family-budget\.xlsx/);
  assert.ok((storageReceipt.key as string).length <= 500);
  assert.equal(storageReceipt.nested, undefined);
});

test("buildWeddingPersistedWorkspaceState drops malformed persisted source URLs on reload", () => {
  const [artifactMessage] = weddingGeneratedArtifactsToAfpMessages(buildWeddingArtifactGenerationState({
    metadata,
    researchNotes: ["Review venue data."],
  }).artifacts, "2026-09-11T00:00:00.000Z");
  assert.ok(artifactMessage);
  const decisionMessage = weddingDecisionProjectionToAfpMessage({
    id: "wedding_decision:persisted:safe_source",
    metadata,
    artifactId: "artifact:source",
    artifactTitle: "Vendor shortlist",
    artifactKind: "vendor_table",
    sourceLabels: ["Mixed source"],
    sourceUrls: ["https://safe.example/source"],
    selectedOption: {
      id: "row-1",
      label: "Safe Vendor",
      detail: "Selected after source review.",
      rowIndex: 0,
      cells: ["Safe Vendor", "Venue", "Sydney"],
      selected: true,
      preferenceFitLabels: [],
      missingPreferenceLabels: [],
      tradeoffLabels: [],
      preferenceSummaryLabel: "No explicit preference-fit signals were detected for this row.",
    },
  }, "2026-09-11T00:10:00.000Z");

  const state = buildWeddingPersistedWorkspaceState({
    messages: [{
      ...artifactMessage,
      content: {
        ...artifactMessage.content,
        source_links: [
          { label: "Unsafe source", url: "javascript:alert(1)" },
          { label: "Safe source", url: "https://safe.example/artifact" },
        ],
      },
    }, {
      ...decisionMessage,
      content: {
        ...decisionMessage.content,
        source_urls: ["javascript:alert(1)", "not-a-url", "https://safe.example/source"],
      },
      metadata: {
        ...decisionMessage.metadata,
        source_urls: ["javascript:alert(1)", "https://metadata.example/source"],
      },
    }],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });

  assert.deepEqual(state.artifacts[0]?.sourceLinks, [{ label: "Safe source", url: "https://safe.example/artifact" }]);
  assert.deepEqual(state.decisionRecords[0]?.sourceUrls, ["https://safe.example/source"]);
});

test("buildWeddingPersistedWorkspaceState redacts legacy imported decision records on reload", () => {
  const decisionMessage = weddingDecisionProjectionToAfpMessage({
    id: "wedding_decision:persisted:legacy_import",
    metadata: {
      ...metadata,
      supertags: ["wedding_import", "wedding_import:spreadsheet"],
    },
    artifactId: "wedding_import:vendor_table:workspace:venues-xlsx",
    artifactTitle: "Imported XLSX: venues.xlsx",
    artifactKind: "vendor_table",
    sourceLabels: ["source: venues.xlsx", "original upload saved"],
    sourceUrls: ["https://example.com/venue"],
    selectedOption: {
      id: "row-1",
      label: "Harbour Hall",
      detail: "Selected waterfront venue.",
      rowIndex: 0,
      cells: ["Harbour Hall", "Sydney"],
      selected: true,
      preferenceFitLabels: [],
      missingPreferenceLabels: [],
      tradeoffLabels: [],
      preferenceSummaryLabel: "No explicit preference-fit signals were detected for this row.",
    },
  }, "2026-09-11T00:10:00.000Z");
  const state = buildWeddingPersistedWorkspaceState({
    messages: [{
      ...decisionMessage,
      content: {
        ...decisionMessage.content,
        artifact_title: "Imported XLSX: venues.xlsx",
        source_labels: ["source: venues.xlsx", "original upload saved"],
        source_urls: [
          "https://storage.example.test/uploads/venues.xlsx?token=private",
          "https://example.com/venue",
        ],
      },
      metadata: {
        ...decisionMessage.metadata,
        artifact_title: "Imported XLSX: venues.xlsx",
        source_labels: ["source: venues.xlsx", "original upload saved"],
        source_urls: [
          "https://storage.example.test/uploads/venues.xlsx?token=private",
          "https://example.com/venue",
        ],
      },
    }],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });
  const serialized = JSON.stringify(state.decisionRecords);

  assert.equal(state.decisionRecords[0]?.artifactTitle, "Imported private planning file");
  assert.deepEqual(state.decisionRecords[0]?.sourceLabels, ["Imported private planning file"]);
  assert.deepEqual(state.decisionRecords[0]?.sourceUrls, ["https://example.com/venue"]);
  assert.equal(serialized.includes("venues.xlsx"), false);
  assert.equal(serialized.includes("original upload saved"), false);
  assert.equal(serialized.includes("storage.example.test"), false);
  assert.equal(serialized.includes("token=private"), false);
});

test("buildWeddingPersistedWorkspaceState hides encrypted persisted schedule content while locked", () => {
  const message = weddingScheduleItemToAfpCalendarMessage({
    id: "encrypted-tour",
    title: "Hidden venue tour",
    kind: "venue_tour",
    startAt: "2027-09-18T10:00:00+10:00",
    location: "Hidden venue",
    metadata,
  }, "2026-09-11T00:00:00.000Z");
  assert.ok(message);

  const state = buildWeddingPersistedWorkspaceState({
    messages: [{
      ...message,
      content: {
        ...message.content,
        title: "Hidden venue tour",
        location: "Hidden venue",
        ciphertext: "abc123",
        nonce: "nonce123",
      },
      encryption: { scheme: "xchacha20-poly1305", key_id: "device-key" },
    } as any],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });

  assert.equal(state.scheduleItems.length, 1);
  assert.equal(state.scheduleItems[0]?.title, "Wedding date");
  assert.equal(state.scheduleItems[0]?.location, null);
  assert.equal(state.scheduleItems[0]?.startAt, null);
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

test("buildWeddingPersistedWorkspaceState preserves second-order task metadata", () => {
  const message = weddingTaskItemToAfpTaskMessage({
    id: "second-order-weather",
    title: "Confirm wet-weather backup for Harbour Hall",
    kind: "vendor_follow_up",
    priority: "high",
    metadata: {
      ...metadata,
      second_order_task: true,
      second_order_loop: "weather_backup",
      second_order_evidence_labels: ["weather-exposed plan", "selected scope: venue: Harbour Hall"],
      second_order_linked_artifact_id: "artifact:venue-table",
      selected_decision_scope: {
        selected_option_label: "Harbour Hall",
        artifact_id: "artifact:venue-table",
      },
    },
    linkedArtifactId: "artifact:venue-table",
  }, "2026-09-11T00:00:00.000Z");
  const state = buildWeddingPersistedWorkspaceState({
    messages: [message],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });
  const taskMetadata = state.taskItems[0]?.metadata as Record<string, unknown>;

  assert.equal(state.taskItems.length, 1);
  assert.equal(taskMetadata.second_order_task, true);
  assert.equal(taskMetadata.second_order_loop, "weather_backup");
  assert.deepEqual(taskMetadata.second_order_evidence_labels, ["weather-exposed plan", "selected scope: venue: Harbour Hall"]);
  assert.equal((taskMetadata.selected_decision_scope as Record<string, unknown>).selected_option_label, "Harbour Hall");
});

test("buildWeddingPersistedWorkspaceState redacts legacy imported selected-decision scope metadata on reload", () => {
  const message = weddingTaskItemToAfpTaskMessage({
    id: "second-order-import",
    title: "Confirm imported venue decision",
    kind: "vendor_follow_up",
    priority: "high",
    metadata: {
      ...metadata,
      second_order_task: true,
      second_order_loop: "vendor_confirmation",
      selected_decision_scope: {
        selected_option_label: "Harbour Hall",
        artifact_id: "artifact:venue-table",
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
    linkedArtifactId: "artifact:venue-table",
  }, "2026-09-11T00:00:00.000Z");
  const state = buildWeddingPersistedWorkspaceState({
    messages: [message],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });
  const scope = (state.taskItems[0]?.metadata as Record<string, unknown>).selected_decision_scope as Record<string, unknown>;
  const serialized = JSON.stringify(scope);

  assert.equal(scope.selected_option_label, "Harbour Hall");
  assert.equal(scope.artifact_title, "Imported private planning file");
  assert.equal(scope.artifactTitle, undefined);
  assert.deepEqual(scope.source_labels, ["Imported private planning file"]);
  assert.equal(scope.sourceLabels, undefined);
  assert.deepEqual(scope.source_urls, ["https://example.com/vendor-quote"]);
  assert.equal(scope.sourceUrls, undefined);
  assert.deepEqual(scope.metadata_labels, ["needs follow-up"]);
  assert.equal(scope.imported_private_evidence, true);
  assert.equal(serialized.includes("private-family-budget.xlsx"), false);
  assert.equal(serialized.includes("storage.example.test"), false);
  assert.equal(serialized.includes("token=private"), false);
  assert.equal(serialized.includes("original upload saved"), false);
  assert.equal(serialized.includes("wedding_import:spreadsheet"), false);
});

test("buildWeddingPersistedWorkspaceState preserves preparation task kind and alert metadata", () => {
  const message = weddingTaskItemToAfpTaskMessage({
    id: "prep-cake",
    title: "Book cake baker, tasting, design, delivery, and cutting plan",
    kind: "cake",
    dueAt: "2027-07-20T10:00:00.000Z",
    dueLabel: "6-9 months out; final details 4-6 weeks out",
    priority: "high",
    metadata: {
      ...metadata,
      preparation_checklist: true,
      preparation_checklist_item: "cake",
      alert_offset_days: [60, 30, 14],
      schedule_basis: "wedding_date",
      second_order_loop: "vendor_confirmation",
    },
  }, "2026-09-11T00:00:00.000Z");
  const state = buildWeddingPersistedWorkspaceState({
    messages: [message],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });
  const task = state.taskItems[0];
  const taskMetadata = task?.metadata as Record<string, unknown>;

  assert.equal(state.taskItems.length, 1);
  assert.equal(task?.kind, "cake");
  assert.deepEqual(taskMetadata.alert_offset_days, [60, 30, 14]);
  assert.deepEqual(taskMetadata.alert_dates, ["2027-05-21", "2027-06-20", "2027-07-06"]);
  assert.equal(taskMetadata.preparation_checklist_item, "cake");
  assert.equal(taskMetadata.second_order_loop, "vendor_confirmation");
});

test("buildWeddingPersistedWorkspaceState preserves calendar reminder metadata for dedupe", () => {
  const [reminder] = buildWeddingTaskAlertReminderScheduleItems({
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
        alert_offset_days: [60],
        alert_dates: ["2027-05-21"],
      },
    }],
  });
  assert.ok(reminder);
  const message = weddingScheduleItemToAfpCalendarMessage(reminder, "2026-09-11T00:00:00.000Z");
  assert.ok(message);

  const state = buildWeddingPersistedWorkspaceState({
    messages: [message],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });
  const schedule = state.scheduleItems[0];
  const scheduleMetadata = schedule?.metadata as Record<string, unknown>;

  assert.equal(state.scheduleItems.length, 1);
  assert.equal(schedule?.kind, "task_reminder");
  assert.equal(scheduleMetadata.alert_reminder, true);
  assert.equal(scheduleMetadata.alert_reminder_for_task_id, "prep-cake");
  assert.equal(scheduleMetadata.alert_date, "2027-05-21");

  const duplicates = buildWeddingTaskAlertReminderScheduleItems({
    taskItems: [{
      id: "prep-cake",
      title: "Book cake baker",
      kind: "cake",
      dueAt: "2027-07-20T10:00:00.000Z",
      metadata: {
        ...metadata,
        alert_offset_days: [60],
        alert_dates: ["2027-05-21"],
      },
    }],
    existingScheduleItems: state.scheduleItems,
  });
  assert.deepEqual(duplicates, []);
});

test("buildWeddingPersistedWorkspaceState treats persisted Need-To-Know context as saved queue context", () => {
  const state = buildWeddingPersistedWorkspaceState({
    messages: persistedMessages().slice(0, 1),
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });

  assert.equal(state.hasPersistedData, true);
  assert.equal(state.artifacts.length, 0);
  assert.equal(state.contextItems.length, 1);
  assert.equal(state.contextItems[0]?.metadata.responseWorkspaceId, metadata.responseWorkspaceId);
  assert.equal(state.contextItems[0]?.readyForFirstRecommendations, true);
});

test("buildWeddingPersistedWorkspaceState ignores messages from other workspaces", () => {
  const messages = persistedMessages();
  const otherWorkspace = {
    ...messages[0],
    id: "other",
    content: {
      ...messages[0]?.content,
      response_workspace_id: "response_workspace:other",
    },
    metadata: {
      ...messages[0]?.metadata,
      response_workspace_id: "response_workspace:other",
    },
  };
  const state = buildWeddingPersistedWorkspaceState({
    messages: [...messages, otherWorkspace],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
  });

  assert.equal(state.sourceMessageIds.includes("other"), false);
  assert.equal(state.hasPersistedData, true);
});
