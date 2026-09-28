import assert from "node:assert/strict";
import test from "node:test";

import {
  supportAccessBoundaryCardState,
  supportAccessBoundaryEndAt,
  supportAccessExpiresAt,
  supportAccessGrantedAt,
  supportAccessReason,
  supportAccessRevokedAt,
  supportAccessScope,
  supportAccessStatus,
  supportAccessSupportPostureLabel,
} from "../src/lib/supportAccessState.ts";

test("support access selectors provide stable fallbacks", () => {
  assert.equal(supportAccessStatus(null), "disabled");
  assert.equal(supportAccessScope(null), "none");
  assert.equal(supportAccessReason(null), null);
  assert.equal(supportAccessSupportPostureLabel(null), "disabled by default");
  assert.equal(supportAccessGrantedAt(null), null);
  assert.equal(supportAccessExpiresAt(null), null);
  assert.equal(supportAccessRevokedAt(null), null);
  assert.equal(supportAccessBoundaryEndAt(null), null);
  assert.deepEqual(supportAccessBoundaryCardState(null), {
    reason: null,
    supportPostureLine: "Support posture: disabled by default",
  });
});

test("support access selectors expose bounded consent state", () => {
  const supportAccess = {
    status: "granted",
    access_scope: "runtime_recovery",
    reason: "Operator review",
    support_disabled_by_default: false,
    granted_at: "2026-08-14T07:00:00Z",
    expires_at: "2026-08-14T09:00:00Z",
    revoked_at: "2026-08-14T08:00:00Z",
  };

  assert.equal(supportAccessStatus(supportAccess), "granted");
  assert.equal(supportAccessScope(supportAccess), "runtime_recovery");
  assert.equal(supportAccessReason(supportAccess), "Operator review");
  assert.equal(supportAccessSupportPostureLabel(supportAccess), "customized");
  assert.equal(supportAccessGrantedAt(supportAccess), "2026-08-14T07:00:00Z");
  assert.equal(supportAccessExpiresAt(supportAccess), "2026-08-14T09:00:00Z");
  assert.equal(supportAccessRevokedAt(supportAccess), "2026-08-14T08:00:00Z");
  assert.equal(supportAccessBoundaryEndAt(supportAccess), "2026-08-14T08:00:00Z");
  assert.deepEqual(supportAccessBoundaryCardState(supportAccess), {
    reason: "Operator review",
    supportPostureLine: "Support posture: customized",
  });
});
