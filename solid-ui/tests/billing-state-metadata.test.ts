import test from "node:test";
import assert from "node:assert/strict";

import { hasRecognizedBillingStatus, hasRecognizedQuotaState } from "../src/lib/billingStateMetadata.ts";

test("hasRecognizedBillingStatus only accepts supported billing lifecycle values", () => {
  assert.equal(hasRecognizedBillingStatus("active"), true);
  assert.equal(hasRecognizedBillingStatus(" past_due "), true);
  assert.equal(hasRecognizedBillingStatus("trialing"), false);
  assert.equal(hasRecognizedBillingStatus(""), false);
});

test("hasRecognizedQuotaState only accepts supported storage quota values", () => {
  assert.equal(hasRecognizedQuotaState("ok"), true);
  assert.equal(hasRecognizedQuotaState(" EXCEEDED "), true);
  assert.equal(hasRecognizedQuotaState("warning"), false);
  assert.equal(hasRecognizedQuotaState(undefined), false);
});
