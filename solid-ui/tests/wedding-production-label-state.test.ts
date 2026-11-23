import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanWeddingProductionLabel,
  cleanWeddingProductionLabels,
  durableWeddingProductionProofLabels,
  hasDurableWeddingProductionProofLabel,
  isWeakWeddingProductionProofReference,
  joinWeddingProductionLabels,
} from "@/lib/weddingProductionLabelState";

test("wedding production labels trim collapse dedupe and drop blanks", () => {
  assert.deepEqual(
    cleanWeddingProductionLabels([
      "  Actual connected provider send verified  ",
      "Actual   connected provider send verified",
      "",
      null,
      undefined,
      "Provider executor proof is missing.",
    ]),
    [
      "Actual connected provider send verified",
      "Provider executor proof is missing.",
    ],
  );
});

test("wedding production labels cap long operational and word-aware UI labels", () => {
  const label = `Actual connected provider send verified ${"receipt ".repeat(40)}`;
  const operational = cleanWeddingProductionLabel(label);
  const ui = cleanWeddingProductionLabel(label, { maxLength: 80, wordAware: true });

  assert.equal(operational?.length, 240);
  assert.ok(operational?.endsWith("..."));
  assert.ok((ui?.length ?? 0) <= 80);
  assert.ok(ui?.endsWith("..."));
  assert.doesNotMatch(ui ?? "", /\bre\.\.\.$/);
});

test("wedding production labels join after cleaning", () => {
  assert.equal(
    joinWeddingProductionLabels([
      "  Server thread proof round-trip has not been verified.  ",
      "Server   thread proof round-trip has not been verified.",
      "Actual connected Gmail/provider send proof is not attached.",
    ]),
    "Server thread proof round-trip has not been verified. Actual connected Gmail/provider send proof is not attached.",
  );
});

test("wedding production proof helpers reject weak local or placeholder references", () => {
  const weakRefs = [
    "vendor-quote:dry-run",
    "approval-ui:example",
    "template:placeholder",
    "graph:mock",
    "seed:stub",
    "run:test-proof",
    "...",
    "receipt:local-proof",
    "draft:approval-proof",
    "display:template-proof",
    "Actual connected provider send verified: placeholder-gmail-message",
    "workspace:local-only",
    "http://localhost:5173/proof",
    "http://127.0.0.1/proof",
    "file:///tmp/proof.json",
    "blob:https://omnyid.example/proof",
    "data:application/json,{}",
  ];

  for (const ref of weakRefs) {
    assert.equal(isWeakWeddingProductionProofReference(ref), true, ref);
  }

  assert.deepEqual(
    durableWeddingProductionProofLabels([
      ...weakRefs,
      "vendor-quote-provider:gmail-message-123",
      "https://ops.omnyid.com/proofs/wedding/proof-123",
    ]),
    [
      "vendor-quote-provider:gmail-message-123",
      "https://ops.omnyid.com/proofs/wedding/proof-123",
    ],
  );
  assert.equal(hasDurableWeddingProductionProofLabel(weakRefs), false);
  assert.equal(hasDurableWeddingProductionProofLabel(["oracle:release-proof-123"]), true);
});
