import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingCollaborationLifecycleProjectionProofState } from "@/lib/weddingCollaborationLifecycleProjectionProofState";

test("collaboration lifecycle projection proof passes only with every guarded action", () => {
  const state = buildWeddingCollaborationLifecycleProjectionProofState({
    projectedKinds: ["invite", "expire", "revoke", "review"],
    guardedAccessControlProjection: true,
    sharedEditingDisabledByDefault: true,
    backendGrantBlockedWithoutAcl: true,
    searchableAfpRecords: true,
    proofRef: "collaboration-lifecycle:prod",
  });

  assert.equal(state.productionEvidenceReady, true);
  assert.equal(state.status, "ready");
  assert.equal(state.blockerLabels.length, 0);
  assert.ok(state.evidenceLabels.includes("stale-access review projection covered"));
  assert.equal(state.proofReferenceLabel, "collaboration lifecycle proof: collaboration-lifecycle:prod");
});

test("collaboration lifecycle projection proof can require durable proof reference", () => {
  const missing = buildWeddingCollaborationLifecycleProjectionProofState({
    projectedKinds: ["invite", "expire", "revoke", "review"],
    guardedAccessControlProjection: true,
    sharedEditingDisabledByDefault: true,
    backendGrantBlockedWithoutAcl: true,
    searchableAfpRecords: true,
    proofReferencePolicy: "required",
  });
  const local = buildWeddingCollaborationLifecycleProjectionProofState({
    projectedKinds: ["invite", "expire", "revoke", "review"],
    guardedAccessControlProjection: true,
    sharedEditingDisabledByDefault: true,
    backendGrantBlockedWithoutAcl: true,
    searchableAfpRecords: true,
    proofRef: "http://localhost:8787/collaboration-proof",
    proofReferencePolicy: "required",
  });

  assert.equal(missing.productionEvidenceReady, false);
  assert.ok(missing.blockerLabels.some((label) => /proof reference is not mounted/i.test(label)));
  assert.equal(local.productionEvidenceReady, false);
  assert.equal(local.proofReferenceLabel, null);
  assert.ok(local.blockerLabels.some((label) => /local, dry-run, placeholder, localhost, or browser-only/i.test(label)));
});

test("collaboration lifecycle projection proof rejects placeholder proof references", () => {
  for (const proofRef of [
    "...",
    "http://audit.omnyid.com/collaboration-proof",
    "http://127.0.0.1:8787/collaboration-proof",
    "https://0.0.0.0/collaboration-proof",
    "https://[::1]/collaboration-proof",
    "file:///tmp/collaboration-proof.json",
    "blob:https://app.example/collaboration-proof",
    "data:application/json,{}",
    "test:collaboration-lifecycle",
    "dry-run:collaboration-lifecycle",
    "placeholder:latest",
    "collaboration-lifecycle:fake:latest",
    "collaboration-lifecycle:mock:latest",
  ]) {
    const state = buildWeddingCollaborationLifecycleProjectionProofState({
      projectedKinds: ["invite", "expire", "revoke", "review"],
      guardedAccessControlProjection: true,
      sharedEditingDisabledByDefault: true,
      backendGrantBlockedWithoutAcl: true,
      searchableAfpRecords: true,
      proofRef,
      proofReferencePolicy: "required",
    });

    assert.equal(state.productionEvidenceReady, false, proofRef);
    assert.equal(state.status, "blocked", proofRef);
    assert.equal(state.proofReferenceLabel, null, proofRef);
    assert.ok(
      state.blockerLabels.some((label) => /remote HTTPS proof link/i.test(label)),
      proofRef,
    );
  }
});

test("collaboration lifecycle projection proof rejects test proof tokens but allows smoke receipts", () => {
  const blocked = buildWeddingCollaborationLifecycleProjectionProofState({
    projectedKinds: ["invite", "expire", "revoke", "review"],
    guardedAccessControlProjection: true,
    sharedEditingDisabledByDefault: true,
    backendGrantBlockedWithoutAcl: true,
    searchableAfpRecords: true,
    proofRef: "collaboration-lifecycle:test:latest",
    proofReferencePolicy: "required",
  });
  const ready = buildWeddingCollaborationLifecycleProjectionProofState({
    projectedKinds: ["invite", "expire", "revoke", "review"],
    guardedAccessControlProjection: true,
    sharedEditingDisabledByDefault: true,
    backendGrantBlockedWithoutAcl: true,
    searchableAfpRecords: true,
    proofRef: "collaboration-lifecycle:prod-smoke:2026-09-28",
    proofReferencePolicy: "required",
  });

  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.proofReferenceLabel, null);
  assert.equal(ready.status, "ready");
  assert.equal(
    ready.proofReferenceLabel,
    "collaboration lifecycle proof: collaboration-lifecycle:prod-smoke:2026-09-28",
  );
});

test("collaboration lifecycle projection proof bounds durable proof labels", () => {
  const proofRef = `collaboration-lifecycle:oracle-prod:${"proof-".repeat(60)}`;
  const state = buildWeddingCollaborationLifecycleProjectionProofState({
    projectedKinds: ["invite", "expire", "revoke", "review"],
    guardedAccessControlProjection: true,
    sharedEditingDisabledByDefault: true,
    backendGrantBlockedWithoutAcl: true,
    searchableAfpRecords: true,
    proofRef,
    proofReferencePolicy: "required",
  });

  assert.equal(state.productionEvidenceReady, true);
  assert.equal(state.status, "ready");
  assert.ok(state.evidenceLabels.every((label) => label.length <= 240));
  assert.ok(state.proofReferenceLabel?.startsWith("collaboration lifecycle proof: collaboration-lifecycle:oracle-prod"));
  assert.ok(state.proofReferenceLabel?.endsWith("..."));
  assert.ok((state.proofReferenceLabel ?? "").length <= 240);
  assert.ok(state.evidenceLabels.includes(state.proofReferenceLabel ?? ""));
});

test("collaboration lifecycle projection proof fails closed on partial action coverage", () => {
  const state = buildWeddingCollaborationLifecycleProjectionProofState({
    projectedKinds: ["invite", "review"],
    guardedAccessControlProjection: true,
    sharedEditingDisabledByDefault: true,
  });

  assert.equal(state.productionEvidenceReady, false);
  assert.equal(state.status, "blocked");
  assert.deepEqual(state.missingKindLabels, ["expiry", "revocation"]);
  assert.ok(state.blockerLabels.includes("Backend grant-blocked-without-ACL proof is missing."));
  assert.ok(state.summary.includes("fail-closed"));
});
