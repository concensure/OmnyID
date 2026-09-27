import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminWeddingOpsBackendMetricsReadinessState,
} from "../src/lib/adminWeddingOpsBackendMetricsReadinessState.ts";

test("buildAdminWeddingOpsBackendMetricsReadinessState blocks missing backend metrics", () => {
  const state = buildAdminWeddingOpsBackendMetricsReadinessState();

  assert.equal(state.productionReady, false);
  assert.equal(state.status, "blocked");
  assert.ok(state.blockerLabels.includes("Exact signed-up user count endpoint is not mounted."));
  assert.ok(state.blockerLabels.includes("Oracle disk used/total metric is not mounted."));
  assert.ok(state.blockerLabels.includes("Oracle RAM used/total metric is not mounted."));
});

test("buildAdminWeddingOpsBackendMetricsReadinessState reports partial metrics without production readiness", () => {
  const state = buildAdminWeddingOpsBackendMetricsReadinessState({
    operatorUsers: { users: [], limit: 25, total_users: 12 },
    oracleMetrics: {
      diskUsedLabel: "31 GB",
      diskTotalLabel: "100 GB",
    },
  });

  assert.equal(state.productionReady, false);
  assert.equal(state.status, "partial");
  assert.ok(state.evidenceLabels.includes("Exact signed-up user count mounted"));
  assert.ok(state.evidenceLabels.includes("Oracle disk usage metric mounted"));
  assert.ok(state.blockerLabels.includes("Oracle RAM used/total metric is not mounted."));
});

test("buildAdminWeddingOpsBackendMetricsReadinessState rejects impossible exact user totals", () => {
  const state = buildAdminWeddingOpsBackendMetricsReadinessState({
    operatorUsers: { users: [], limit: 25, total_users: -1 },
    oracleMetrics: {
      diskUsedLabel: "31 GB",
      diskTotalLabel: "100 GB",
      ramUsedLabel: "3.2 GB",
      ramTotalLabel: "8 GB",
      sourceLabel: "oracle-prod-1",
    },
  });

  assert.equal(state.productionReady, false);
  assert.equal(state.status, "partial");
  assert.ok(state.blockerLabels.includes("Exact signed-up user count endpoint is not mounted."));
  assert.ok(!state.evidenceLabels.includes("Exact signed-up user count mounted"));
});

test("buildAdminWeddingOpsBackendMetricsReadinessState passes exact users disk RAM and source", () => {
  const state = buildAdminWeddingOpsBackendMetricsReadinessState({
    operatorUsers: { users: [], limit: 25, total_users: 42 },
    oracleMetrics: {
      diskUsedLabel: "31 GB",
      diskTotalLabel: "100 GB",
      ramUsedLabel: "3.2 GB",
      ramTotalLabel: "8 GB",
      sourceLabel: "oracle-prod-1",
    },
  });

  assert.equal(state.productionReady, true);
  assert.equal(state.status, "ready");
  assert.deepEqual(state.blockerLabels, []);
  assert.equal(state.evidenceLabels.length, 4);
});

test("buildAdminWeddingOpsBackendMetricsReadinessState can require fresh Oracle metric proof", () => {
  const state = buildAdminWeddingOpsBackendMetricsReadinessState({
    operatorUsers: { users: [], limit: 25, total_users: 42 },
    freshnessPolicy: "required",
    oracleMetrics: {
      diskUsedLabel: "31 GB",
      diskTotalLabel: "100 GB",
      ramUsedLabel: "3.2 GB",
      ramTotalLabel: "8 GB",
      sourceLabel: "oracle-prod-1",
      collectedAtLabel: "2026-09-14T10:00:00Z",
      metricAgeMinutes: 4,
      maxMetricAgeMinutes: 15,
      proofRef: "oracle-metrics:prod-1:2026-09-14T10",
    },
  });

  assert.equal(state.productionReady, true);
  assert.equal(state.status, "ready");
  assert.ok(state.evidenceLabels.some((label) => /freshness proof mounted \(4m\)/i.test(label)));
  assert.ok(state.evidenceLabels.some((label) => /proof reference mounted: oracle-metrics/i.test(label)));
  assert.equal(state.blockerLabels.length, 0);
});

