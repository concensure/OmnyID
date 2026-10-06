// @locs-version: 2.0
// Directory-first orchestration: rank the local pass before allowing one online fallback.

import {
  buildWeddingVendorComparisonArtifactState,
  type WeddingVendorComparisonInput,
} from "@/lib/weddingVendorSearchArtifactState";
import type { WeddingVendorSearchExecutionState } from "@/lib/weddingVendorSearchExecutorState";

export type WeddingVendorDirectoryFirstSearchResult = {
  execution: WeddingVendorSearchExecutionState;
  comparisonStatus: "complete" | "needs_online_shortfall" | "blocked";
  onlineFallbackUsed: boolean;
};

export async function runWeddingVendorDirectoryFirstSearch(input: {
  comparison: Omit<WeddingVendorComparisonInput, "execution">;
  run: (sourcePolicy: "directory_only" | "online_capable") => Promise<WeddingVendorSearchExecutionState>;
}): Promise<WeddingVendorDirectoryFirstSearchResult> {
  const directory = await input.run("directory_only");
  const directoryComparison = buildWeddingVendorComparisonArtifactState({
    ...input.comparison,
    execution: directory,
    requireExactlyThree: true,
  });
  if (directoryComparison.status === "created" && directoryComparison.topChoiceCount === 3) {
    return { execution: directory, comparisonStatus: "complete", onlineFallbackUsed: false };
  }
  if (directory.status === "failed" || directory.status === "blocked") {
    return { execution: directory, comparisonStatus: "blocked", onlineFallbackUsed: false };
  }
  if (input.comparison.canRunOnlineFallback === false) {
    return { execution: directory, comparisonStatus: "needs_online_shortfall", onlineFallbackUsed: false };
  }
  const online = await input.run("online_capable");
  const onlineComparison = buildWeddingVendorComparisonArtifactState({
    ...input.comparison,
    execution: online,
    requireExactlyThree: true,
  });
  return {
    execution: online,
    comparisonStatus: onlineComparison.status === "created" && onlineComparison.topChoiceCount === 3
      ? "complete"
      : "needs_online_shortfall",
    onlineFallbackUsed: true,
  };
}
