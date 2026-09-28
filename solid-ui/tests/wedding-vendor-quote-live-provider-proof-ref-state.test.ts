// @locs-version: 1.0
import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingVendorQuoteLiveProviderProofRefState } from "@/lib/weddingVendorQuoteLiveProviderProofRefState";

test("live provider proof ref stays blocked until an actual connected send is verified", () => {
  const state = buildWeddingVendorQuoteLiveProviderProofRefState({
    verified: false,
    proofRef: "gmail:prod-smoke:2026-09-27:gmail-message-123",
  });

  assert.equal(state.ready, false);
  assert.equal(state.proofRef, "gmail:prod-smoke:2026-09-27:gmail-message-123");
  assert.equal(state.evidenceLabel, null);
  assert.equal(state.blockerLabel, "Actual connected Gmail/provider send has not been verified.");
});

test("live provider proof ref requires an attached durable proof reference", () => {
  const state = buildWeddingVendorQuoteLiveProviderProofRefState({
    verified: true,
    proofRef: "   ",
  });

  assert.equal(state.ready, false);
  assert.equal(state.proofRef, null);
  assert.equal(state.blockerLabel, "Actual connected Gmail/provider send proof is not attached.");
});

test("live provider proof ref rejects local, dry-run, and browser-only references", () => {
  const invalidRefs = [
    "local:gmail-message-123",
    "receipt:gmail-message-123",
    "draft:gmail-message-123",
    "display:gmail-message-123",
    "omnyid:wedding_provider_dry_run:email",
    "provider:wedding_provider_dry_run:gmail-message-123",
    "http://localhost:5173/proof/gmail-message-123",
    "http://audit.omnyid.example/proof/gmail-message-123",
    "https://127.0.0.1/proof/gmail-message-123",
    "https://0.0.0.0/proof/gmail-message-123",
    "https://[::1]/proof/gmail-message-123",
    "file:///tmp/gmail-message-123.json",
    "blob:https://app.example/proof/gmail-message-123",
    "data:application/json,{}",
  ];

  for (const proofRef of invalidRefs) {
    const state = buildWeddingVendorQuoteLiveProviderProofRefState({
      verified: true,
      proofRef,
    });

    assert.equal(state.ready, false, proofRef);
    assert.equal(state.proofRef, null, proofRef);
    assert.match(state.blockerLabel ?? "", /durable provider\/audit ID|dry-run|localhost|browser-only/i, proofRef);
  }
});

test("live provider proof ref accepts durable provider ids and remote https audit links", () => {
  const validRefs = [
    "gmail:prod-smoke:2026-09-27:gmail-message-123",
    "provider:gmail:gmail-message-123",
    "audit:wedding:vendor-quote:gmail-message-123",
    "https://audit.omnyid.example/proof/gmail-message-123",
  ];

  for (const proofRef of validRefs) {
    const state = buildWeddingVendorQuoteLiveProviderProofRefState({
      verified: true,
      proofRef: ` ${proofRef} `,
    });

    assert.equal(state.ready, true, proofRef);
    assert.equal(state.proofRef, proofRef, proofRef);
    assert.equal(state.evidenceLabel, `Actual connected provider send verified: ${proofRef}`);
    assert.equal(state.blockerLabel, null);
  }
});

test("live provider proof ref bounds the evidence label without changing the durable ref", () => {
  const longProofRef = `gmail:prod-smoke:2026-09-27:${"gmail-message-".repeat(40)}`;
  const state = buildWeddingVendorQuoteLiveProviderProofRefState({
    verified: true,
    proofRef: longProofRef,
  });

  assert.equal(state.ready, true);
  assert.equal(state.proofRef, longProofRef);
  assert.ok(state.evidenceLabel?.startsWith("Actual connected provider send verified: gmail:prod-smoke"));
  assert.ok(state.evidenceLabel?.endsWith("..."));
  assert.ok((state.evidenceLabel ?? "").length <= 240);
});

test("live provider proof ref must match the verified provider receipt when provided", () => {
  const mismatched = buildWeddingVendorQuoteLiveProviderProofRefState({
    verified: true,
    expectedProviderReceiptId: "gmail-message-123",
    proofRef: "gmail:prod-smoke:2026-09-27:gmail-message-999",
  });
  const matched = buildWeddingVendorQuoteLiveProviderProofRefState({
    verified: true,
    expectedProviderReceiptId: "gmail-message-123",
    proofRef: "https://audit.omnyid.example/proof/gmail-message-123",
  });

  assert.equal(mismatched.ready, false);
  assert.equal(mismatched.proofRef, "gmail:prod-smoke:2026-09-27:gmail-message-999");
  assert.equal(
    mismatched.blockerLabel,
    "Actual connected Gmail/provider proof reference does not match the verified provider receipt.",
  );
  assert.equal(matched.ready, true);
});
