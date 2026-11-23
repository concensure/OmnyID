import assert from "node:assert/strict";
import test from "node:test";
import { accountPrefersGeneralAdminWorkspace } from "../src/lib/adminWorkspaceEntryState.ts";

test("only the exact OmnyID admin account suppresses Wedding presentation during OAuth refresh", () => {
  assert.equal(accountPrefersGeneralAdminWorkspace("admin@omnyid.com"), true);
  assert.equal(accountPrefersGeneralAdminWorkspace(" ADMIN@OMNYID.COM "), true);
  for (const email of ["other-admin@omnyid.com", "admin+test@omnyid.com", "admin@example.com", ""]) {
    assert.equal(accountPrefersGeneralAdminWorkspace(email), false);
  }
});
