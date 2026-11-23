import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLocalRouterCompanionState,
  buildLocalRouterPreviewPayload,
} from "../src/lib/localRouterCompanionState.js";

test("local router companion state builds unavailable and active companion views", () => {
  assert.deepEqual(
    buildLocalRouterCompanionState({
      routerResult: null,
      capabilityBadges: ["Local index", "Topology"],
      executionState: {
        executionBadges: [],
        skipBadges: [],
        densityBadges: [],
        budgetBadges: [],
        layerLabel: null,
      },
      projectionBadgeLabels: [],
      indexedRowCount: null,
    }),
    {
      tone: "info",
      title: "Local router available",
      detail: "A local retrieval preview path is available on this device, but this result did not run a local router pass.",
      stats: [
        { label: "Local index", value: "available" },
        { label: "Topology", value: "available" },
      ],
      badges: [],
      capabilityBadges: ["Local index", "Topology"],
      executionBadges: [],
      skipBadges: [],
      densityBadges: [],
      budgetBadges: [],
      confidenceLabel: "Unavailable",
      confidenceBand: "Unavailable",
      terminalLayer: "unavailable",
    },
  );

  const active = buildLocalRouterCompanionState({
    routerResult: {
      a2ui: {
        confidenceLabel: "High confidence",
        confidenceBand: "high",
      },
      terminalLayer: "deep",
      sources: [{}, {}],
      candidates: [
        { scores: { lexical: 0.4, topology: 0.2 }, decryptedExcerpt: "alpha" },
        { scores: { lexical: 0.3, deep: 0.5 } },
      ],
      budget: {
        elapsedMs: 42,
        embeddings: 1,
        decryptions: 2,
        tokens: 120,
      },
    },
    capabilityBadges: ["Local index", "Topology"],
    executionState: {
      executionBadges: ["Topology used (1 linked result)", "Vector used (1 embedding)"],
      skipBadges: ["Deep skipped: shortlist stayed shallow"],
      densityBadges: ["2 local sources", "3 evidence layers", "1 excerpt"],
      budgetBadges: ["Latency cap reached"],
      layerLabel: "Deep",
    },
    projectionBadgeLabels: ["Index refresh: partial"],
    indexedRowCount: 11,
  });

  assert.equal(active?.tone, "warning");
  assert.equal(active?.title, "Local retrieval preview");
  assert.ok(active?.detail.includes("deep layer"));
  assert.ok(active?.detail.includes("2 local sources"));
  assert.ok(active?.detail.includes("Latency cap reached"));
  assert.deepEqual(active?.capabilityBadges, ["Local index", "Topology"]);
  assert.deepEqual(active?.executionBadges, ["Topology used (1 linked result)", "Vector used (1 embedding)"]);
  assert.deepEqual(active?.skipBadges, ["Deep skipped: shortlist stayed shallow"]);
  assert.deepEqual(active?.densityBadges, ["2 local sources", "3 evidence layers", "1 excerpt"]);
  assert.deepEqual(active?.budgetBadges, ["Latency cap reached"]);
  assert.equal(active?.confidenceLabel, "High confidence");
  assert.equal(active?.confidenceBand, "high");
  assert.equal(active?.terminalLayer, "deep");
  assert.ok(active?.badges.includes("Index refresh: partial"));
  assert.ok(active?.stats.some((item) => item.label === "Indexed rows" && item.value === "11"));
});

test("local router preview payload mirrors companion partitions", () => {
  const payload = buildLocalRouterPreviewPayload({
    tone: "success",
    title: "Local retrieval preview",
    detail: "Local router ran to the lexical layer.",
    stats: [{ label: "Sources", value: "2" }],
    badges: ["Local index", "Lexical used"],
    capabilityBadges: ["Local index"],
    executionBadges: ["Lexical used"],
    skipBadges: ["Vector skipped: lexical/topology sufficient"],
    densityBadges: ["2 local sources"],
    budgetBadges: ["Latency cap reached"],
    confidenceLabel: "Medium confidence",
    confidenceBand: "medium",
    terminalLayer: "lexical",
  });

  assert.deepEqual(payload, {
    title: "Local retrieval preview",
    tone: "success",
    detail: "Local router ran to the lexical layer.",
    confidence_label: "Medium confidence",
    confidence_band: "medium",
    terminal_layer: "lexical",
    capability_badges: ["Local index"],
    execution_badges: ["Lexical used"],
    skip_badges: ["Vector skipped: lexical/topology sufficient"],
    density_badges: ["2 local sources"],
    budget_badges: ["Latency cap reached"],
    stats: [{ label: "Sources", value: "2" }],
  });
  assert.equal(
    buildLocalRouterPreviewPayload({
      tone: "info",
      title: "Local router available",
      detail: "Unavailable.",
      stats: [],
      badges: [],
      capabilityBadges: [],
      executionBadges: [],
      skipBadges: [],
      densityBadges: [],
      budgetBadges: [],
      confidenceLabel: "Unavailable",
      confidenceBand: "Unavailable",
      terminalLayer: "unavailable",
    }),
    null,
  );
});
