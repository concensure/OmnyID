import test from "node:test";
import assert from "node:assert/strict";

import {
  collectDashboardFeedAvailableTopicKinds,
  collectDashboardFeedFallbackTopicTags,
  includeActiveDashboardFeedTopicKind,
  includeActiveDashboardFeedTopicTag,
  isDashboardFeedTopicLensLoading,
  normalizeDashboardFeedActiveTopicKind,
  resolveDashboardFeedTopicLensError,
  resolveDashboardFeedTopicBaseMessages,
  resolveDashboardFeedTopicSelectionMessages,
  selectDashboardFeedAvailableTopicTags,
  shouldShowDashboardFeedTopicLensControls,
} from "../src/lib/dashboardFeedTopicLens.ts";

test("resolveDashboardFeedTopicBaseMessages returns only matching tag payloads", () => {
  assert.deepEqual(
    resolveDashboardFeedTopicBaseMessages("alpha", {
      tag: "alpha",
      messages: ["a1", "a2"],
    }),
    ["a1", "a2"],
  );

  assert.deepEqual(
    resolveDashboardFeedTopicBaseMessages("beta", {
      tag: "alpha",
      messages: ["a1", "a2"],
    }),
    [],
  );
});

test("resolveDashboardFeedTopicSelectionMessages returns only matching tag and kind payloads", () => {
  assert.deepEqual(
    resolveDashboardFeedTopicSelectionMessages("alpha", "note", {
      tag: "alpha",
      kind: "note",
      messages: ["n1"],
    }),
    ["n1"],
  );

  assert.deepEqual(
    resolveDashboardFeedTopicSelectionMessages("alpha", "task", {
      tag: "alpha",
      kind: "note",
      messages: ["n1"],
    }),
    [],
  );

  assert.deepEqual(
    resolveDashboardFeedTopicSelectionMessages("beta", null, {
      tag: "alpha",
      kind: null,
      messages: ["a1"],
    }),
    [],
  );
});

test("isDashboardFeedTopicLensLoading only reports loading for an active topic lens", () => {
  assert.equal(isDashboardFeedTopicLensLoading(null, true, true), false);
  assert.equal(isDashboardFeedTopicLensLoading("alpha", true, false), true);
  assert.equal(isDashboardFeedTopicLensLoading("alpha", false, true), true);
  assert.equal(isDashboardFeedTopicLensLoading("alpha", false, false), false);
});

test("resolveDashboardFeedTopicLensError hides stale errors while a new topic lens request is loading", () => {
  assert.equal(
    resolveDashboardFeedTopicLensError("alpha", true, new Error("scoped failed"), new Error("base failed")),
    null,
  );
  assert.equal(
    resolveDashboardFeedTopicLensError("alpha", false, new Error("scoped failed"), new Error("base failed")),
    "scoped failed",
  );
  assert.equal(
    resolveDashboardFeedTopicLensError("alpha", false, null, new Error("base failed")),
    "base failed",
  );
  assert.equal(
    resolveDashboardFeedTopicLensError(null, false, new Error("scoped failed"), new Error("base failed")),
    null,
  );
});

test("normalizeDashboardFeedActiveTopicKind clears unavailable kind selections", () => {
  assert.equal(
    normalizeDashboardFeedActiveTopicKind("alpha", "note", []),
    "note",
  );

  assert.equal(
    normalizeDashboardFeedActiveTopicKind("alpha", "note", [
      { kind: "task", count: 2 },
      { kind: "event", count: 1 },
    ]),
    null,
  );

  assert.equal(
    normalizeDashboardFeedActiveTopicKind("alpha", "note", [
      { kind: "note", count: 3 },
      { kind: "task", count: 2 },
    ]),
    "note",
  );

  assert.equal(
    normalizeDashboardFeedActiveTopicKind(null, "note", [{ kind: "note", count: 3 }]),
    null,
  );
});

test("shouldShowDashboardFeedTopicLensControls preserves retry and clear paths", () => {
  assert.equal(
    shouldShowDashboardFeedTopicLensControls(0, null, false),
    false,
  );
  assert.equal(
    shouldShowDashboardFeedTopicLensControls(0, "alpha", false),
    true,
  );
  assert.equal(
    shouldShowDashboardFeedTopicLensControls(0, null, true),
    true,
  );
  assert.equal(
    shouldShowDashboardFeedTopicLensControls(3, null, false),
    true,
  );
});

