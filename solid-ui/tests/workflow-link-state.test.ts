import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCleanWorkflowLinkHref,
  buildWorkflowReviewLinkHref,
  buildWorkflowReviewStateUrl,
  copyWorkflowTextToClipboard,
  promptWorkflowText,
  pushWorkflowHistoryState,
  replaceWorkflowHistoryState,
  workflowCleanLinkFeedback,
  workflowUrlsMatchView,
} from "../src/lib/workflowLinkState.ts";

test("buildWorkflowReviewLinkHref preserves saved-review context when requested", () => {
  const href = "https://example.test/workflows?wf=wf-1&run=run-1&srid=r1&sra=1&srf=ops&srsm=recent&srmf=workspace&srpo=1#canvas";

  assert.equal(buildWorkflowReviewLinkHref(href, true), href);
});

test("buildWorkflowReviewLinkHref removes all saved-review params for core links", () => {
  assert.equal(
    buildWorkflowReviewLinkHref(
      "https://example.test/workflows?wf=wf-1&run=run-1&srid=r1&sra=1&srf=ops&srsm=recent&srmf=workspace&srpo=1#canvas",
      false,
    ),
    "https://example.test/workflows?wf=wf-1&run=run-1#canvas",
  );
});

test("buildCleanWorkflowLinkHref encodes workflow id and drops review state", () => {
  assert.equal(
    buildCleanWorkflowLinkHref({
      origin: "https://example.test",
      pathname: "/workflows",
      hash: "#canvas",
      workflowId: "wf 1/2",
    }),
    "https://example.test/workflows?wf=wf+1%2F2#canvas",
  );
  assert.equal(
    buildCleanWorkflowLinkHref({
      origin: "https://example.test",
      pathname: "/workflows",
      hash: "",
      workflowId: null,
    }),
    "https://example.test/workflows",
  );
});

test("buildWorkflowReviewStateUrl preserves unrelated params and removes default review state", () => {
  assert.equal(
    buildWorkflowReviewStateUrl({
      currentSearch: "?keep=1&wf=old&run=old&tf=failed&rdf=deployment&rds=drift_desc&srid=r1&sra=1&srf=ops&srsm=recent&srmf=workspace&srpo=1",
      driftFilter: "all",
      focusedNodeId: null,
      hash: "#canvas",
      pathname: "/workflows",
      runHistorySortMode: "recent",
      runId: null,
      savedReviewFilter: "",
      savedReviewPinnedOnly: false,
      savedReviewShareModeFilter: "all",
      savedReviewSortMode: "priority",
      selectedDeploymentId: null,
      selectedEdgeId: null,
      selectedNodeId: null,
      selectedReviewId: null,
      showAllSavedReviews: false,
      timelineFilter: "all",
      workflowId: "wf-1",
    }),
    "/workflows?keep=1&wf=wf-1#canvas",
  );
});

test("buildWorkflowReviewStateUrl encodes full workflow review state", () => {
  assert.equal(
    buildWorkflowReviewStateUrl({
      currentSearch: "",
      driftFilter: "any",
      focusedNodeId: "node-focus",
      hash: "",
      pathname: "/workflows",
      runHistorySortMode: "drift_desc",
      runId: "run-1",
      savedReviewFilter: "ops review",
      savedReviewPinnedOnly: true,
      savedReviewShareModeFilter: "core",
      savedReviewSortMode: "recent",
      selectedDeploymentId: "dep-1",
      selectedEdgeId: "edge-1",
      selectedNodeId: "node-1",
      selectedReviewId: "review-1",
      showAllSavedReviews: true,
      timelineFilter: "replay_drift",
      workflowId: "wf 1/2",
    }),
    "/workflows?wf=wf+1%2F2&run=run-1&edge=edge-1&tf=replay_drift&focus=node-focus&dep=dep-1&node=node-1&rdf=any&rds=drift_desc&srid=review-1&sra=1&srf=ops+review&srsm=recent&srmf=core&srpo=1",
  );
});

