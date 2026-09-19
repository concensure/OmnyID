import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeWeddingArtifactSummaries,
  normalizeWeddingArtifactSummary,
  weddingArtifactCategoryLabel,
} from "../src/lib/weddingArtifactState.ts";

test("normalizeWeddingArtifactSummary creates searchable vendor table summaries", () => {
  const artifact = normalizeWeddingArtifactSummary({
    title: "Sydney venue shortlist",
    kind: "vendor_table",
    createdAt: 10,
    metadata: {
      wedding_plan_id: "wedding_plan:harbour",
      response_workspace_id: "response_workspace:venue-pass",
      source_response_id: "afp:response-1",
      privacy_scope: "shared_partner",
      approval_state: "draft",
      supertags: ["wedding_vendor:venue", "location:sydney"],
    },
    exportTargets: ["csv", "html", "browser_pdf"],
    sourceLabels: ["Venue website", "Agent research"],
    sourceLinks: [
      { label: "Venue website", url: "https://example.com/venue" },
      { label: "Invalid source", url: "not-a-url" },
    ],
    searchLabels: ["request date-specific availability"],
    locationLabels: ["Sydney Harbour"],
    vendorLabels: ["Harbour View Room"],
    linkedTaskIds: ["task:tour"],
    linkedCalendarEventIds: ["calendar:tour"],
    bodyText: "Capacity 120 with wet weather backup.",
  });

  assert.equal(artifact?.title, "Sydney venue shortlist");
  assert.equal(artifact?.kind, "vendor_table");
  assert.equal(artifact?.category, "Vendors");
  assert.equal(artifact?.metadata.weddingPlanId, "wedding_plan:harbour");
  assert.equal(artifact?.metadata.responseWorkspaceId, "response_workspace:venue-pass");
  assert.equal(artifact?.metadata.sourceResponseId, "afp:response-1");
  assert.equal(artifact?.metadata.privacyScope, "shared_partner");
  assert.deepEqual(artifact?.exportTargets, ["csv", "html", "browser_pdf"]);
  assert.deepEqual(artifact?.sourceLinks, [{ label: "Venue website", url: "https://example.com/venue" }]);
  assert.ok(artifact?.searchText.includes("harbour view room"));
  assert.ok(artifact?.searchText.includes("https://example.com/venue"));
  assert.ok(artifact?.searchText.includes("request date-specific availability"));
  assert.ok(artifact?.searchText.includes("wet weather backup"));
});

test("normalizeWeddingArtifactSummary supplies kind-specific default exports", () => {
  const budget = normalizeWeddingArtifactSummary({
    title: "Budget",
    kind: "budget_sheet",
    metadata: { response_workspace_id: "response_workspace:budget" },
  });
  const map = normalizeWeddingArtifactSummary({
    title: "Venue map",
    kind: "map_collection",
    metadata: { response_workspace_id: "response_workspace:budget" },
  });

  assert.deepEqual(budget?.exportTargets, ["csv", "markdown", "html", "word_doc", "browser_pdf"]);
  assert.deepEqual(map?.exportTargets, ["html", "browser_pdf", "image_planned"]);
});

test("normalizeWeddingArtifactSummary redacts imported upload receipts from workspace search text", () => {
  const artifact = normalizeWeddingArtifactSummary({
    id: "wedding_import:guest_list:workspace:rsvp-csv",
    title: "Imported CSV: rsvp.csv",
    kind: "guest_list",
    metadata: {
      response_workspace_id: "response_workspace:imports",
      supertags: ["wedding_import", "wedding_import:csv"],
      originalUploadStatus: "saved",
      originalUploadMessageId: "upload-message-1",
      originalUploadAttachmentId: "attachment-1",
      originalUploadSha256: "0123456789abcdef0123456789abcdef",
      originalUploadFileName: "rsvp.csv",
    },
    sourceLabels: ["CSV import: rsvp.csv"],
    sourceLinks: [
      { label: "Original upload: rsvp.csv", url: "https://storage.example.test/uploads/rsvp.csv?token=private" },
    ],
    searchLabels: [
      "one-click import",
      "upload-message-1",
      "attachment-1",
      "0123456789abcdef0123456789abcdef",
      "guest list",
    ],
    bodyText: [
      "# Imported CSV: rsvp.csv",
      "",
      "## Original upload retention",
      "",
      "- Message: upload-message-1",
      "- Attachment: attachment-1",
      "- SHA-256: 0123456789abcdef0123456789abcdef",
      "",
      "## Extracted rows",
      "",
      "| Name | RSVP |",
      "| --- | --- |",
      "| Alex | Yes |",
    ].join("\n"),
  });

  assert.ok(artifact);
  assert.ok(artifact.searchText.includes("imported private planning file"));
  assert.ok(artifact.searchText.includes("one-click import"));
  assert.ok(artifact.searchText.includes("guest list"));
  assert.ok(artifact.searchText.includes("alex"));
  assert.equal(artifact.searchText.includes("rsvp.csv"), false);
  assert.equal(artifact.searchText.includes("storage.example.test"), false);
  assert.equal(artifact.searchText.includes("token=private"), false);
  assert.equal(artifact.searchText.includes("upload-message-1"), false);
  assert.equal(artifact.searchText.includes("attachment-1"), false);
  assert.equal(artifact.searchText.includes("0123456789abcdef0123456789abcdef"), false);
});

test("normalizeWeddingArtifactSummary rejects missing or unknown artifact kinds", () => {
  assert.equal(normalizeWeddingArtifactSummary({ title: "No kind" }), null);
  assert.equal(normalizeWeddingArtifactSummary({
    title: "Bad kind",
    metadata: { artifact_kind: "unknown" },
  }), null);
});

test("normalizeWeddingArtifactSummaries dedupes and sorts newest first", () => {
  const artifacts = normalizeWeddingArtifactSummaries([
    { id: "artifact:old", title: "Old", kind: "research", createdAt: 1 },
    { id: "artifact:new", title: "New", kind: "research", createdAt: 3 },
    { id: "artifact:new", title: "Duplicate", kind: "budget_sheet", createdAt: 4 },
  ]);

  assert.deepEqual(artifacts.map((artifact) => artifact.id), ["artifact:new", "artifact:old"]);
  assert.equal(artifacts[0]?.title, "New");
});

test("weddingArtifactCategoryLabel keeps stable workspace labels", () => {
  assert.equal(weddingArtifactCategoryLabel("email_draft"), "Emails");
  assert.equal(weddingArtifactCategoryLabel("decision_log"), "Decisions");
  assert.equal(weddingArtifactCategoryLabel("registry"), "Registry");
});