test("includeActiveDashboardFeedTopicTag preserves the active tag in the lens row", () => {
  assert.deepEqual(
    includeActiveDashboardFeedTopicTag(
      [
        { tag: "beta", count: 4 },
        { tag: "gamma", count: 2 },
      ],
      "alpha",
      [
        { tag: "alpha", count: 3 },
        { tag: "beta", count: 4 },
        { tag: "gamma", count: 2 },
      ],
    ),
    [
      { tag: "alpha", count: 3 },
      { tag: "beta", count: 4 },
      { tag: "gamma", count: 2 },
    ],
  );

  assert.deepEqual(
    includeActiveDashboardFeedTopicTag(
      [
        { tag: "alpha", count: 5 },
        { tag: "beta", count: 4 },
      ],
      "alpha",
    ),
    [
      { tag: "alpha", count: 5 },
      { tag: "beta", count: 4 },
    ],
  );
});

test("includeActiveDashboardFeedTopicKind preserves the active kind in the lens row", () => {
  assert.deepEqual(
    includeActiveDashboardFeedTopicKind(
      [
        { kind: "thread", count: 3 },
        { kind: "note", count: 1 },
      ],
      "event",
    ),
    [
      { kind: "event", count: 0 },
      { kind: "thread", count: 3 },
      { kind: "note", count: 1 },
    ],
  );

  assert.deepEqual(
    includeActiveDashboardFeedTopicKind(
      [{ kind: "thread", count: 3 }],
      "thread",
    ),
    [{ kind: "thread", count: 3 }],
  );
});

test("collectDashboardFeedFallbackTopicTags counts from the broader unsnoozed undismissed baseline", () => {
  assert.deepEqual(
    collectDashboardFeedFallbackTopicTags(
      [
        { id: "1", supertags: ["alpha", "beta"] },
        { id: "2", supertags: ["alpha"] },
        { id: "3", supertags: ["gamma"] },
        { id: "4", supertags: ["beta"] },
      ],
      new Set(["3"]),
      new Map([["4", 5000]]),
      1000,
    ),
    [
      { tag: "alpha", count: 2 },
      { tag: "beta", count: 1 },
    ],
  );
});

test("collectDashboardFeedAvailableTopicKinds respects live state and active type chips", () => {
  assert.deepEqual(
    collectDashboardFeedAvailableTopicKinds(
      [
        { id: "1", kind: "thread", type: "email" },
        { id: "2", kind: "thread", type: "task" },
        { id: "3", kind: "note", type: "email" },
        { id: "4", kind: "event", type: "email" },
      ],
      new Set(["3"]),
      new Map([["4", 5000]]),
      1000,
      new Set(["email"]),
    ),
    [{ kind: "thread", count: 1 }],
  );

  assert.deepEqual(
    collectDashboardFeedAvailableTopicKinds(
      [
        { id: "1", kind: "thread", type: "email" },
        { id: "2", kind: "note", type: "task" },
      ],
      new Set(),
      new Map(),
      1000,
      new Set(),
    ),
    [
      { kind: "note", count: 1 },
      { kind: "thread", count: 1 },
    ],
  );
});

test("selectDashboardFeedAvailableTopicTags prefers the type-scoped fallback while type filters are active", () => {
  assert.deepEqual(
    selectDashboardFeedAvailableTopicTags(
      1,
      [
        { tag: "global", count: 9 },
        { tag: "shared", count: 4 },
      ],
      [
        { tag: "typed", count: 2 },
        { tag: "shared", count: 1 },
      ],
    ),
    [
      { tag: "typed", count: 2 },
      { tag: "shared", count: 1 },
    ],
  );

  assert.deepEqual(
    selectDashboardFeedAvailableTopicTags(
      0,
      [
        { tag: "global", count: 9 },
        { tag: "shared", count: 4 },
      ],
      [
        { tag: "typed", count: 2 },
      ],
    ),
    [
      { tag: "global", count: 9 },
      { tag: "shared", count: 4 },
    ],
  );
});
