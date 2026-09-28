import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingProductionRemainingWorkPresentationState,
} from "@/lib/weddingProductionRemainingWorkPresentationState";
import type { WeddingProductionRemainingWorkState } from "@/lib/weddingProductionRemainingWorkState";

const blockedState: WeddingProductionRemainingWorkState = {
  productionReady: false,
  oracleUploadAllowed: false,
  totalBlockedItems: 2,
  oracleBlockingItems: [
    {
      id: "provider_executor_integrations",
      label: "Connected app integrations",
      requiredForOracle: true,
      readinessTier: "oracle_blocker",
      estimatedPasses: 2,
      summary: "Email, calendar, maps, registry, and vendor connected-app actions need production proof before live use.",
    },
  ],
  productionPolishItems: [
    {
      id: "seeded_vendor_corpus",
      label: "Source-backed seeded vendor corpus",
      requiredForOracle: false,
      readinessTier: "production_polish",
      estimatedPasses: 1,
      summary: "Source-backed seeded vendor corpus proof reference is missing.",
    },
  ],
  nextRecommendedItems: [
    {
      id: "provider_executor_integrations",
      label: "Connected app integrations",
      requiredForOracle: true,
      readinessTier: "oracle_blocker",
      estimatedPasses: 2,
      summary: "Email, calendar, maps, registry, and vendor connected-app actions need production proof before live use.",
    },
  ],
  estimatedOraclePassesRemaining: 2,
  estimatedFullProductionPassesRemaining: 3,
  estimatedNextPasses: 2,
  headline: "Wedding planner still has Oracle-blocking production-readiness items.",
};

test("remaining work presentation makes Oracle blockers and pass estimates visible", () => {
  const state = buildWeddingProductionRemainingWorkPresentationState(blockedState);

  assert.equal(state.visible, true);
  assert.equal(state.statusLabel, "Oracle blocked");
  assert.match(state.containerClass, /red/);
  assert.equal(state.oracleEstimateLabel, "Oracle upload: 2 passes");
  assert.equal(state.fullEstimateLabel, "Full production: 3 passes");
  assert.equal(state.nextEstimateLabel, "Next pass: 2 passes");
  assert.equal(state.oracleCountLabel, "1 Oracle blocker");
  assert.equal(state.polishCountLabel, "1 polish item");
  assert.equal(state.nextItems[0]?.label, "Connected app integrations");
  assert.equal(state.nextItems[0]?.tierLabel, "Oracle blocker");
});

test("remaining work presentation distinguishes polish-only work after Oracle can clear", () => {
  const state = buildWeddingProductionRemainingWorkPresentationState({
    ...blockedState,
    oracleUploadAllowed: true,
    oracleBlockingItems: [],
    nextRecommendedItems: blockedState.productionPolishItems,
    estimatedOraclePassesRemaining: 0,
    estimatedFullProductionPassesRemaining: 1,
    estimatedNextPasses: 1,
    headline: "Wedding planner can clear Oracle upload, with production-polish items still open.",
  });

  assert.equal(state.statusLabel, "Polish remaining");
  assert.match(state.containerClass, /amber/);
  assert.equal(state.summary, "1 production-polish item remain after Oracle upload can clear.");
  assert.equal(state.nextItems[0]?.summary, "Source-backed seeded vendor corpus proof reference is missing.");
  assert.equal(state.nextItems[0]?.tierLabel, "Production polish");
});

test("remaining work presentation handles complete and missing states", () => {
  const ready = buildWeddingProductionRemainingWorkPresentationState({
    ...blockedState,
    productionReady: true,
    oracleUploadAllowed: true,
    totalBlockedItems: 0,
    oracleBlockingItems: [],
    productionPolishItems: [],
    nextRecommendedItems: [],
    estimatedOraclePassesRemaining: 0,
    estimatedFullProductionPassesRemaining: 0,
    estimatedNextPasses: 0,
    headline: "Wedding planner is production-ready.",
  });
  const missing = buildWeddingProductionRemainingWorkPresentationState(null);

  assert.equal(ready.statusLabel, "Ready");
  assert.match(ready.containerClass, /emerald/);
  assert.deepEqual(ready.nextItems, []);
  assert.equal(missing.statusLabel, "Oracle blocked");
  assert.equal(missing.oracleEstimateLabel, "Oracle upload: not checked");
  assert.equal(missing.summary, "Run production-readiness checks to see what remains.");
});

test("remaining work presentation bounds malformed pass estimates", () => {
  const state = buildWeddingProductionRemainingWorkPresentationState({
    ...blockedState,
    nextRecommendedItems: [
      {
        ...blockedState.nextRecommendedItems[0]!,
        estimatedPasses: Number.POSITIVE_INFINITY,
      },
      {
        ...blockedState.productionPolishItems[0]!,
        estimatedPasses: 120.2,
      },
    ],
    estimatedOraclePassesRemaining: Number.NaN,
    estimatedFullProductionPassesRemaining: Number.POSITIVE_INFINITY,
    estimatedNextPasses: -2,
  });

  assert.equal(state.oracleEstimateLabel, "Oracle upload: 0 passes");
  assert.equal(state.fullEstimateLabel, "Full production: 0 passes");
  assert.equal(state.nextEstimateLabel, "Next pass: 0 passes");
  assert.equal(state.nextItems[0]?.estimateLabel, "0 passes");
  assert.equal(state.nextItems[1]?.estimateLabel, "99 passes");
});
