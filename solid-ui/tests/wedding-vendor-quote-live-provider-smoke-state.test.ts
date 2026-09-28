// @locs-version: 1.0
import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingVendorQuoteLiveProviderSmokeState } from "@/lib/weddingVendorQuoteLiveProviderSmokeState";

const record = {
  schema_version: 1,
  verification_kind: "omnyid_live_gmail_provider_send",
  ok: true,
  from: "admin@omnyid.com",
  to: "hello@chloes.example",
  subject: "Floral quote",
  thread_id: "wedding-vendor-quote-plan-1-workspace-1-chloes-florals",
  status_route: "/integrations/gmail/status",
  send_route: "/integrations/gmail/send-draft",
  provider: "gmail",
  provider_message_id: "gmail-message-quote-123",
  client_message_id: "local-gmail-quote-123",
  actual_connected_provider_proof_ref: "gmail:prod-smoke:2026-09-27:gmail-message-quote-123",
  verified_at: "2026-09-27T10:00:00.000Z",
};

const output = [
  "LIVE_GMAIL_PROVIDER_SEND_CONFIRMED",
  "provider_message_id=gmail-message-quote-123",
  "actual_connected_provider_proof_ref=gmail:prod-smoke:2026-09-27:gmail-message-quote-123",
  `verification_record_json=${JSON.stringify(record)}`,
].join("\n");

const expected = {
  expectedProviderReceiptId: "gmail-message-quote-123",
  expectedSender: "admin@omnyid.com",
  expectedRecipient: "hello@chloes.example",
  expectedSubject: "Floral quote",
  expectedThreadId: "wedding-vendor-quote-plan-1-workspace-1-chloes-florals",
};

test("vendor quote live provider smoke state accepts structured Gmail output with exact expectations", () => {
  const state = buildWeddingVendorQuoteLiveProviderSmokeState({
    output,
    ...expected,
  });

  assert.equal(state.status, "ready");
  assert.equal(state.ready, true);
  assert.equal(state.providerMessageId, "gmail-message-quote-123");
  assert.equal(state.proofRef, "gmail:prod-smoke:2026-09-27:gmail-message-quote-123");
  assert.equal(state.senderLabel, "Connected Gmail account: admin@omnyid.com");
  assert.equal(state.recipientLabel, "Verified recipient: hello@chloes.example");
  assert.equal(state.subjectLabel, "Verified subject: Floral quote");
  assert.equal(state.threadLabel, "Verified vendor thread: wedding-vendor-quote-plan-1-workspace-1-chloes-florals");
  assert.equal(state.verifiedAtLabel, "Verified at: 2026-09-27T10:00:00.000Z");
  assert.equal(state.telemetryEvent, null);
  assert.deepEqual(state.blockerLabels, []);
  assert.ok(state.evidenceLabels.some((label) => /Live Gmail smoke send verified/i.test(label)));
  assert.ok(state.evidenceLabels.includes("Connected Gmail account: admin@omnyid.com"));
  assert.ok(state.evidenceLabels.includes("Verified recipient: hello@chloes.example"));
  assert.ok(state.evidenceLabels.includes("Verified vendor thread: wedding-vendor-quote-plan-1-workspace-1-chloes-florals"));
});

test("vendor quote live provider smoke state accepts a connected Gmail sender distinct from the app user", () => {
  const connectedRecord = {
    ...record,
    from: "concensure@gmail.com",
    provider_message_id: "gmail-message-concensure-123",
    actual_connected_provider_proof_ref: "gmail:prod-smoke:2026-09-27:gmail-message-concensure-123",
  };
  const state = buildWeddingVendorQuoteLiveProviderSmokeState({
    output: [
      "LIVE_GMAIL_PROVIDER_SEND_CONFIRMED",
      "from=concensure@gmail.com",
      "provider_message_id=gmail-message-concensure-123",
      "actual_connected_provider_proof_ref=gmail:prod-smoke:2026-09-27:gmail-message-concensure-123",
      `verification_record_json=${JSON.stringify(connectedRecord)}`,
    ].join("\n"),
    ...expected,
    expectedProviderReceiptId: "gmail-message-concensure-123",
    expectedSender: "concensure@gmail.com",
  });

  assert.equal(state.status, "ready");
  assert.equal(state.ready, true);
  assert.equal(state.providerMessageId, "gmail-message-concensure-123");
  assert.equal(state.senderLabel, "Connected Gmail account: concensure@gmail.com");
  assert.ok(state.evidenceLabels.includes("Connected Gmail account: concensure@gmail.com"));
  assert.ok(!state.evidenceLabels.includes("Connected Gmail account: admin@omnyid.com"));
});

test("vendor quote live provider smoke state requires release expectations", () => {
  const state = buildWeddingVendorQuoteLiveProviderSmokeState({ output });

  assert.equal(state.status, "missing_expectations");
  assert.equal(state.ready, false);
  assert.equal(state.telemetryEvent, "wedding_vendor_quote_live_provider_smoke_missing_expectations");
  assert.match(state.blockerLabels.join(" "), /provider receipt id/i);
  assert.match(state.blockerLabels.join(" "), /smoke-test sender/i);
  assert.match(state.blockerLabels.join(" "), /vendor recipient/i);
  assert.match(state.blockerLabels.join(" "), /approved subject/i);
  assert.match(state.blockerLabels.join(" "), /thread id/i);
});