test("replaceWorkflowHistoryState reports blocked history writes without throwing", () => {
  const writes: string[] = [];
  assert.equal(
    replaceWorkflowHistoryState({
      pushState: () => undefined,
      replaceState: (_data, _unused, url) => {
        writes.push(String(url));
      },
    }, "/workflows?wf=wf-1"),
    true,
  );
  assert.deepEqual(writes, ["/workflows?wf=wf-1"]);
  assert.equal(replaceWorkflowHistoryState(null, "/workflows"), false);
  assert.equal(
    replaceWorkflowHistoryState({
      pushState: () => undefined,
      replaceState: () => {
        throw new Error("blocked");
      },
    }, "/workflows"),
    false,
  );
});

test("pushWorkflowHistoryState reports blocked history writes without throwing", () => {
  const writes: string[] = [];
  assert.equal(
    pushWorkflowHistoryState({
      pushState: (_data, _unused, url) => {
        writes.push(String(url));
      },
      replaceState: () => undefined,
    }, "/workflows?run=run-1"),
    true,
  );
  assert.deepEqual(writes, ["/workflows?run=run-1"]);
  assert.equal(pushWorkflowHistoryState(null, "/workflows"), false);
  assert.equal(
    pushWorkflowHistoryState({
      pushState: () => {
        throw new Error("blocked");
      },
      replaceState: () => undefined,
    }, "/workflows"),
    false,
  );
});

test("copyWorkflowTextToClipboard reports unavailable and rejected clipboard writes", async () => {
  const writes: string[] = [];
  assert.equal(
    await copyWorkflowTextToClipboard({
      writeText: (text) => {
        writes.push(text);
      },
    }, "https://example.test/workflows"),
    true,
  );
  assert.deepEqual(writes, ["https://example.test/workflows"]);
  assert.equal(await copyWorkflowTextToClipboard(null, "x"), false);
  assert.equal(
    await copyWorkflowTextToClipboard({
      writeText: async () => {
        throw new Error("denied");
      },
    }, "x"),
    false,
  );
});

test("workflowCleanLinkFeedback preserves copied and manual fallback copy", () => {
  assert.equal(
    workflowCleanLinkFeedback({ copied: true, href: "https://example.test/workflows?wf=wf-1" }),
    "Copied clean workflow link to clipboard without run or investigation state.",
  );
  assert.equal(
    workflowCleanLinkFeedback({ copied: false, href: "https://example.test/workflows?wf=wf-1" }),
    "Copy this workflow link manually. It opens the workflow without run review context: https://example.test/workflows?wf=wf-1",
  );
});

test("workflowUrlsMatchView compares path, search, and hash defensively", () => {
  const stored = new URL("https://example.test/workflows?wf=wf-1&run=run-1#canvas");
  assert.equal(
    workflowUrlsMatchView(stored, "https://other-origin.test/workflows?wf=wf-1&run=run-1#canvas"),
    true,
  );
  assert.equal(
    workflowUrlsMatchView(stored, "https://example.test/workflows?wf=wf-1&run=run-2#canvas"),
    false,
  );
  assert.equal(
    workflowUrlsMatchView(stored, "https://example.test/workflows?wf=wf-1&run=run-1#rail"),
    false,
  );
  assert.equal(workflowUrlsMatchView(null, "https://example.test/workflows"), false);
  assert.equal(workflowUrlsMatchView(stored, "not a url"), false);
});

test("promptWorkflowText reports answered, cancelled, and unavailable prompts", () => {
  assert.deepEqual(
    promptWorkflowText({
      prompt: (_message, defaultValue) => `${defaultValue ?? ""} updated`,
    }, "Rename", "Current"),
    { kind: "answered", value: "Current updated" },
  );
  assert.deepEqual(
    promptWorkflowText({
      prompt: () => null,
    }, "Rename"),
    { kind: "cancelled" },
  );
  assert.deepEqual(promptWorkflowText(null, "Rename"), { kind: "unavailable" });
  assert.deepEqual(
    promptWorkflowText({
      prompt: () => {
        throw new Error("blocked");
      },
    }, "Rename"),
    { kind: "unavailable" },
  );
});
