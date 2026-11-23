import assert from "node:assert/strict";
import test from "node:test";

import { runWeddingVendorDirectoryFirstSearch } from "@/lib/weddingVendorDirectoryFirstSearchState";
import type { WeddingVendorSearchExecutionState } from "@/lib/weddingVendorSearchExecutorState";

function execution(count: number): WeddingVendorSearchExecutionState {
  return {
    status: "cached", externalSearchPerformed: false, providerLabel: "Directory", queryCount: 1, sourceCount: count,
    queries: ["photographer Sydney"], message: "ok", receiptMetadata: {},
    sources: Array.from({ length: count }, (_, index) => ({ title: `Vendor ${index + 1}`, url: `https://vendor-${index + 1}.example`, provider: "Directory" })),
  };
}

test("directory-first search skips online fallback once the exact-three policy is complete", async () => {
  const policies: string[] = [];
  const result = await runWeddingVendorDirectoryFirstSearch({
    comparison: { location: "Sydney", vendorCategories: ["photographer"], targetCategory: "photographer" },
    run: async (policy) => { policies.push(policy); return execution(3); },
  });
  assert.deepEqual(policies, ["directory_only"]);
  assert.equal(result.comparisonStatus, "complete");
  assert.equal(result.onlineFallbackUsed, false);
});

test("directory-first search performs one online fallback after a strict shortfall", async () => {
  const policies: string[] = [];
  const result = await runWeddingVendorDirectoryFirstSearch({
    comparison: { location: "Sydney", vendorCategories: ["photographer"], targetCategory: "photographer" },
    run: async (policy) => { policies.push(policy); return execution(policy === "directory_only" ? 2 : 3); },
  });
  assert.deepEqual(policies, ["directory_only", "online_capable"]);
  assert.equal(result.comparisonStatus, "complete");
  assert.equal(result.onlineFallbackUsed, true);
});

test("a directory shortfall stays honest when online providers are disabled", async () => {
  const policies: string[] = [];
  const result = await runWeddingVendorDirectoryFirstSearch({
    comparison: { location: "Sydney", vendorCategories: ["photographer"], targetCategory: "photographer", canRunOnlineFallback: false },
    run: async (policy) => { policies.push(policy); return execution(2); },
  });
  assert.deepEqual(policies, ["directory_only"]);
  assert.equal(result.comparisonStatus, "needs_online_shortfall");
  assert.equal(result.onlineFallbackUsed, false);
});
