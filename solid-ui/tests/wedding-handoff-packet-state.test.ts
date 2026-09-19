import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingHandoffPacketState } from "../src/lib/weddingHandoffPacketState.ts";
import { buildWeddingResponseWorkspaceViewState } from "../src/lib/weddingResponseWorkspaceViewState.ts";
import type { WeddingArtifactInput } from "../src/lib/weddingArtifactState.ts";

const metadata = {
  wedding_plan_id: "wedding_plan:handoff",
  response_workspace_id: "response_workspace:handoff",
  source_response_id: "response:handoff",
};

function memoryStorage(): Storage {
  return {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  } as Storage;
}

function artifact(input: Partial<WeddingArtifactInput> & Pick<WeddingArtifactInput, "title" | "kind" | "createdAt">): WeddingArtifactInput {
  return {
    id: `artifact:${String(input.title).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    metadata,
    sourceLabels: ["Agent output"],
    ...input,
  };
}

test("buildWeddingHandoffPacketState summarizes workspace counts without artifact bodies", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        title: "Venue research",
        kind: "research",
        createdAt: 1,
        linkedCalendarEventIds: ["event:tour"],
        linkedTaskIds: ["task:call"],
        sourceLinks: [{ label: "Venue source", url: "https://example.com/venue" }],
        bodyText: "Private body that should not be copied into the handoff packet.",
      }),
      artifact({
        title: "Guest list",
        kind: "guest_list",
        createdAt: 2,
        linkedCalendarEventIds: ["event:tour"],
        linkedTaskIds: ["task:rsvp"],
      }),
      artifact({
        title: "Venue email",
        kind: "email_draft",
        createdAt: 3,
        metadata: { ...metadata, approval_state: "pending_user_approval" },
      }),
    ],
    decisionRecords: [{
      id: "wedding_decision:venue:harbour-hall",
      artifactId: "artifact:venue-research",
      artifactTitle: "Venue research",
      artifactKind: "research",
      selectedOptionId: "row-1",
      selectedOptionLabel: "Harbour Hall",
      selectedOptionDetail: "Selected venue.",
      selectedOptionCells: ["Harbour Hall"],
      sourceProviderLabels: ["google_places"],
      createdAt: "2026-09-12T00:00:00.000Z",
      source: "local_selection",
      metadataLabels: [],
    }],
  });

  const packet = buildWeddingHandoffPacketState(state);

  assert.equal(packet.version, 1);
  assert.equal(packet.artifactCount, 3);
  assert.equal(packet.resultCount, 3);
  assert.equal(packet.linkedCalendarCount, 1);
  assert.equal(packet.linkedTaskCount, 2);
  assert.equal(packet.approvalPromptCount, 1);
  assert.equal(packet.decisionScopeCount, 1);
  assert.equal(packet.decisionFocusCount > 0, true);
  assert.equal(packet.decisionFocusLabels.length > 0, true);
  assert.equal(packet.exportExcludedSensitiveCount, 2);
  assert.equal(packet.sourceLinkedCount, 1);
  assert.equal(packet.sourceLabelledCount, 2);
  assert.equal(packet.sourceUnverifiedCount, 0);
  assert.deepEqual(packet.decisionSourceProviderLabels, ["google_places"]);
  assert.ok(packet.labels.includes("1 linked date"));
  assert.ok(packet.labels.includes("2 linked tasks"));
  assert.ok(packet.labels.includes("1 selected decision scope"));
  assert.ok(packet.labels.some((label) => /decision focus item/i.test(label)));
  assert.ok(packet.labels.includes("decision providers: google_places"));
  assert.ok(packet.labels.includes("1 source-linked file"));
  assert.ok(packet.labels.includes("no source-unverified files"));
  assert.equal(JSON.stringify(packet).includes("Private body"), false);
});

test("buildWeddingHandoffPacketState carries source verification counts without bodies", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        title: "Vendor shortlist",
        kind: "vendor_table",
        createdAt: 1,
        sourceLinks: [{ label: "Vendor page", url: "https://example.com/vendor" }],
      }),
      artifact({
        title: "Budget assumptions",
        kind: "budget_sheet",
        createdAt: 2,
        sourceLabels: ["Agent estimate"],
      }),
      artifact({
        title: "Registry ideas",
        kind: "registry",
        createdAt: 3,
        sourceLabels: [],
      }),
    ],
  });

  const packet = buildWeddingHandoffPacketState(state);

  assert.equal(packet.sourceLinkedCount, 1);
  assert.equal(packet.sourceLabelledCount, 1);
  assert.equal(packet.sourceUnverifiedCount, 1);
  assert.ok(packet.labels.includes("1 source-linked file"));
  assert.ok(packet.labels.includes("1 source-unverified file"));
  assert.equal(JSON.stringify(packet).includes("Vendor page"), false);
});

test("buildWeddingHandoffPacketState flags imported files for handoff review even when inferred as research", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [
      artifact({
        title: "Imported vendor spreadsheet",
        kind: "research",
        createdAt: 1,
        metadata: {
          ...metadata,
          artifactKind: "research",
          supertags: ["wedding_import", "wedding_import:spreadsheet", "wedding_import_status:synthesized"],
        },
        sourceLabels: ["original upload saved", "source: The Knot export"],
        bodyText: "Uploaded venue notes and private negotiation limits must not enter the handoff packet.",
      }),
      artifact({
        title: "Public venue research",
        kind: "research",
        createdAt: 2,
        sourceLinks: [{ label: "Venue website", url: "https://example.com/venue" }],
      }),
    ],
  });

  const packet = buildWeddingHandoffPacketState(state);

  assert.equal(packet.importedArtifactCount, 1);
  assert.equal(packet.importedHandoffReviewCount, 1);
  assert.equal(packet.exportExcludedSensitiveCount, 1);
  assert.ok(packet.labels.includes("1 imported private planning file in workspace"));
  assert.ok(packet.labels.includes("1 imported file requires handoff review"));
  assert.equal(JSON.stringify(packet).includes("private negotiation limits"), false);
  assert.equal(JSON.stringify(packet).includes("The Knot export"), false);
});

test("buildWeddingHandoffPacketState includes projection readiness counts", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [artifact({ title: "Timeline", kind: "timeline", createdAt: 1 })],
    scheduleItems: [{
      id: "event:ceremony",
      title: "Ceremony",
      startAt: "2027-10-03T04:00:00.000Z",
      status: "draft",
      metadata,
    }],
    taskItems: [{
      id: "task:noim",
      title: "Download NOIM",
      status: "pending",
      dueLabel: "Anytime",
      metadata,
    }],
    projectionStorage: memoryStorage(),
  });

  const packet = buildWeddingHandoffPacketState(state);

  assert.equal(packet.projectionPendingCount, state.projectionQueue?.queue.pendingItems.length);
  assert.ok(packet.projectionPendingCount > 2);
  assert.equal(packet.projectionBlockedCount, 0);
  assert.equal(packet.projectionSentCount, 0);
});
