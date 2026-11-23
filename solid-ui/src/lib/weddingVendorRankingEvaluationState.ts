// @locs-version: 1.0
export type WeddingVendorRankingEvaluationCase = {
  id: string;
  judges: readonly string[];
  relevanceByCandidate: Readonly<Record<string, number>>;
  v1Order: readonly string[];
  v2Order: readonly string[];
  replayV2Order: readonly string[];
  probes?: Readonly<Record<string, boolean>>;
};

function gain(relevance: number): number {
  return 2 ** Math.max(0, Math.min(3, relevance)) - 1;
}

export function weddingVendorNdcgAt3(order: readonly string[], relevance: Readonly<Record<string, number>>): number {
  const dcg = order.slice(0, 3).reduce((sum, id, index) => sum + gain(relevance[id] ?? 0) / Math.log2(index + 2), 0);
  const ideal = Object.values(relevance).sort((left, right) => right - left).slice(0, 3)
    .reduce((sum, score, index) => sum + gain(score) / Math.log2(index + 2), 0);
  return ideal > 0 ? dcg / ideal : 0;
}

/** Fail-closed implementation of the real-catalog release gate from closure spec §5.8. */
export function assessWeddingVendorRankingV2Gate(cases: readonly WeddingVendorRankingEvaluationCase[]) {
  const rows = cases.map((item) => {
    const v1 = weddingVendorNdcgAt3(item.v1Order, item.relevanceByCandidate);
    const v2 = weddingVendorNdcgAt3(item.v2Order, item.relevanceByCandidate);
    return { id: item.id, v1, v2, delta: v2 - v1 };
  });
  const mean = (key: "v1" | "v2") => rows.length ? rows.reduce((sum, row) => sum + row[key], 0) / rows.length : 0;
  const issues: string[] = [];
  if (cases.length < 40) issues.push(`Real-catalog corpus has ${cases.length}/40 required cases.`);
  for (const item of cases) {
    if (new Set(item.judges.map((judge) => judge.trim()).filter(Boolean)).size < 2) issues.push(`${item.id}: fewer than two independent judges.`);
    if (item.v2Order.join("\u0000") !== item.replayV2Order.join("\u0000")) issues.push(`${item.id}: v2 replay is not deterministic.`);
    for (const [probe, passed] of Object.entries(item.probes ?? {})) if (!passed) issues.push(`${item.id}: probe '${probe}' failed.`);
  }
  const v1 = mean("v1");
  const v2 = mean("v2");
  if (v2 + 1e-12 < v1 + 0.05) issues.push(`Aggregate NDCG@3 improvement is ${(v2 - v1).toFixed(3)}; at least 0.050 is required.`);
  const regression = rows.find((row) => row.delta < -0.15 - 1e-12);
  if (regression) issues.push(`${regression.id}: NDCG@3 regressed by ${Math.abs(regression.delta).toFixed(3)}; maximum is 0.150.`);
  return { passed: issues.length === 0, caseCount: cases.length, v1NdcgAt3: v1, v2NdcgAt3: v2, rows, issues };
}
