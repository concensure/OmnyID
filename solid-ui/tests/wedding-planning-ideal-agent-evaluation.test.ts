import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { planningConstraintCaptureUiEnabled } from "../src/lib/planningConstraintCapture.ts";
import { planningConstraintEvaluationUiEnabled } from "../src/lib/planningConstraintEvaluationApi.ts";
import { planningConstraintInterventionUiEnabled } from "../src/lib/planningConstraintInterventionApi.ts";
import { planningCostTradeoffUiEnabled } from "../src/lib/planningCostTradeoffApi.ts";
import { planningMilestoneUiEnabled } from "../src/lib/planningMilestoneApi.ts";
import { planningUnifiedInterventionUiEnabled } from "../src/lib/planningUnifiedInterventionState.ts";
import { planningVendorChangeUiEnabled } from "../src/lib/planningVendorChangeApi.ts";

const root = resolve(process.cwd(), "..");
const manifest = JSON.parse(readFileSync(
  resolve(root, "config/planning_ideal_agent_evaluation_v1.json"),
  "utf8",
)) as {
  scenarios: Array<{ id: string; automated_test_paths: string[] }>;
  human_review_dimensions: string[];
  rollout: {
    default_state: string;
    backend_flags: string[];
    frontend_flags: string[];
    release_blockers: string[];
    stages: Array<{ id: string; requires: string[] }>;
  };
};

test("ideal-agent manifest binds all nine scenarios to real automated evidence", () => {
  assert.equal(manifest.scenarios.length, 9);
  assert.equal(new Set(manifest.scenarios.map((scenario) => scenario.id)).size, 9);
  for (const scenario of manifest.scenarios) {
    assert.ok(scenario.automated_test_paths.length > 0, `${scenario.id} needs automated evidence`);
    for (const path of scenario.automated_test_paths) {
      assert.equal(existsSync(resolve(root, path)), true, `${scenario.id} missing ${path}`);
    }
  }
  assert.deepEqual(manifest.rollout.release_blockers, ["WED-225", "WED-226"]);
  assert.deepEqual(manifest.rollout.stages.map((stage) => stage.id), [
    "dark_package", "synthetic_tenant", "allowlisted_couple", "permissioned_vendor",
  ]);
  assert.ok(manifest.rollout.stages.at(-1)?.requires.includes("mail_provider_gates"));
  assert.equal(manifest.human_review_dimensions.length, 9);
});

test("every planning UI capability remains independently off by default", () => {
  const empty = {};
  assert.equal(planningConstraintCaptureUiEnabled(empty), false);
  assert.equal(planningConstraintEvaluationUiEnabled(empty), false);
  assert.equal(planningCostTradeoffUiEnabled(empty), false);
  assert.equal(planningMilestoneUiEnabled(empty), false);
  assert.equal(planningVendorChangeUiEnabled(empty), false);
  assert.equal(planningConstraintInterventionUiEnabled(empty), false);
  assert.equal(planningUnifiedInterventionUiEnabled(empty), false);
  assert.equal(manifest.rollout.default_state, "dark");
});

test("packaging declares every planning flag false without weakening release blockers", () => {
  const envExample = readFileSync(resolve(root, ".env.example"), "utf8");
  const dockerfile = readFileSync(resolve(root, "solid-ui/Dockerfile"), "utf8");
  const minimalCompose = readFileSync(resolve(root, "docker-compose.oracle.minimal.yml"), "utf8");
  for (const flag of manifest.rollout.backend_flags) {
    assert.match(envExample, new RegExp(`^${flag}=false$`, "m"));
  }
  for (const flag of manifest.rollout.frontend_flags) {
    assert.match(envExample, new RegExp(`^${flag}=false$`, "m"));
    assert.match(dockerfile, new RegExp(`ARG ${flag}="false"`));
    assert.match(minimalCompose, new RegExp(`${flag}: \\$\\{${flag}:-false\\}`));
  }
});
