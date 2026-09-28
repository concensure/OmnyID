import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingArtifactGenerationState } from "@/lib/weddingArtifactGenerationState";
import { weddingGeneratedArtifactsToAfpMessages } from "@/lib/weddingArtifactAfpProjectionState";
import { weddingScheduleItemToAfpCalendarMessage } from "@/lib/weddingCalendarProjectionState";
import { weddingDecisionProjectionToAfpMessage } from "@/lib/weddingDecisionAfpProjectionState";
import { buildWeddingImportSynthesisState } from "@/lib/weddingImportSynthesisState";
import { buildWeddingPersistedWorkspaceState } from "@/lib/weddingPersistedWorkspaceState";

const metadata = {
  weddingPlanId: "wedding_plan:persisted",
  responseWorkspaceId: "response_workspace:persisted",
  sourceResponseId: "response:persisted",
  supertags: ["template:wedding_planning", "event:wedding"],
};

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
          { label: "Local source", url: "http://localhost:8787/artifact" },
          { label: "Loopback source", url: "https://127.0.0.1/artifact" },
          { label: "Safe source", url: "https://safe.example/artifact" },
        ],
      },
    }, {
      ...decisionMessage,
      content: {
        ...decisionMessage.content,
        source_urls: [
          "javascript:alert(1)",
          "not-a-url",
          "http://localhost:8787/source",
          "https://127.0.0.1/source",
          "https://safe.example/source",
        ],
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