test("vendor quote live provider smoke state rejects missing or malformed output", () => {
  const missing = buildWeddingVendorQuoteLiveProviderSmokeState({ ...expected });
  const malformed = buildWeddingVendorQuoteLiveProviderSmokeState({
    ...expected,
    output: "verification_record_json={bad-json",
  });

  assert.equal(missing.status, "missing_output");
  assert.equal(missing.senderLabel, null);
  assert.equal(missing.recipientLabel, null);
  assert.equal(missing.threadLabel, null);
  assert.equal(missing.telemetryEvent, "wedding_vendor_quote_live_provider_smoke_missing_output");
  assert.equal(malformed.status, "invalid_output");
  assert.equal(malformed.telemetryEvent, "wedding_vendor_quote_live_provider_smoke_invalid_output");
  assert.match(malformed.blockerLabels.join(" "), /could not be parsed/i);
});

test("vendor quote live provider smoke state rejects duplicate structured records", () => {
  const state = buildWeddingVendorQuoteLiveProviderSmokeState({
    ...expected,
    output: [
      output,
      `verification_record_json=${JSON.stringify({
        ...record,
        provider_message_id: "other-gmail-message",
      })}`,
    ].join("\n"),
  });

  assert.equal(state.status, "invalid_output");
  assert.equal(state.ready, false);
  assert.equal(state.verificationRecord, null);
  assert.equal(state.telemetryEvent, "wedding_vendor_quote_live_provider_smoke_invalid_output");
  assert.ok(
    state.blockerLabels.includes(
      "Live Gmail provider verification output contains multiple verification_record_json lines.",
    ),
  );
});

test("vendor quote live provider smoke state rejects delivery mismatches", () => {
  const state = buildWeddingVendorQuoteLiveProviderSmokeState({
    output,
    ...expected,
    expectedRecipient: "wrong@example.com",
  });

  assert.equal(state.status, "record_blocked");
  assert.equal(state.ready, false);
  assert.equal(state.providerMessageId, "gmail-message-quote-123");
  assert.equal(state.proofRef, "gmail:prod-smoke:2026-09-27:gmail-message-quote-123");
  assert.equal(state.telemetryEvent, "wedding_vendor_quote_live_provider_smoke_record_blocked");
  assert.ok(
    state.blockerLabels.includes(
      "Live Gmail provider verification record recipient does not match the approved vendor email.",
    ),
  );
});

test("vendor quote live provider smoke state rejects wrong connected sender", () => {
  const state = buildWeddingVendorQuoteLiveProviderSmokeState({
    output,
    ...expected,
    expectedSender: "planner@omnyid.com",
  });

  assert.equal(state.status, "record_blocked");
  assert.equal(state.ready, false);
  assert.equal(state.senderLabel, "Connected Gmail account: admin@omnyid.com");
  assert.equal(state.recipientLabel, "Verified recipient: hello@chloes.example");
  assert.equal(state.threadLabel, "Verified vendor thread: wedding-vendor-quote-plan-1-workspace-1-chloes-florals");
  assert.ok(
    state.blockerLabels.includes(
      "Live Gmail provider verification record sender does not match the expected connected Gmail account.",
    ),
  );
});

test("vendor quote live provider smoke state bounds long record labels", () => {
  const longThread = `wedding-vendor-quote-${"very-long-thread-".repeat(20)}`;
  const state = buildWeddingVendorQuoteLiveProviderSmokeState({
    output: [
      "LIVE_GMAIL_PROVIDER_SEND_CONFIRMED",
      `verification_record_json=${JSON.stringify({
        ...record,
        thread_id: longThread,
      })}`,
    ].join("\n"),
    ...expected,
    expectedThreadId: longThread,
  });

  assert.equal(state.ready, true);
  assert.ok(state.threadLabel?.startsWith("Verified vendor thread: wedding-vendor-quote-very-long-thread-"));
  assert.ok(state.threadLabel?.endsWith("..."));
  assert.ok((state.threadLabel ?? "").length <= 180);
});

test("vendor quote live provider smoke state bounds long evidence labels", () => {
  const longProviderMessageId = `gmail-message-quote-${"receipt-".repeat(40)}`;
  const longProofRef = `gmail:prod-smoke:2026-09-27:${longProviderMessageId}:${"proof-".repeat(40)}`;
  const longRecord = {
    ...record,
    provider_message_id: longProviderMessageId,
    actual_connected_provider_proof_ref: longProofRef,
  };
  const state = buildWeddingVendorQuoteLiveProviderSmokeState({
    output: [
      "LIVE_GMAIL_PROVIDER_SEND_CONFIRMED",
      `verification_record_json=${JSON.stringify(longRecord)}`,
    ].join("\n"),
    ...expected,
    expectedProviderReceiptId: longProviderMessageId,
  });

  assert.equal(state.ready, true);
  assert.ok(state.evidenceLabels.every((label) => label.length <= 180));
  assert.ok(state.evidenceLabels.some((label) => label.startsWith("Live Gmail smoke send verified: gmail:prod-smoke")));
  assert.ok(state.evidenceLabels.some((label) => label.endsWith("...")));
});
