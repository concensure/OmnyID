import assert from "node:assert/strict";
import test from "node:test";

import {
  applyWeddingPreferenceChipChange,
  confirmWeddingPreferenceProfile,
  preferenceProfileWithInterpreter,
  shouldInterpretWeddingPreferenceProfile,
} from "../src/lib/weddingPreferenceInterpreterState.ts";
import { weddingPreferenceProfileToAfpSendInput } from "../src/lib/weddingPreferenceProfileAfpState.ts";
import { weddingVendorMaterialFingerprint } from "../src/lib/weddingVendorShortlistPolicyState.ts";

const requirements = { topPriorities: ["Intimacy"], preferences: "moonlit opera courtyard" };

test("failed interpreter response keeps the deterministic profile", () => {
  assert.equal(shouldInterpretWeddingPreferenceProfile(requirements), true);
  const profile = preferenceProfileWithInterpreter(requirements, { status: "fallback", facets: [] });
  assert.equal(profile.facets.find((facet) => facet.facetId === "scale.intimate")?.authority, "deterministic");
  assert.ok(profile.unmapped.includes("moonlit opera courtyard"));
});

test("a confirmed facet overrides an interpreter facet", () => {
  const profile = preferenceProfileWithInterpreter({ preferences: "moonlit opera courtyard" }, { status: "interpreted", facets: [{ id: "setting.garden", weight: "nice", anchor: "moonlit opera courtyard", reading: "garden feeling" }] });
  const changed = applyWeddingPreferenceChipChange(profile, { facetId: "setting.garden", choice: "must" });
  const confirmed = confirmWeddingPreferenceProfile(changed);
  const facet = confirmed.facets.find((item) => item.facetId === "setting.garden");
  assert.deepEqual({ weight: facet?.weight, authority: facet?.authority, confidence: facet?.confidence }, { weight: "must", authority: "user", confidence: 1 });
  assert.equal(profile.facets.find((item) => item.facetId === "setting.garden")?.authority, "interpreter");
});

test("profile messages preserve lineage and a confirmed successor changes the comparison fingerprint", () => {
  const profile = preferenceProfileWithInterpreter({ preferences: "moonlit opera courtyard" }, { status: "interpreted", facets: [{ id: "setting.garden", weight: "nice", anchor: "moonlit opera courtyard", reading: "garden feeling" }] });
  const initial = weddingPreferenceProfileToAfpSendInput({ metadata: { weddingPlanId: "plan_1", responseWorkspaceId: "workspace_1", sourceResponseId: null, privacyScope: "private", supertags: [] }, profile, revision: "initial", createdAt: "2026-10-16T00:00:00.000Z" });
  const successor = weddingPreferenceProfileToAfpSendInput({ metadata: { weddingPlanId: "plan_1", responseWorkspaceId: "workspace_1", sourceResponseId: null, privacyScope: "private", supertags: [] }, profile: confirmWeddingPreferenceProfile(profile), parentProfileMessageId: initial.id, revision: "confirmed", createdAt: "2026-10-16T00:01:00.000Z" });
  assert.equal(successor.parent_id, initial.id);
  assert.equal(successor.subtype, "wedding_preference_profile");
  assert.ok(successor.supertags?.includes("wedding_facet:setting.garden"));
  const before = weddingVendorMaterialFingerprint({ weddingPlanId: "plan_1", category: "Venue", location: "Sydney", profileMessageId: initial.id, vocabularyVersion: "wedding_facets.v1" });
  const after = weddingVendorMaterialFingerprint({ weddingPlanId: "plan_1", category: "Venue", location: "Sydney", profileMessageId: successor.id, vocabularyVersion: "wedding_facets.v1" });
  assert.notEqual(before, after);
  assert.equal(initial.content && (initial.content as { facets: { authority: string }[] }).facets[0]?.authority, "interpreter");
});
