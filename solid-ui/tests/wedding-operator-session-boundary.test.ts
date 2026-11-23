import assert from "node:assert/strict";
import test from "node:test";

import { parseAuthApiResponse } from "../src/lib/authResponseState.ts";

const user = {
  id: "user-operator",
  email: "admin@omnyid.com",
  display_name: "Operator",
  auth_provider: "password",
};

test("operator presentation follows the server session flag instead of an email literal", () => {
  const allowed = parseAuthApiResponse({ user: { ...user, operator: true } });
  const ordinary = parseAuthApiResponse({ user: { ...user, operator: false } });

  assert.equal(allowed.user?.operator, true);
  assert.equal(ordinary.user?.operator, false);
});

test("missing operator authority fails closed", () => {
  const response = parseAuthApiResponse({ user });
  assert.equal(response.user?.operator, false);
});
