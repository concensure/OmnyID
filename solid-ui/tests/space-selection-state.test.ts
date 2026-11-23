import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveActiveSpaceAfterRefresh,
  resolveSpaceToOpenAfterRefresh,
} from "../src/lib/spaceSelectionState.ts";

test("resolveActiveSpaceAfterRefresh returns the refreshed matching space", () => {
  const next = resolveActiveSpaceAfterRefresh("space_b", [
    { id: "space_a", name: "Alpha" },
    { id: "space_b", name: "Beta updated" },
  ]);
  assert.deepEqual(next, { id: "space_b", name: "Beta updated" });
});

test("resolveActiveSpaceAfterRefresh returns null when no active id exists", () => {
  assert.equal(resolveActiveSpaceAfterRefresh(null, [{ id: "space_a" }]), null);
});

test("resolveActiveSpaceAfterRefresh returns null when the active space disappeared", () => {
  assert.equal(resolveActiveSpaceAfterRefresh("space_z", [{ id: "space_a" }]), null);
});

test("resolveSpaceToOpenAfterRefresh prefers the refreshed matching space", () => {
  const fallback = { id: "space_b", name: "Beta stale" };
  const next = resolveSpaceToOpenAfterRefresh(
    "space_b",
    [
      { id: "space_a", name: "Alpha" },
      { id: "space_b", name: "Beta refreshed" },
    ],
    fallback,
  );
  assert.deepEqual(next, { id: "space_b", name: "Beta refreshed" });
});

test("resolveSpaceToOpenAfterRefresh falls back when the refreshed space is absent", () => {
  const fallback = { id: "space_b", name: "Beta stale" };
  const next = resolveSpaceToOpenAfterRefresh("space_b", [{ id: "space_a", name: "Alpha" }], fallback);
  assert.deepEqual(next, fallback);
});
