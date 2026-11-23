import assert from "node:assert/strict";
import test from "node:test";

import { decisionCardFromWeddingVendorComparison } from "@/lib/decisionCardState";
import type { WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";

test("a single vendor comparison does not present an unsupported recommendation", () => {
  const preview = {
    artifactId: "artifact-1",
    title: "Venue shortlist",
    sourceLinks: [{ label: "Official venue site", url: "https://venue.example", source: "vendor_search" }],
    vendorComparisonHandoff: {
      recommendationLabel: "One venue fits what you've told us so far.",
      whyLabels: ["One source-backed venue found"],
      confidenceLabel: "Confidence: low",
      nextActionLabel: "Review the venue.",
    },
    vendorComparisonCards: [{}],
    evidenceSummary: { statusLabel: "Partial evidence", warningLabel: null },
  } as unknown as WeddingWorkspaceArtifactPreview;

  assert.equal(decisionCardFromWeddingVendorComparison(preview).recommendation, null);
});
