import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  weddingRunSheetGrantState,
  weddingRunSheetProtectedLink,
  type WeddingRunSheetShareGrant,
} from "../src/lib/weddingRunSheetShareApi.ts";

function grant(overrides: Partial<WeddingRunSheetShareGrant> = {}): WeddingRunSheetShareGrant {
  return {
    grant_id: "grant-1", database_id: "database:runsheet", wedding_plan_id: "plan-1",
    view_id: "wedding-runsheet-vendor", view_revision: 1, recipient_role: "vendor",
    recipient_label: "Venue manager", record_ids: ["row-1"], signoff_required: true,
    signoff_due_at: "2027-11-10T00:00:00Z", expires_at: "2027-11-12T00:00:00Z",
    view_count: 0, created_at: "2027-11-01T00:00:00Z", ...overrides,
  };
}

test("protected links keep the capability in the URL fragment", () => {
  const link = weddingRunSheetProtectedLink("secret-capability", "https://omnyid.com");
  assert.equal(link, "https://omnyid.com/workspace/runsheet-share.html#secret-capability");
  assert.equal(new URL(link).search, "");
});

test("grant projection distinguishes expiry, revocation and vendor responses", () => {
  const beforeExpiry = Date.parse("2027-11-11T00:00:00Z");
  assert.equal(weddingRunSheetGrantState(grant(), beforeExpiry), "awaiting_signoff");
  assert.equal(weddingRunSheetGrantState(grant({ acknowledgement: { acknowledgement_id: "ack-1", status: "acknowledged", actor_label: "Venue", created_at: "2027-11-09T00:00:00Z" } }), beforeExpiry), "acknowledged");
  assert.equal(weddingRunSheetGrantState(grant({ acknowledgement: { acknowledgement_id: "ack-2", status: "changes_requested", actor_label: "Venue", created_at: "2027-11-09T00:00:00Z" } }), beforeExpiry), "changes_requested");
  assert.equal(weddingRunSheetGrantState(grant(), Date.parse("2027-11-13T00:00:00Z")), "expired");
  assert.equal(weddingRunSheetGrantState(grant({ revoked_at: "2027-11-08T00:00:00Z" }), beforeExpiry), "revoked");
});

test("hosted share UI is explicit, false-default and token-safe", async () => {
  const owner = await readFile(new URL("../src/components/WeddingRunSheetShareControls.tsx", import.meta.url), "utf8");
  const publicPage = await readFile(new URL("../runsheet-share.html", import.meta.url), "utf8");
  const publicApp = await readFile(new URL("../src/runsheet-share.tsx", import.meta.url), "utf8");
  const printCss = await readFile(new URL("../src/components/weddingRunSheetPrint.css", import.meta.url), "utf8");
  assert.match(owner, /Hosted sharing is off by default/);
  assert.match(owner, /does not email or message anyone/);
  assert.match(owner, /Confirm revoke/);
  assert.match(owner, /downloaded or printed copies cannot be recalled/i);
  assert.match(publicPage, /no-referrer/);
  assert.match(publicPage, /noindex,nofollow,noarchive/);
  assert.match(publicApp, /history\.replaceState/);
  assert.match(printCss, /table-header-group/);
  assert.match(printCss, /break-inside:\s*avoid-page/);
  assert.match(printCss, /A4 landscape/);
  assert.match(publicApp, /Acknowledge final run sheet/);
});
