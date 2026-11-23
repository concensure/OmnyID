import test from "node:test";
import assert from "node:assert/strict";

import {
  clearStoredSharedReviewState,
  cloneWorkflowState,
  copyWorkflowCleanLinkState,
  copyWorkflowReviewLinkState,
  exportWorkflowJsonState,
  refreshStoredSharedReviewState,
  renameStoredSharedReviewState,
  resumeStoredSharedReviewState,
  togglePinStoredSharedReviewState,
} from "../src/lib/workflowUtilityState.ts";
import { readWorkflowStoredSharedReviewRecordState } from "../src/lib/workflowReviewLocalState.ts";

test("cloneWorkflowState requests clone and signals refetch", async () => {
  let request: Record<string, unknown> | null = null;
  const result = await cloneWorkflowState("wf-1", {
    queueUiCommand: async (body) => {
      request = body;
      return { ok: true };
    },
  });

  assert.deepEqual(request, { intent: "clone_workflow", workflow_id: "wf-1" });
  assert.deepEqual(result, { clonedId: "wf-1", shouldRefetch: true });
});

test("exportWorkflowJsonState builds a file download and always revokes the object url", () => {
  const events: string[] = [];
  const result = exportWorkflowJsonState(
    {
      workflowId: "wf-1",
      nodes: [],
      edges: [],
      exportedAt: "2026-09-01T00:00:00.000Z",
    },
    {
      createObjectUrl: () => {
        events.push("create");
        return "blob:workflow";
      },
      triggerDownload: (url, filename) => {
        events.push(`download:${url}:${filename}`);
      },
      revokeObjectUrl: (url) => {
        events.push(`revoke:${url}`);
      },
    },
  );

  assert.equal(result.filename, "workflow-wf-1.json");
  assert.deepEqual(events, [
    "create",
    "download:blob:workflow:workflow-wf-1.json",
    "revoke:blob:workflow",
  ]);
});

test("workflow utility copy helpers return typed href and feedback", async () => {
  const writes: string[] = [];
  const clean = await copyWorkflowCleanLinkState({
    clipboard: { writeText: (text) => void writes.push(text) },
    origin: "https://example.test",
    pathname: "/workflows",
    hash: "#canvas",
    workflowId: "wf-1",
  });
  const review = await copyWorkflowReviewLinkState({
    clipboard: null,
    currentHref: "https://example.test/workflows?wf=wf-1&run=run-1&srid=review-1#timeline",
    includeSavedReviewWorkspace: false,
    savedReviewWorkspaceActive: true,
  });

  assert.equal(clean.copied, true);
  assert.equal(clean.href, "https://example.test/workflows?wf=wf-1#canvas");
  assert.match(clean.feedback, /copied clean workflow link/i);
  assert.deepEqual(writes, ["https://example.test/workflows?wf=wf-1#canvas"]);

  assert.equal(review.copied, false);
  assert.equal(review.href, "https://example.test/workflows?wf=wf-1&run=run-1#timeline");
  assert.match(review.feedback, /copy this investigation link manually/i);
});

test("stored shared review utility helpers normalize resume, refresh, clear, rename, and pin flows", () => {
  const entry = {
    record: {
      id: "review-1",
      href: "https://example.test/workflows?wf=wf-1&run=run-1#timeline",
      saved_at: "2026-09-01T00:00:00.000Z",
      environment: "prod",
      deployment_id: "dep-1",
      share_mode: "workspace" as const,
      title: "Ops",
      pinned: false,
    },
    recordState: readWorkflowStoredSharedReviewRecordState(
      {
        href: "https://example.test/workflows?wf=wf-1&run=run-1#timeline",
        share_mode: "workspace",
      },
      "https://example.test",
    ),
  };

  const resumed = resumeStoredSharedReviewState({
    entry,
    historyWriter: {
      pushState: () => undefined,
      replaceState: () => undefined,
    },
  });
  const blocked = resumeStoredSharedReviewState({
    entry,
    historyWriter: {
      pushState: () => {
        throw new Error("blocked");
      },
      replaceState: () => undefined,
    },
  });
  const cleared = clearStoredSharedReviewState({ workflowId: "wf-1", record: entry.record });
  const refreshed = refreshStoredSharedReviewState({
    workflowId: "wf-1",
    href: "https://example.test/workflows?wf=wf-1",
    shareMode: "core",
  });
  const renamed = renameStoredSharedReviewState({
    workflowId: "wf-1",
    record: entry.record,
    promptReader: {
      prompt: () => "  New title  ",
    },
  });
  const pinned = togglePinStoredSharedReviewState({
    workflowId: "wf-1",
    record: entry.record,
  });

  assert.equal(resumed.kind, "restored");
  if (resumed.kind === "restored") {
    assert.match(resumed.feedback, /restored the stored shared investigation/i);
    assert.equal(resumed.reviewState?.workflow_id, "wf-1");
  }
  assert.deepEqual(blocked, {
    kind: "blocked",
    feedback: "Could not restore the stored shared investigation link.",
  });
  assert.deepEqual(cleared, {
    kind: "applied",
    feedback: "Cleared the stored shared investigation context for this workflow.",
  });
  assert.deepEqual(refreshed, {
    kind: "applied",
    href: "https://example.test/workflows?wf=wf-1",
    shareMode: "core",
    feedback: "Updated the stored shared investigation to match the current review context.",
  });
  assert.deepEqual(renamed, {
    kind: "applied",
    title: "New title",
    feedback: 'Renamed the saved investigation to "New title".',
  });
  assert.deepEqual(pinned, {
    kind: "applied",
    nextPinned: true,
    feedback: "Pinned the saved investigation.",
  });
});

test("stored shared review utility helpers preserve preflight, unavailable, and cancelled outcomes", () => {
  assert.deepEqual(
    clearStoredSharedReviewState({ workflowId: null, record: null }),
    {
      kind: "preflight",
      feedback: "No stored shared investigation context is available to clear.",
    },
  );
  assert.deepEqual(
    refreshStoredSharedReviewState({
      workflowId: null,
      href: "https://example.test/workflows",
      shareMode: "workspace",
    }),
    {
      kind: "preflight",
      feedback: "Select a workflow before refreshing its stored shared investigation.",
    },
  );
  assert.deepEqual(
    renameStoredSharedReviewState({
      workflowId: "wf-1",
      record: {
        id: "review-1",
        href: "https://example.test/workflows?wf=wf-1",
        saved_at: "2026-09-01T00:00:00.000Z",
        environment: null,
        deployment_id: null,
        title: null,
        pinned: false,
      },
      promptReader: null,
    }),
    {
      kind: "unavailable",
      feedback: "Could not open the saved investigation rename prompt.",
    },
  );
  assert.deepEqual(
    renameStoredSharedReviewState({
      workflowId: "wf-1",
      record: {
        id: "review-1",
        href: "https://example.test/workflows?wf=wf-1",
        saved_at: "2026-09-01T00:00:00.000Z",
        environment: null,
        deployment_id: null,
        title: null,
        pinned: false,
      },
      promptReader: {
        prompt: () => null,
      },
    }),
    { kind: "cancelled" },
  );
  assert.deepEqual(
    togglePinStoredSharedReviewState({ workflowId: null, record: null }),
    {
      kind: "preflight",
      feedback: "No stored shared investigation is selected to pin.",
    },
  );
});
