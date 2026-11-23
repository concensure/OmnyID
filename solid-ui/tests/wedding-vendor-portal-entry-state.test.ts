import assert from "node:assert/strict";
import test from "node:test";

import { vendorPortalWorkspaceRedirect } from "../src/lib/vendorPortalEntryState.ts";

test("the named OmnyID admin account enters the existing main Workspace", () => {
  assert.equal(vendorPortalWorkspaceRedirect({ user: { email: "admin@omnyid.com" } }), "/workspace/");
  assert.equal(vendorPortalWorkspaceRedirect({ user: { email: " ADMIN@OMNYID.COM " } }), "/workspace/");
});

test("vendor portal routing does not infer admin authority from lookalike addresses", () => {
  for (const email of ["admin@example.com", "other-admin@omnyid.com", "user+admin@omnyid.com", "vendor@omnyid.com", ""]) {
    assert.equal(vendorPortalWorkspaceRedirect({ user: { email } }), null);
  }
  assert.equal(vendorPortalWorkspaceRedirect(null), null);
});
