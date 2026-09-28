import test from "node:test";
import assert from "node:assert/strict";

import { operationalApprovalPendingReason } from "../src/lib/operationalApprovalCopy.ts";

test("operational approval copy uses shared pending approval wording", () => {
  assert.equal(
    operationalApprovalPendingReason(),
    "Awaiting your approval",
  );
  assert.equal(
    operationalApprovalPendingReason("file access"),
    "Awaiting your approval for file access",
  );
  assert.equal(
    operationalApprovalPendingReason("this browser step"),
    "Awaiting your approval for this browser step",
  );
});
