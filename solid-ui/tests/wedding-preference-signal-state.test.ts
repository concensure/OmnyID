import assert from "node:assert/strict";
import test from "node:test";

import { weddingPreferenceSignalResult } from "../src/lib/weddingPreferenceSignalState.ts";
import { weddingPreferenceSignalFromAfpMessage, weddingPreferenceSignalToAfpSendInput } from "../src/lib/weddingPreferenceSignalAfpState.ts";
import { weddingPreferenceProfileToAfpSendInput } from "../src/lib/weddingPreferenceProfileAfpState.ts";

const now = new Date("2026-10-16T00:00:00.000Z");
const signal = (id: string, reason: "too_big" | "not_our_style", vendorId = "venue-1", createdAt = "2026-10-15T00:00:00.000Z") => ({
  id, weddingPlanId: "plan-1", vendorId, comparisonArtifactId: "comparison-1", profileFingerprint: null, reason, vendorFacetIds: ["setting.waterfront"], createdAt,
});

test("feedback automatic changes are nice-weight, vocabulary-bounded, and never must-haves", () => {
  const valid = signal("signal-1", "not_our_style");
  const result = weddingPreferenceSignalResult({ profile: { facets: [], unmapped: [] }, signals: [{ ...valid, vendorFacetIds: [...valid.vendorFacetIds, "invented.facet"] }], weddingPlanId: "plan-1", now });
  assert.equal(result.profile.facets.length, 1);
  assert.partialDeepStrictEqual(result.profile.facets[0], { facetId: "setting.waterfront", polarity: -1, weight: "nice", authority: "feedback" });
  assert.deepEqual(result.derivedFromSignalIds, ["signal-1"]);
});

test("three distinct current too-big vendors prompt while duplicates, future, and expired feedback do not", () => {
  const result = weddingPreferenceSignalResult({
    profile: { facets: [], unmapped: [] },
    signals: [
      signal("one", "too_big", "venue-1"), signal("duplicate", "too_big", "venue-1"),
      signal("two", "too_big", "venue-2"), signal("three", "too_big", "venue-3"),
      signal("future", "not_our_style", "venue-4", "2027-01-01T00:00:00.000Z"),
      signal("old", "not_our_style", "venue-5", "2026-06-01T00:00:00.000Z"),
    ],
    weddingPlanId: "plan-1",
    now,
  });
  assert.match(result.confirmationPrompt ?? "", /3 large venues/);
  assert.deepEqual(result.profile.facets, []);
});

test("signals are plan-isolated and contact raises confidence only for an existing matching facet", () => {
  const profile = { facets: [{ facetId: "setting.waterfront", weight: "nice" as const, polarity: 1 as const, anchor: "water", anchorSource: "preference" as const, confidence: 0.5, authority: "deterministic" as const }], unmapped: [] };
  const result = weddingPreferenceSignalResult({
    profile,
    signals: [{ ...signal("foreign", "not_our_style"), weddingPlanId: "other-plan" }, { ...signal("contact", "not_our_style"), reason: "contacted" as const }],
    weddingPlanId: "plan-1",
    now,
  });
  assert.equal(result.profile.facets.length, 1);
  assert.equal(result.profile.facets[0]?.confidence, 0.75);
  assert.deepEqual(result.activeSignalIds, ["contact"]);
});

test("signal AFP inputs are private, referenced, deterministic, and strictly parsed", () => {
  const projection = weddingPreferenceSignalToAfpSendInput({
    metadata: { weddingPlanId: "plan-1", responseWorkspaceId: "workspace-1", sourceResponseId: null, privacyScope: "private", supertags: [] },
    vendorId: "venue-1", comparisonArtifactId: "comparison-1", reason: "not_our_style", vendorFacetIds: ["setting.waterfront"], createdAt: "2026-10-16T00:00:00.000Z",
  });
  assert.ok(projection);
  assert.equal(projection?.input.subtype, "wedding_preference_signal");
  assert.equal(projection?.input.metadata?.store, true);
  assert.equal(projection?.input.references?.length, 2);
  assert.deepEqual(weddingPreferenceSignalFromAfpMessage({ id: projection?.signal.id, subtype: projection?.input.subtype, timestamp: projection?.signal.createdAt, content: projection?.input.content }), projection?.signal);
  assert.equal(weddingPreferenceSignalFromAfpMessage({ subtype: "wedding_preference_signal", content: { reason: "not_our_style" } }), null);
});

test("a feedback-derived profile successor retains exact contributing signal ids", () => {
  const input = weddingPreferenceProfileToAfpSendInput({
    metadata: { weddingPlanId: "plan-1", responseWorkspaceId: "workspace-1", sourceResponseId: null, privacyScope: "private", supertags: [] },
    profile: { facets: [], unmapped: [] }, revision: "feedback", derivedFromSignals: ["signal-2", "signal-1", "signal-1"],
  });
  assert.deepEqual((input.content as Record<string, unknown>).derived_from_signals, ["signal-2", "signal-1"]);
});
