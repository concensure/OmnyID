import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminWeddingOpsOracleMetricsState,
  formatAdminWeddingOpsBytes,
} from "../src/lib/adminWeddingOpsOracleMetricsState.ts";
import { buildAdminWeddingOpsBackendMetricsReadinessState } from "../src/lib/adminWeddingOpsBackendMetricsReadinessState.ts";
import { buildAdminWeddingOpsPanelState } from "../src/lib/adminWeddingOpsState.ts";

test("formatAdminWeddingOpsBytes formats finite non-negative byte values", () => {
  assert.equal(formatAdminWeddingOpsBytes(512), "512 B");
  assert.equal(formatAdminWeddingOpsBytes(1024 * 1024 * 3.5), "3.5 MB");
  assert.equal(formatAdminWeddingOpsBytes(1024 * 1024 * 1024 * 31), "31 GB");
  assert.equal(formatAdminWeddingOpsBytes(-1), null);
  assert.equal(formatAdminWeddingOpsBytes(Number.NaN), null);
});

test("buildAdminWeddingOpsOracleMetricsState normalizes raw Oracle byte payloads", () => {
  const metrics = buildAdminWeddingOpsOracleMetricsState({
    disk_used_bytes: 1024 * 1024 * 1024 * 31,
    disk_total_bytes: 1024 * 1024 * 1024 * 100,
    ram_used_bytes: String(1024 * 1024 * 1024 * 3.5),
    ram_total_bytes: 1024 * 1024 * 1024 * 8,
    hostname: " oracle-prod-1 ",
  });

  assert.deepEqual(metrics, {
    diskUsedLabel: "31 GB",
    diskTotalLabel: "100 GB",
    ramUsedLabel: "3.5 GB",
    ramTotalLabel: "8 GB",
    sourceLabel: "oracle-prod-1",
  });
});

test("buildAdminWeddingOpsOracleMetricsState keeps explicit labels when bytes are not present", () => {
  const metrics = buildAdminWeddingOpsOracleMetricsState({
    diskUsedLabel: "31 GB",
    diskTotalLabel: "100 GB",
    ram_used_label: "3.2 GB",
    ram_total_label: "8 GB",
    source: "oracle-prod-metrics",
  });

  assert.equal(metrics.diskUsedLabel, "31 GB");
  assert.equal(metrics.ramUsedLabel, "3.2 GB");
  assert.equal(metrics.sourceLabel, "oracle-prod-metrics");
});

test("buildAdminWeddingOpsOracleMetricsState drops impossible usage pairs so readiness blocks them", () => {
  const metrics = buildAdminWeddingOpsOracleMetricsState({
    diskUsedBytes: 200,
    diskTotalBytes: 100,
    ramUsedBytes: 50,
    ramTotalBytes: 100,
    sourceLabel: "oracle-prod-1",
  });
  const readiness = buildAdminWeddingOpsBackendMetricsReadinessState({
    operatorUsers: { users: [], limit: 25, total_users: 10 },
    oracleMetrics: metrics,
  });

  assert.equal(metrics.diskUsedLabel, null);
  assert.equal(metrics.diskTotalLabel, null);
  assert.equal(readiness.productionReady, false);
  assert.ok(readiness.blockerLabels.includes("Oracle disk used/total metric is not mounted."));
});

test("buildAdminWeddingOpsOracleMetricsState feeds the admin panel without leaking invalid labels", () => {
  const metrics = buildAdminWeddingOpsOracleMetricsState({
    diskUsedBytes: 1024 * 1024 * 1024,
    diskTotalBytes: 1024 * 1024 * 1024 * 2,
    ramUsedBytes: -1,
    ramTotalBytes: 1024,
    sourceLabel: "oracle-prod-1",
  });
  const panel = buildAdminWeddingOpsPanelState({
    operatorUsers: { users: [], limit: 25, total_users: 2 },
    oracleMetrics: metrics,
    routeWeddingAiThroughAdmin: false,
  });

  assert.equal(panel.metrics.find((metric) => metric.title === "Oracle disk")?.value, "1 GB / 2 GB");
  assert.equal(panel.metrics.find((metric) => metric.title === "Oracle RAM")?.status, "needs_backend");
  assert.equal(panel.metrics.find((metric) => metric.title === "Ops backend metrics")?.value, "Partial metrics");
});
