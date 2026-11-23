import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  weddingPlanIdFromSeed,
  weddingResponseWorkspaceIdFromSeed,
} from "../src/lib/weddingPlanningTemplateState.ts";

test("normalizeWeddingPlanningMetadata creates AFP-safe default wedding metadata", () => {
  const metadata = normalizeWeddingPlanningMetadata({});

  assert.equal(metadata.template, "wedding_planning");
  assert.equal(metadata.weddingPlanId, "wedding_plan:wedding");
  assert.equal(metadata.responseWorkspaceId, "response_workspace:wedding");
  assert.equal(metadata.sourceResponseId, null);
  assert.equal(metadata.artifactKind, null);
  assert.equal(metadata.privacyScope, "private");
  assert.equal(metadata.approvalState, "draft");
  assert.ok(metadata.supertags.includes("template:wedding_planning"));
  assert.ok(metadata.supertags.includes("event:wedding"));
  assert.ok(metadata.supertags.includes("wedding_plan:wedding"));
});

test("normalizeWeddingPlanningMetadata preserves known artifact, privacy, approval, and source fields", () => {
  const metadata = normalizeWeddingPlanningMetadata({
    wedding_plan_id: "wedding_plan:harbour",
    response_workspace_id: "response_workspace:venue-pass",
    source_response_id: "afp:message-1",
    artifact_kind: "vendor_table",
    privacy_scope: "shared_partner",
    approval_state: "pending_user_approval",
    supertags: ["wedding_vendor:venue", "wedding_vendor:venue", "Private budget: $90000"],
  });

  assert.equal(metadata.weddingPlanId, "wedding_plan:harbour");
  assert.equal(metadata.responseWorkspaceId, "response_workspace:venue-pass");
  assert.equal(metadata.sourceResponseId, "afp:message-1");
  assert.equal(metadata.artifactKind, "vendor_table");
  assert.equal(metadata.privacyScope, "shared_partner");
  assert.equal(metadata.approvalState, "pending_user_approval");
  assert.ok(metadata.supertags.includes("wedding_artifact:vendor_table"));
  assert.ok(metadata.supertags.includes("wedding_vendor:venue"));
  assert.equal(metadata.supertags.filter((tag) => tag === "wedding_vendor:venue").length, 1);
});

test("normalizeWeddingPlanningMetadata falls back from unknown enum fields", () => {
  const metadata = normalizeWeddingPlanningMetadata({
    artifactKind: "unknown_kind",
    privacyScope: "public",
    approvalState: "published",
  });

  assert.equal(metadata.artifactKind, null);
  assert.equal(metadata.privacyScope, "private");
  assert.equal(metadata.approvalState, "draft");
});

test("wedding IDs and labels are stable and migration-friendly", () => {
  assert.equal(safeWeddingLabel("Harbour Wedding! 2027"), "harbour-wedding-2027");
  assert.equal(weddingPlanIdFromSeed("Harbour Wedding! 2027"), "wedding_plan:harbour-wedding-2027");
  assert.equal(weddingPlanIdFromSeed("wedding_plan:existing"), "wedding_plan:existing");
  assert.equal(
    weddingResponseWorkspaceIdFromSeed("venue research", "wedding_plan:harbour"),
    "response_workspace:venue-research",
  );
  assert.equal(
    weddingResponseWorkspaceIdFromSeed("", "wedding_plan:harbour"),
    "response_workspace:harbour",
  );
});
