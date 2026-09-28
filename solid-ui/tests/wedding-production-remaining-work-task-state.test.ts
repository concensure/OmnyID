import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingProductionRemainingWorkTaskItems,
} from "@/lib/weddingProductionRemainingWorkTaskState";
import type { WeddingProductionRemainingWorkState } from "@/lib/weddingProductionRemainingWorkState";

const remainingWork: WeddingProductionRemainingWorkState = {
  productionReady: false,
  oracleUploadAllowed: false,
  totalBlockedItems: 2,
  oracleBlockingItems: [],
  productionPolishItems: [],
  nextRecommendedItems: [
    {
      id: "provider_executor_integrations",
      label: "Connected app integrations",
      requiredForOracle: true,
      readinessTier: "oracle_blocker",
      estimatedPasses: 2,
      summary: "Email, calendar, maps, registry, and vendor connected-app actions need production proof before live use.",
    },
    {
      id: "seeded_vendor_corpus",
      label: "Source-backed seeded vendor corpus",
      requiredForOracle: false,
      readinessTier: "production_polish",
      estimatedPasses: 1,
      summary: "Source-backed seeded vendor corpus proof reference is missing.",
    },
  ],
  estimatedOraclePassesRemaining: 2,
  estimatedFullProductionPassesRemaining: 3,
  estimatedNextPasses: 3,
  headline: "Wedding planner still has Oracle-blocking production-readiness items.",
};

test("remaining work task builder creates actionable production readiness tasks", () => {
  const tasks = buildWeddingProductionRemainingWorkTaskItems({
    remainingWork,
    metadata: {
      wedding_plan_id: "wedding_plan:remaining-work",
      response_workspace_id: "response_workspace:remaining-work",
    },
  });

  assert.equal(tasks.length, 2);
  assert.equal(tasks[0]?.title, "Clear launch blocker: Connected app integrations");
  assert.equal(tasks[0]?.priority, "urgent");
  assert.equal(tasks[0]?.dueLabel, "Before Oracle upload");
  assert.equal((tasks[0]?.metadata as Record<string, unknown>).production_remaining_work_task, true);
  assert.equal((tasks[0]?.metadata as Record<string, unknown>).production_readiness_oracle_gate, true);
  assert.match(tasks[0]?.notes ?? "", /must clear before Oracle upload/i);
  assert.equal(tasks[1]?.title, "Finish production polish: Source-backed seeded vendor corpus");
  assert.equal(tasks[1]?.priority, "low");
  assert.equal((tasks[1]?.metadata as Record<string, unknown>).production_readiness_oracle_gate, false);
});

test("remaining work task builder suppresses saved duplicate tasks", () => {
  const tasks = buildWeddingProductionRemainingWorkTaskItems({
    remainingWork,
    existingTaskItems: [{
      id: "task:provider",
      title: "Already saved provider work",
      kind: "other",
      metadata: {
        production_remaining_work_item_id: "provider_executor_integrations",
      },
    }],
  });

  assert.equal(tasks.some((task) => /Connected app integrations/i.test(task.title)), false);
  assert.equal(tasks.some((task) => /seeded vendor corpus/i.test(task.title)), true);
});

test("remaining work task builder stays quiet when production is ready", () => {
  const tasks = buildWeddingProductionRemainingWorkTaskItems({
    remainingWork: {
      ...remainingWork,
      productionReady: true,
      nextRecommendedItems: [],
    },
  });

  assert.deepEqual(tasks, []);
});

test("remaining work task builder bounds malformed estimates and keeps blocker terms honest", () => {
  const tasks = buildWeddingProductionRemainingWorkTaskItems({
    remainingWork: {
      ...remainingWork,
      nextRecommendedItems: [
        {
          ...remainingWork.nextRecommendedItems[0]!,
          estimatedPasses: Number.POSITIVE_INFINITY,
        },
        {
          ...remainingWork.nextRecommendedItems[1]!,
          estimatedPasses: 9.2,
        },
      ],
    },
  });

  const blockerMetadata = tasks[0]?.metadata as Record<string, unknown>;
  const polishMetadata = tasks[1]?.metadata as Record<string, unknown>;
  assert.equal(blockerMetadata.production_remaining_work_estimated_passes, 1);
  assert.equal(polishMetadata.production_remaining_work_estimated_passes, 6);
  assert.match(tasks[0]?.notes ?? "", /Estimated work: 1 pass\./i);
  assert.match(tasks[1]?.notes ?? "", /Estimated work: 6 passes\./i);
  assert.deepEqual(blockerMetadata.second_order_evidence_labels, ["Oracle blocker", "1 pass estimated"]);
  assert.deepEqual(polishMetadata.second_order_evidence_labels, ["production polish", "6 passes estimated"]);
  assert.ok((blockerMetadata.searchable_terms as string[]).includes("launch blocker"));
  assert.equal((polishMetadata.searchable_terms as string[]).includes("launch blocker"), false);
  assert.ok((polishMetadata.searchable_terms as string[]).includes("production polish"));
});
