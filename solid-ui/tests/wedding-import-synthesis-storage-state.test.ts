import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingImportSynthesisState,
  loadWeddingImportedArtifacts,
  saveWeddingImportedArtifacts,
  weddingImportStorageKey,
} from "../src/lib/weddingImportSynthesisState.ts";
import { buildWeddingResponseWorkspaceViewState } from "../src/lib/weddingResponseWorkspaceViewState.ts";
import {
  weddingMemoryStorage,
  weddingResponseWorkspaceMetadata as metadata,
} from "./wedding-response-workspace-fixtures.ts";

function uploadReceipt() {
  return {
    status: "saved" as const,
    messageId: "msg-upload-1",
    attachment: {
      id: "att-upload-1",
      name: "wedding-import.xlsx",
      mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size_bytes: 1200,
      storage: { backend: "local", key: "uploads/wedding-import.xlsx" },
      encryption: { mode: "server" },
      sha256: "hash-xlsx",
    },
  };
}

test("imported wedding artifacts persist in user storage for later workspace reloads", () => {
  const storage = weddingMemoryStorage();
  const state = buildWeddingImportSynthesisState({
    metadata,
    files: [{
      name: "vendors.csv",
      text: [
        "Vendor,Category,Contact,Quote",
        "Harbour Photos,Photography,hello@example.test,4500",
      ].join("\n"),
    }],
  });

  saveWeddingImportedArtifacts("response_workspace:planning-pass", state.generatedArtifacts, storage);
  saveWeddingImportedArtifacts("response_workspace:planning-pass", state.generatedArtifacts, storage);
  const loaded = loadWeddingImportedArtifacts("response_workspace:planning-pass", storage);

  assert.equal(loaded.length, 1);
  assert.equal(loaded[0]?.summary.kind, "vendor_table");
  assert.match(loaded[0]?.markdown ?? "", /Harbour Photos/);
});

test("stored wedding imports are normalized and scoped before reload", () => {
  const storage = weddingMemoryStorage();
  const state = buildWeddingImportSynthesisState({
    metadata,
    files: [{
      name: "vendors.csv",
      text: "Vendor,Category,Source\nHarbour Photos,Photography,Website",
    }],
  });
  const unsafe = {
    ...state.generatedArtifacts[0],
    input: {
      ...state.generatedArtifacts[0]!.input,
      metadata: {
        ...(state.generatedArtifacts[0]!.input.metadata as Record<string, unknown>),
        originalUploadStatus: "saved",
        originalUploadMessageId: "msg-incomplete",
        originalUploadAttachmentId: "att-incomplete",
        originalUploadSha256: "",
        originalUploadStorage: null,
        supertags: [
          ...((state.generatedArtifacts[0]!.input.metadata as any).supertags ?? []),
          "wedding_import_upload:saved",
        ],
      },
      searchLabels: [
        ...(state.generatedArtifacts[0]!.input.searchLabels ?? []),
        "original upload saved",
      ],
      sourceLinks: [
        { label: "Unsafe source", url: "javascript:alert(1)" },
        { label: "Safe source", url: "https://example.com/vendor" },
      ],
    },
    summary: {
      ...state.generatedArtifacts[0]!.summary,
      sourceLinks: [{ label: "Unsafe summary source", url: "javascript:alert(1)" }],
    },
  };
  const otherWorkspace = buildWeddingImportSynthesisState({
    metadata: {
      ...metadata,
      responseWorkspaceId: "response_workspace:other",
    },
    files: [{ name: "other.csv", text: "Name,RSVP\nWrong,Yes" }],
  });

  storage.setItem(weddingImportStorageKey("response_workspace:planning-pass"), JSON.stringify([
    unsafe,
    otherWorkspace.generatedArtifacts[0],
    { summary: {}, input: null, markdown: 123 },
  ]));
  const loaded = loadWeddingImportedArtifacts("response_workspace:planning-pass", storage);

  assert.equal(loaded.length, 1);
  assert.deepEqual(loaded[0]?.summary.sourceLinks, [{ label: "Safe source", url: "https://example.com/vendor" }]);
  assert.equal(loaded[0]?.summary.metadata.responseWorkspaceId, "response_workspace:planning-pass");
  assert.equal((loaded[0]?.input.metadata as any)?.originalUploadStatus, "failed");
  assert.match((loaded[0]?.input.metadata as any)?.originalUploadFailureLabel, /receipt is incomplete/i);
  assert.equal(loaded[0]?.input.searchLabels?.includes("original upload saved"), false);
  assert.equal(loaded[0]?.input.searchLabels?.includes("original upload not saved"), true);
});

