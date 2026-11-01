import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildWeddingBoundaryState, type WeddingBoundaryChangeRequest } from "../src/lib/weddingBoundaryLedgerState.ts";

function request(requestId: string, requestStatus: WeddingBoundaryChangeRequest["requestStatus"], revision = 1): WeddingBoundaryChangeRequest {
  return {
    id: requestId,
    kind: "wedding_boundary_change_request",
    title: `Request ${requestId}`,
    requestId,
    requestedBy: "family:mum",
    changeType: "add_guest",
    requestStatus,
    approvalRequired: requestStatus === "pending" || requestStatus === "partially_approved",
    revision,
    metadata: { source_surface: "wedding_boundary_management" },
  };
}

test("drafts remain in the canonical request projection but out of the decision queue", () => {
  const state = buildWeddingBoundaryState({
    metadata: { wedding_plan_id: "plan:one", response_workspace_id: "workspace:one" },
    objects: [request("draft", "draft"), request("pending", "pending"), request("withdrawn", "withdrawn", 2)],
  });
  assert.deepEqual(state.requestObjects.map((item) => item.requestId), ["draft", "pending", "withdrawn"]);
  assert.deepEqual(state.approvalQueue.map((item) => item.requestId), ["pending"]);
});

test("the couple surface describes submit and withdraw consequences explicitly", () => {
  const source = readFileSync(new URL("../src/components/WeddingBoundaryRequestLifecyclePanel.tsx", import.meta.url), "utf8");
  assert.match(source, /Submit for review/);
  assert.match(source, /Withdraw draft/);
  assert.match(source, /Confirm withdrawal/);
  assert.match(source, /role="alertdialog"/);
  assert.match(source, /does not enter the decision queue or change the guest list/);
});

test("the authenticated API uses the dedicated request transition route", () => {
  const source = readFileSync(new URL("../src/lib/weddingBoundaryGovernanceApi.ts", import.meta.url), "utf8");
  assert.match(source, /\/wedding\/boundaries\/requests\/transitions/);
  assert.match(source, /operation: "submit" \| "withdraw"/);
  assert.match(source, /expected_revision/);
  assert.match(source, /idempotency_key/);
});
