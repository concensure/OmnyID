import assert from "node:assert/strict";
import test from "node:test";
import {
  WEDDING_LEAD_MAGNET_RECORD_KEY,
  importWeddingLeadMagnetRecord,
  leadMagnetPairsToProfileInput,
  readLeadMagnetRecord,
  writeLeadMagnetRecord,
} from "../src/lib/weddingLeadMagnetImportState.ts";

function storage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

test("expired records are deleted while malformed records are ignored", () => {
  const expired = storage({
    [WEDDING_LEAD_MAGNET_RECORD_KEY]: JSON.stringify({
      version: 1,
      created_at: "2026-01-01T00:00:00.000Z",
      expires_at: "2026-01-02T00:00:00.000Z",
      core_theme: "warm",
      preferences: [],
    }),
  });
  assert.equal(readLeadMagnetRecord(expired, new Date("2026-02-01T00:00:00.000Z")), null);
  assert.equal(expired.getItem(WEDDING_LEAD_MAGNET_RECORD_KEY), null);
  assert.equal(readLeadMagnetRecord(storage({ [WEDDING_LEAD_MAGNET_RECORD_KEY]: "not-json" })), null);
});

test("valid output-only record becomes anchored tradeoff input without raw visitor text", () => {
  const store = storage();
  const record = writeLeadMagnetRecord(store, {
    core_theme: "warm and relaxed",
    preferences: [{ a: "people", b: "spectacle" }],
    largest_tension: null,
    opening_observation: "A calm celebration",
  }, new Date("2026-10-16T00:00:00.000Z"));
  assert.deepEqual(readLeadMagnetRecord(store, new Date("2026-10-17T00:00:00.000Z")), record);
  assert.deepEqual(leadMagnetPairsToProfileInput(record).tradeoffs, ["people over spectacle"]);
  assert.doesNotMatch(store.getItem(WEDDING_LEAD_MAGNET_RECORD_KEY) ?? "", /raw visitor text/i);
});

test("account import is idempotent, reviewable, and removes output only after save", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-17T00:00:00.000Z") });
  const store = storage();
  writeLeadMagnetRecord(store, {
    core_theme: "intimate garden warmth",
    preferences: [{ a: "people", b: "spectacle" }],
    largest_tension: null,
    opening_observation: null,
  }, new Date("2026-10-16T00:00:00.000Z"));
  const metadata = {
    template: "wedding_planning" as const,
    weddingPlanId: "wedding_plan:lead",
    responseWorkspaceId: "response_workspace:lead",
    sourceResponseId: null,
    artifactKind: null,
    supertags: [],
    privacyScope: "private" as const,
    approvalState: "draft" as const,
  };
  await assert.rejects(importWeddingLeadMagnetRecord({
    storage: store,
    metadata,
    saveProjection: async () => { throw new Error("offline"); },
  }));
  assert.ok(store.getItem(WEDDING_LEAD_MAGNET_RECORD_KEY));
  let savedId = "";
  const result = await importWeddingLeadMagnetRecord({
    storage: store,
    metadata,
    saveProjection: async (message) => { savedId = message.id ?? ""; },
  });
  assert.equal(result.status, "imported");
  assert.match(savedId, /^wedding_preference_profile:/);
  if (result.status === "imported") {
    assert.ok(result.profile.facets.every((facet) => facet.weight === "nice"));
    assert.equal(result.input.metadata?.import_source, "wedding_understanding");
  }
  assert.equal(store.getItem(WEDDING_LEAD_MAGNET_RECORD_KEY), null);
});
