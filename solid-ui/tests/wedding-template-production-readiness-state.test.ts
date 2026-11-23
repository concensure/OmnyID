import assert from "node:assert/strict";
import test from "node:test";

import { shouldShowWeddingFirstRunIntake } from "@/lib/weddingFirstRunIntakeGateState";
import { buildWeddingTemplateDeepLinkLaunch } from "@/lib/weddingTemplateDeepLinkLaunchState";
import { buildWeddingTemplateLaunchState } from "@/lib/weddingTemplateLaunchState";
import { buildWeddingTemplateProductionReadinessState } from "@/lib/weddingTemplateProductionReadinessState";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test("wedding template production readiness passes complete launch and intake proof", () => {
  for (const proofRef of [
    "wedding-template-launch:oracle-prod-1:2026-09-28",
    "https://oracle.omnyid.com/proofs/wedding-template-launch/2026-09-28",
  ]) {
    const state = buildWeddingTemplateProductionReadinessState({
      deepLinkLaunch: buildWeddingTemplateDeepLinkLaunch(),
      templateLaunch: buildWeddingTemplateLaunchState({ projectionStorage: memoryStorage() }),
      firstRunIntakeVisible: shouldShowWeddingFirstRunIntake({
        hasTemplateLaunch: true,
        hasPersistedWorkspaceContent: false,
        followUpRequested: false,
      }),
      proofReferencePolicy: "required",
      proofRef,
    });

    assert.equal(state.productionEvidenceReady, true, proofRef);
    assert.equal(state.status, "ready", proofRef);
    assert.deepEqual(state.blockerLabels, [], proofRef);
    assert.ok(state.evidenceLabels.includes("Wedding template deep link opens planning files."), proofRef);
    assert.equal(state.proofReferenceLabel, `Wedding template launch proof: ${proofRef}`);
  }
});

test("wedding template production readiness blocks missing intake and proof reference", () => {
  const state = buildWeddingTemplateProductionReadinessState({
    deepLinkLaunch: buildWeddingTemplateDeepLinkLaunch(),
    templateLaunch: buildWeddingTemplateLaunchState({ projectionStorage: memoryStorage() }),
    firstRunIntakeVisible: false,
    proofReferencePolicy: "required",
  });

  assert.equal(state.productionEvidenceReady, false);
  assert.equal(state.status, "blocked");
  assert.ok(state.blockerLabels.includes(
    "Wedding template first-run intake gate is not proven before generated planning work.",
  ));
  assert.ok(state.blockerLabels.includes("Wedding template launch proof reference is missing."));
  assert.ok(state.nextActionLabels.includes(
    "Prove first-run intake appears before generated planning work for new template launches.",
  ));
});

test("wedding template production readiness rejects local or placeholder proof refs", () => {
  for (const proofRef of [
    "http://localhost:5173/template-proof",
    "http://oracle.omnyid.com/proofs/wedding-template-launch/2026-09-28",
    "http://127.0.0.1:8787/template-proof",
    "https://127.0.0.1/template-proof",
    "https://0.0.0.0/template-proof",
    "https://[::1]/template-proof",
    "file:///tmp/template-proof.json",
    "blob:https://app.example/proof",
    "data:application/json,{}",
    "receipt:local-template",
    "draft:template-proof",
    "display:template-proof",
    "dry-run:template",
    "placeholder:latest",
    "wedding-template-launch:test:2026-09-28",
    "wedding-template-launch:fake:latest",
    "wedding-template-launch:stub:latest",
    "wedding-template-launch:mock:latest",
    "...",
  ]) {
    const state = buildWeddingTemplateProductionReadinessState({
      deepLinkLaunch: buildWeddingTemplateDeepLinkLaunch(),
      templateLaunch: buildWeddingTemplateLaunchState({ projectionStorage: memoryStorage() }),
      firstRunIntakeVisible: true,
      proofReferencePolicy: "required",
      proofRef,
    });

    assert.equal(state.productionEvidenceReady, false, proofRef);
    assert.equal(state.proofReferenceLabel, null, proofRef);
    assert.ok(state.blockerLabels.some((label) =>
      /durable audit ID or remote HTTPS proof link/i.test(label)
    ), proofRef);
  }
});

test("wedding template production readiness blocks invalid launch target and missing guardrails", () => {
  const launch = buildWeddingTemplateLaunchState({ projectionStorage: memoryStorage() });
  const state = buildWeddingTemplateProductionReadinessState({
    deepLinkLaunch: { viewTarget: "email", intent: null },
    templateLaunch: {
      ...launch,
      firstResponsePrompt: "Make a polished plan now.",
      launchLabels: ["Real workspace"],
    },
    firstRunIntakeVisible: true,
  });

  assert.equal(state.productionEvidenceReady, false);
  assert.ok(state.blockerLabels.includes(
    "Wedding template deep link does not open the planning-files workspace target.",
  ));
  assert.ok(state.blockerLabels.includes(
    "Wedding template launch guardrails are incomplete: Need-To-Know, privacy, or no-live-claims copy is missing.",
  ));
});