test("buildAdminWeddingOpsBackendMetricsReadinessState blocks stale or anonymous Oracle metrics in strict mode", () => {
  const state = buildAdminWeddingOpsBackendMetricsReadinessState({
    operatorUsers: { users: [], limit: 25, total_users: 42 },
    freshnessPolicy: "required",
    oracleMetrics: {
      diskUsedLabel: "31 GB",
      diskTotalLabel: "100 GB",
      ramUsedLabel: "3.2 GB",
      ramTotalLabel: "8 GB",
      sourceLabel: "oracle-prod-1",
      metricAgeMinutes: 30,
      maxMetricAgeMinutes: 15,
    },
  });

  assert.equal(state.productionReady, false);
  assert.equal(state.status, "partial");
  assert.ok(state.blockerLabels.some((label) => /stale: 30m old, max 15m/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /proof reference/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /collected-at/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /Refresh Oracle metrics/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /durable Oracle metrics proof/i.test(label)));
});

test("buildAdminWeddingOpsBackendMetricsReadinessState rejects local metric proof references", () => {
  for (const proofRef of [
    "file:///tmp/oracle-metrics.txt",
    "dry-run:oracle-metrics:latest",
    "http://oracle.omnyid.com/metrics-proof",
    "http://localhost:8787/oracle-metrics",
    "https://127.0.0.1/oracle-metrics",
    "https://0.0.0.0/oracle-metrics",
    "https://[::1]/oracle-metrics",
    "blob:https://app.example/oracle-metrics",
    "data:application/json,{}",
  ]) {
    const state = buildAdminWeddingOpsBackendMetricsReadinessState({
      operatorUsers: { users: [], limit: 25, total_users: 42 },
      freshnessPolicy: "required",
      oracleMetrics: {
        diskUsedLabel: "31 GB",
        diskTotalLabel: "100 GB",
        ramUsedLabel: "3.2 GB",
        ramTotalLabel: "8 GB",
        sourceLabel: "oracle-prod-1",
        collectedAtLabel: "2026-09-14T10:00:00Z",
        metricAgeMinutes: 4,
        maxMetricAgeMinutes: 15,
        proofRef,
      },
    });

    assert.equal(state.productionReady, false);
    assert.equal(state.status, "partial");
    assert.ok(state.blockerLabels.some((label) => /remote HTTPS proof link/i.test(label)), proofRef);
    assert.ok(!state.evidenceLabels.some((label) => /proof reference mounted:/i.test(label)));
    assert.ok(state.nextActionLabels.some((label) => /durable Oracle metrics proof/i.test(label)));
  }
});

test("buildAdminWeddingOpsBackendMetricsReadinessState rejects placeholder metric proof references", () => {
  for (const proofRef of ["...", "oracle-metrics:test:2026-09-14", "oracle-metrics:placeholder:latest"]) {
    const state = buildAdminWeddingOpsBackendMetricsReadinessState({
      operatorUsers: { users: [], limit: 25, total_users: 42 },
      freshnessPolicy: "required",
      oracleMetrics: {
        diskUsedLabel: "31 GB",
        diskTotalLabel: "100 GB",
        ramUsedLabel: "3.2 GB",
        ramTotalLabel: "8 GB",
        sourceLabel: "oracle-prod-1",
        collectedAtLabel: "2026-09-14T10:00:00Z",
        metricAgeMinutes: 4,
        maxMetricAgeMinutes: 15,
        proofRef,
      },
    });

    assert.equal(state.productionReady, false);
    assert.equal(state.status, "partial");
    assert.ok(state.blockerLabels.some((label) => /real production evidence/i.test(label)));
    assert.ok(!state.evidenceLabels.some((label) => /proof reference mounted:/i.test(label)));
  }
});
