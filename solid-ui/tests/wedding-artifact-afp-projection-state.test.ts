import test from "node:test";
import assert from "node:assert/strict";
import { buildWeddingArtifactGenerationState } from "@/lib/weddingArtifactGenerationState";
import {
  hasSentWeddingArtifactAfpProjection,
  loadWeddingArtifactAfpProjectionIds,
  markWeddingArtifactAfpProjectionSent,
  unmarkWeddingArtifactAfpProjectionSent,
  weddingGeneratedArtifactToAfpMessage,
  weddingGeneratedArtifactToAfpSendInput,
  weddingGeneratedArtifactsToAfpMessages,
} from "@/lib/weddingArtifactAfpProjectionState";
import { buildWeddingAustralianLegalSetupState } from "@/lib/weddingAustralianLegalSetupState";
import { buildWeddingImportSynthesisState } from "@/lib/weddingImportSynthesisState";

function generatedArtifacts() {
  return buildWeddingArtifactGenerationState({
    metadata: {
      weddingPlanId: "plan-alpha",
      responseWorkspaceId: "workspace-alpha",
      sourceResponseId: "response-alpha",
      privacyScope: "private",
      supertags: ["wedding:planning"],
    },
    researchNotes: ["Compare inner-city warehouse venues."],
    vendors: [{
      name: "Harbour Hall",
      category: "Venue",
      location: "Sydney",
      priceEstimate: "$20k",
      capacity: "120",
      fitReason: "Close to hotels",
      source: "Venue website",
    }],
    emailDrafts: [{
      recipientLabel: "Harbour Hall",
      subject: "Availability request",
      body: "Can you confirm availability and package inclusions?",
      vendor: "Harbour Hall",
    }],
  }).artifacts;
}

test("projects a generated research artifact into an AFP file artifact message", () => {
  const artifact = generatedArtifacts().find((item) => item.summary.kind === "research");
  assert.ok(artifact);

  const message = weddingGeneratedArtifactToAfpMessage(artifact, "2026-09-11T00:00:00.000Z");

  assert.equal(message.type, "artifact");
  assert.equal(message.kind, "file");
  assert.equal(message.subtype, "wedding_artifact");
  assert.equal(message.thread_id, "wedding_artifact:response_workspace:workspace-alpha");
  assert.deepEqual(message.to, ["agent://files", "agent://wedding-planning"]);
  assert.equal(message.content.artifact_kind, "research");
  assert.equal(message.content.markdown, artifact.markdown);
  assert.equal(message.content.wedding_plan_id, "wedding_plan:plan-alpha");
  assert.ok(message.supertags.includes("wedding_artifact:research"));
  assert.ok(message.views.some((view) => view.format === "document"));
  assert.ok(message.views.some((view) => view.format === "attachments"));
  assert.ok(message.references?.some((reference) => reference.target === "response-alpha"));
});

test("projects CSV artifacts with table views and ready CSV exports", () => {
  const artifact = generatedArtifacts().find((item) => item.summary.kind === "vendor_table");
  assert.ok(artifact);

  const message = weddingGeneratedArtifactToAfpMessage(artifact);

  assert.equal(message.content.csv_ready, true);
  assert.ok(Array.isArray(message.content.ready_export_targets));
  assert.ok((message.content.ready_export_targets as string[]).includes("csv"));
  assert.ok(message.views.some((view) => view.format === "table"));
  assert.ok(message.supertags.includes("vendor:harbour-hall"));
});

