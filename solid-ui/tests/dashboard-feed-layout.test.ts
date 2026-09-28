import test from "node:test";
import assert from "node:assert/strict";
import { parseDashboardFeedLayout, pruneDashboardFeedLayout } from "../src/lib/dashboardFeedLayout.ts";

test("pruneDashboardFeedLayout keeps only currently visible card ids", () => {
  const next = pruneDashboardFeedLayout(
    [
      { id: "msg_a", x: 0, y: 0 },
      { id: "msg_b", x: 0, y: 4 },
      { id: "msg_c", x: 0, y: 8 },
    ],
    ["msg_b", "msg_c"],
  );
  assert.deepEqual(next, [
    { id: "msg_b", x: 0, y: 4 },
    { id: "msg_c", x: 0, y: 8 },
  ]);
});

test("pruneDashboardFeedLayout accepts legacy gs-id records", () => {
  const next = pruneDashboardFeedLayout(
    [
      { "gs-id": "msg_a", x: 0, y: 0 },
      { "gs-id": "msg_b", x: 0, y: 4 },
    ],
    ["msg_a"],
  );
  assert.deepEqual(next, [{ "gs-id": "msg_a", x: 0, y: 0 }]);
});

test("pruneDashboardFeedLayout drops malformed layout records", () => {
  const next = pruneDashboardFeedLayout(
    [
      { x: 0, y: 0 },
      { id: "", x: 0, y: 4 },
      { id: "msg_a", x: 0, y: 8 },
    ],
    ["msg_a"],
  );
  assert.deepEqual(next, [{ id: "msg_a", x: 0, y: 8 }]);
});

test("parseDashboardFeedLayout returns an empty array for malformed json", () => {
  assert.deepEqual(parseDashboardFeedLayout("{bad json", ["msg_a"]), []);
});

test("parseDashboardFeedLayout returns an empty array for non-array payloads", () => {
  assert.deepEqual(parseDashboardFeedLayout('{"id":"msg_a"}', ["msg_a"]), []);
});

test("parseDashboardFeedLayout parses and prunes visible items", () => {
  const next = parseDashboardFeedLayout(
    JSON.stringify([
      { id: "msg_a", x: 0, y: 0 },
      { id: "msg_b", x: 0, y: 4 },
    ]),
    ["msg_b"],
  );
  assert.deepEqual(next, [{ id: "msg_b", x: 0, y: 4 }]);
});

test("pruneDashboardFeedLayout strips a captured card content field so stale card markup cannot be replayed", () => {
  const next = pruneDashboardFeedLayout(
    [
      { id: "msg_a", x: 0, y: 0, w: 12, h: 4, content: '<div class="drag-handle">...</div>' },
    ],
    ["msg_a"],
  );
  assert.deepEqual(next, [{ id: "msg_a", x: 0, y: 0, w: 12, h: 4 }]);
});

test("parseDashboardFeedLayout ignores malformed array entries before pruning", () => {
  const next = parseDashboardFeedLayout(
    JSON.stringify([
      null,
      7,
      "bad-row",
      { id: "msg_a", x: 0, y: 0 },
      { id: "msg_b", x: 0, y: 4 },
    ]),
    ["msg_b"],
  );
  assert.deepEqual(next, [{ id: "msg_b", x: 0, y: 4 }]);
});
