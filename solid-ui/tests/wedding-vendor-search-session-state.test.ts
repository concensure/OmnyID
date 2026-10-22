import assert from "node:assert/strict";
import test from "node:test";

import {
  loadWeddingVendorSearchSession,
  saveWeddingVendorSearchSession,
} from "../src/lib/weddingVendorSearchSessionState.ts";

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

test("vendor search sessions keep only the result bound to this workspace and account", () => {
  const store = storage();
  const resultAction = {
    label: "Show full search result",
    detail: "Three suitable venue choices found.",
    artifactId: "comparison:eastern-beaches",
    sourceArtifactId: "sources:eastern-beaches",
    menu: "documents" as const,
  };
  saveWeddingVendorSearchSession("workspace-a", {
    query: "beach venue for 90 guests",
    resultAction,
    status: "completed",
    updatedAt: "2026-10-22T00:00:00.000Z",
  }, store, "user-a");

  assert.deepEqual(loadWeddingVendorSearchSession("workspace-a", store, "user-a"), {
    query: "beach venue for 90 guests",
    resultAction,
    status: "completed",
    updatedAt: "2026-10-22T00:00:00.000Z",
  });
  assert.equal(loadWeddingVendorSearchSession("workspace-b", store, "user-a"), null);
  assert.equal(loadWeddingVendorSearchSession("workspace-a", store, "user-b"), null);
});

test("editing a search clears its prior comparison instead of reviving seeded artifacts", () => {
  const store = storage();
  saveWeddingVendorSearchSession("workspace-a", {
    query: "florist with native flowers",
    resultAction: null,
    status: "edited",
    updatedAt: "2026-10-22T01:00:00.000Z",
  }, store, "user-a");

  const session = loadWeddingVendorSearchSession("workspace-a", store, "user-a");
  assert.equal(session?.query, "florist with native flowers");
  assert.equal(session?.status, "edited");
  assert.equal(session?.resultAction, null);
});

test("malformed result actions fail closed", () => {
  const store = storage();
  store.setItem("omnyid.wedding.vendor-search-session.v1:user-a:workspace-a", JSON.stringify({
    query: "venue",
    status: "completed",
    resultAction: { artifactId: "" },
  }));
  assert.deepEqual(loadWeddingVendorSearchSession("workspace-a", store, "user-a"), {
    query: "venue",
    resultAction: null,
    status: "edited",
    updatedAt: "1970-01-01T00:00:00.000Z",
  });
});