test("projects wedding import original upload receipts into AFP content and metadata", () => {
  const imports = buildWeddingImportSynthesisState({
    metadata: {
      weddingPlanId: "plan-alpha",
      responseWorkspaceId: "workspace-alpha",
      sourceResponseId: "response-alpha",
    },
    files: [{
      name: "guest-list.csv",
      text: "Name,RSVP\nAlex,Yes",
      uploadReceipt: {
        status: "saved",
        messageId: "upload-message-1",
        attachment: {
          id: "upload-attachment-1",
          name: "guest-list.csv",
          mime_type: "text/csv",
          size_bytes: 21,
          storage: { backend: "local", key: "uploads/guest-list.csv" },
          encryption: { mode: "server" },
          sha256: "abc123",
        },
      },
    }],
  });
  const importedArtifact = imports.generatedArtifacts[0]!;
  const message = weddingGeneratedArtifactToAfpMessage({
    ...importedArtifact,
    summary: {
      ...importedArtifact.summary,
      title: "Imported CSV: guest-list.csv",
      sourceLinks: [
        { label: "Original upload: guest-list.csv", url: "https://storage.example.test/uploads/guest-list.csv?token=private" },
      ],
    },
  });

  assert.equal(message.content.original_upload_status, "saved");
  assert.equal(message.content.original_upload_message_id, "upload-message-1");
  assert.equal(message.content.original_upload_attachment_id, "upload-attachment-1");
  assert.equal((message.content.original_upload as Record<string, unknown>).original_upload_sha256, "abc123");
  assert.equal(message.content.title, "Imported private planning file");
  assert.deepEqual(message.content.source_labels, ["Imported private planning file"]);
  assert.equal(message.content.source_label_count, 1);
  assert.equal(message.content.source_link_count, 1);
  assert.deepEqual(message.content.source_links, []);
  assert.equal(message.content.imported_private_evidence, true);
  assert.ok(message.supertags.includes("source:imported-private-planning-file"));
  assert.equal(message.metadata?.original_upload_attachment_id, "upload-attachment-1");
  assert.equal(message.metadata?.source_label_count, 1);
  assert.equal(message.metadata?.source_link_count, 1);
  assert.equal(message.metadata?.imported_private_evidence, true);

  const searchableTerms = message.metadata?.searchable_terms as string[];
  assert.ok(searchableTerms.includes("Imported private planning file"));
  assert.ok(searchableTerms.includes("private import evidence"));
  assert.equal(searchableTerms.includes("guest-list.csv"), false);
  assert.equal(searchableTerms.includes("Original upload: guest-list.csv"), false);
  assert.equal(searchableTerms.includes("https://storage.example.test/uploads/guest-list.csv?token=private"), false);
  assert.equal(searchableTerms.includes("upload-message-1"), false);
  assert.equal(searchableTerms.includes("upload-attachment-1"), false);
  assert.equal(searchableTerms.includes("abc123"), false);
  assert.equal(searchableTerms.includes("uploads/guest-list.csv"), false);
  assert.equal(JSON.stringify(message.views).includes("guest-list.csv"), false);
  assert.equal(JSON.stringify(message.views).includes("storage.example.test"), false);
  assert.equal(JSON.stringify(message.content).includes("storage.example.test"), false);
});

test("projects official source links for Australian legal setup artifacts", () => {
  const legal = buildWeddingAustralianLegalSetupState({
    metadata: {
      weddingPlanId: "plan-alpha",
      responseWorkspaceId: "workspace-alpha",
      sourceResponseId: "response-alpha",
    },
    location: "Sydney, NSW",
    noimDownloaded: "no",
    celebrantPath: "need_options",
  }).artifact;

  const message = weddingGeneratedArtifactToAfpMessage(legal);

  assert.ok(legal.summary.sourceLinks.some((source) => /notice-intended-marriage/i.test(source.url)));
  assert.deepEqual(message.content.source_links, legal.summary.sourceLinks);
  assert.ok((message.metadata?.searchable_terms as string[]).some((term) => /marriage\.ag\.gov\.au/i.test(term)));
  assert.match(message.content.markdown as string, /marriage\.ag\.gov\.au/);
});

test("pending email drafts include approval projection metadata", () => {
  const artifact = generatedArtifacts().find((item) => item.summary.kind === "email_draft");
  assert.ok(artifact);

  const message = weddingGeneratedArtifactToAfpMessage(artifact);

  assert.equal(message.content.approval_state, "pending_user_approval");
  assert.ok(message.supertags.includes("approval:pending_user_approval"));
  assert.ok(message.views.some((view) => view.format === "approvals"));
  assert.ok((message.metadata?.warning_labels as string[]).some((label) => label.includes("pending user approval")));
});

test("builds relational AFP send inputs for artifact persistence", () => {
  const artifact = generatedArtifacts()[0];
  const input = weddingGeneratedArtifactToAfpSendInput(artifact, "2026-09-11T00:00:00.000Z");

  assert.equal(input.type, "artifact");
  assert.equal(input.kind, "file");
  assert.equal(input.subtype, "wedding_artifact");
  assert.equal(input.store_in_relational, true);
  assert.ok(Array.isArray(input.views));
  assert.equal((input.content as Record<string, unknown>).artifact_id, artifact.summary.id);
});

test("projects generated artifact batches", () => {
  const artifacts = generatedArtifacts();
  const messages = weddingGeneratedArtifactsToAfpMessages(artifacts, "2026-09-11T00:00:00.000Z");

  assert.equal(messages.length, artifacts.length);
  assert.deepEqual(messages.map((message) => message.timestamp), messages.map(() => "2026-09-11T00:00:00.000Z"));
});

test("tracks sent artifact projection ids in local storage", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } as Storage;

  markWeddingArtifactAfpProjectionSent("artifact-1", storage);
  markWeddingArtifactAfpProjectionSent("artifact-1", storage);
  markWeddingArtifactAfpProjectionSent("artifact-2", storage);

  assert.deepEqual(loadWeddingArtifactAfpProjectionIds(storage), ["artifact-2", "artifact-1"]);
  assert.equal(hasSentWeddingArtifactAfpProjection("artifact-1", storage), true);

  unmarkWeddingArtifactAfpProjectionSent("artifact-1", storage);

  assert.equal(hasSentWeddingArtifactAfpProjection("artifact-1", storage), false);
  assert.deepEqual(loadWeddingArtifactAfpProjectionIds(storage), ["artifact-2"]);
});