test("stored wedding imports bound complete legacy upload receipts on reload", () => {
  const storage = weddingMemoryStorage();
  const longId = "x".repeat(260);
  const state = buildWeddingImportSynthesisState({
    metadata,
    files: [{
      name: "budget.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      text: "",
      uploadReceipt: uploadReceipt(),
    }],
  });
  const unsafe = {
    ...state.generatedArtifacts[0],
    input: {
      ...state.generatedArtifacts[0]!.input,
      metadata: {
        ...(state.generatedArtifacts[0]!.input.metadata as Record<string, unknown>),
        originalUploadStatus: "saved",
        originalUploadMessageId: `msg-${longId}`,
        originalUploadAttachmentId: `att-${longId}`,
        originalUploadSha256: `hash-${longId}`,
        originalUploadFileName: "../private/private-family-budget.xlsx",
        originalUploadMimeType: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;${longId}`,
        originalUploadSizeBytes: -12,
        originalUploadStorage: {
          backend: "local",
          key: `uploads/private-family-budget.xlsx?${longId}`,
          nested: { unsafe: true },
        },
      },
    },
  };

  storage.setItem(weddingImportStorageKey("response_workspace:planning-pass"), JSON.stringify([unsafe]));
  const loaded = loadWeddingImportedArtifacts("response_workspace:planning-pass", storage);
  const loadedMetadata = loaded[0]?.input.metadata as Record<string, unknown>;
  const storageReceipt = loadedMetadata.originalUploadStorage as Record<string, unknown>;

  assert.equal(loaded.length, 1);
  assert.equal(loadedMetadata.originalUploadStatus, "saved");
  assert.equal(loadedMetadata.originalUploadFileName, "private-family-budget.xlsx");
  assert.equal(String(loadedMetadata.originalUploadMessageId).length, 200);
  assert.equal(String(loadedMetadata.originalUploadAttachmentId).length, 200);
  assert.equal(String(loadedMetadata.originalUploadSha256).length, 256);
  assert.equal(loadedMetadata.originalUploadSizeBytes, 0);
  assert.equal(storageReceipt.backend, "local");
  assert.match(storageReceipt.key as string, /^uploads\/private-family-budget\.xlsx/);
  assert.ok((storageReceipt.key as string).length <= 500);
  assert.equal(storageReceipt.nested, undefined);
});

test("imported guest lists feed guest operations and seating synthesis", () => {
  const imports = buildWeddingImportSynthesisState({
    metadata,
    files: [{
      name: "rsvp-export.csv",
      text: [
        "Name,RSVP,Email,Meal,Dietary,Accessibility,Table,Household",
        "Alex Partner,Yes,alex@example.test,Fish,Nut allergy,Wheelchair access,Table 1,Family A",
        "Blair Friend,Pending,,Vegan,Vegan,,,",
      ].join("\n"),
    }],
  });
  const view = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: imports.artifactInputs,
    generatedArtifacts: imports.generatedArtifacts,
    projectionStorage: weddingMemoryStorage(),
  });

  assert.equal(view.guestTracking.guestRowCount, 2);
  assert.equal(view.guestTracking.pendingCount, 1);
  assert.equal(view.guestTracking.dietaryCount, 2);
  assert.equal(view.guestTracking.accessibilityCount, 1);
  assert.ok(view.guestTracking.followUpTaskCandidates.some((candidate) => /pending RSVP/.test(candidate.title)));
  assert.equal(view.seatingPlan.assignedSeatCount, 1);
  assert.equal(view.seatingPlan.unassignedAttendingCount, 0);
  assert.equal(view.projectionQueue?.groups.find((group) => group.kind === "task")?.items.some((item) => /pending RSVP/.test(item.title)), true);
});

test("workspace view exposes import parser readiness beside downstream wedding synthesis", () => {
  const imports = buildWeddingImportSynthesisState({
    metadata,
    files: [{
      name: "The Knot export.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      text: "",
    }],
  });
  const view = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: imports.artifactInputs,
    generatedArtifacts: imports.generatedArtifacts,
    projectionStorage: weddingMemoryStorage(),
  });

  assert.equal(view.importParserReadiness.productionReady, false);
  assert.equal(view.importParserReadiness.parserNeededCount, 1);
  assert.ok(view.importParserReadiness.nextActionLabels.some((label) => /Excel workbook import/i.test(label)));
  assert.equal(view.productionReadiness.oracleUploadAllowed, false);
  assert.ok(view.productionReadiness.checks.some((check) =>
    check.id === "import_parser_readiness" && check.status === "blocked"
  ));
  assert.ok(view.productionGoNoGoPacket?.gates.some((gate) =>
    gate.kind === "import_parser" && gate.status === "blocked"
  ));
  assert.ok(view.oracleUpdatePlan.blockerLabels.some((label) => /import parser/i.test(label)));
  assert.ok(view.projectionQueue?.groups.find((group) => group.kind === "task")?.items.some((item) =>
    /spreadsheet import parser/i.test(item.title)
  ));
});

test("saved wedding imports are isolated by user and ignore unowned legacy workspace keys", () => {
  const storage = weddingMemoryStorage();
  const userA = buildWeddingImportSynthesisState({
    metadata,
    files: [{ name: "guest-list.csv", text: "Name,RSVP\nAlex,Yes" }],
  });
  const userB = buildWeddingImportSynthesisState({
    metadata,
    files: [{ name: "budget.csv", text: "Category,Due,Vendor\nVenue,12000,Harbour House" }],
  });

  saveWeddingImportedArtifacts("response_workspace:planning-pass", userA.generatedArtifacts, storage, "user-a");
  saveWeddingImportedArtifacts("response_workspace:planning-pass", userB.generatedArtifacts, storage, "user-b");

  assert.equal(loadWeddingImportedArtifacts("response_workspace:planning-pass", storage, "user-a")[0]?.summary.kind, "guest_list");
  assert.equal(loadWeddingImportedArtifacts("response_workspace:planning-pass", storage, "user-b")[0]?.summary.kind, "budget_sheet");
  assert.equal(loadWeddingImportedArtifacts("response_workspace:planning-pass", storage, "user-c").length, 0);

  const legacy = buildWeddingImportSynthesisState({
    metadata: {
      ...metadata,
      responseWorkspaceId: "response_workspace:legacy",
    },
    files: [{ name: "legacy-guests.csv", text: "Name,RSVP\nCasey,Pending" }],
  });
  storage.setItem(weddingImportStorageKey("response_workspace:legacy"), JSON.stringify(legacy.generatedArtifacts));

  assert.equal(loadWeddingImportedArtifacts("response_workspace:legacy", storage, "legacy-user").length, 0);
  assert.notEqual(storage.getItem(weddingImportStorageKey("response_workspace:legacy")), null);
});
