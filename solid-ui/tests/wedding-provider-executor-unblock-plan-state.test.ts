import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingProviderExecutorSuiteReadinessState } from "@/lib/weddingProviderExecutorSuiteReadinessState";
import { buildWeddingProviderExecutorUnblockPlanState } from "@/lib/weddingProviderExecutorUnblockPlanState";

test("provider executor unblock plan turns missing proof into concrete setup steps", () => {
  const suite = buildWeddingProviderExecutorSuiteReadinessState({ providers: [] });
  const plan = buildWeddingProviderExecutorUnblockPlanState(suite);

  assert.equal(plan.status, "blocked");
  assert.match(plan.summary, /credentials, executor handlers, smoke tests/i);
  assert.equal(plan.nextStep?.kind, "connect_credentials");
  assert.equal(plan.nextStep?.capability, "email");
  assert.equal(plan.nextStep?.setupSurface, "email");
  assert.ok(plan.steps.some((step) => step.capability === "vendor_search" && step.kind === "build_executor"));
  assert.ok(plan.steps.some((step) => step.capability === "calendar" && step.kind === "run_smoke_test"));
  assert.ok(plan.steps.some((step) => (
    step.capability === "vendor_search" &&
    step.kind === "connect_credentials" &&
    step.envHints.includes("OMNYID_GOOGLE_PLACES_API_KEY_FILE")
  )));
  assert.ok(plan.steps.some((step) => (
    step.capability === "vendor_search" &&
    step.kind === "run_smoke_test" &&
    /bounded test query/i.test(step.detail) &&
    step.proofHints.includes("source URL count")
  )));
  assert.ok(plan.steps.some((step) => (
    step.kind === "attach_receipts" &&
    step.setupSurface === "provider_executor_registry" &&
    step.proofHints.includes("wedding production-readiness evidence adapter")
  )));
  assert.ok(plan.productionChecklist.some((item) => /user approval required/i.test(item)));
});

test("provider executor unblock plan separates stale credentials from missing executor work", () => {
  const suite = buildWeddingProviderExecutorSuiteReadinessState({
    requiredCapabilities: ["email", "calendar"],
    providers: [
      { capability: "email", credentialStatus: "stale", executorStatus: "available", productionReady: false } as any,
      { capability: "calendar", credentialStatus: "connected", executorStatus: "missing", productionReady: false } as any,
    ],
  });
  const plan = buildWeddingProviderExecutorUnblockPlanState(suite);

  assert.ok(plan.steps.some((step) => step.capability === "email" && step.kind === "connect_credentials"));
  assert.ok(!plan.steps.some((step) => step.capability === "email" && step.kind === "build_executor"));
  assert.ok(plan.steps.some((step) => step.capability === "calendar" && step.kind === "build_executor"));
  assert.ok(plan.steps.some((step) => (
    step.capability === "calendar" &&
    step.kind === "build_executor" &&
    step.setupSurface === "provider_executor_registry" &&
    step.proofHints.includes("external event id or provider receipt")
  )));
  assert.ok(!plan.steps.some((step) => step.capability === "calendar" && step.kind === "connect_credentials"));
});

test("provider executor unblock plan reports ready state without fake blocker work", () => {
  const suite = buildWeddingProviderExecutorSuiteReadinessState({
    requiredCapabilities: ["vendor_search"],
    providers: [
      { capability: "vendor_search", credentialStatus: "connected", executorStatus: "available", productionReady: true } as any,
    ],
  });
  const plan = buildWeddingProviderExecutorUnblockPlanState(suite);

  assert.equal(plan.status, "ready");
  assert.equal(plan.nextStep, null);
  assert.equal(plan.steps[0]?.kind, "ready");
  assert.match(plan.summary, /ready for approved production use/i);
});
