import assert from "node:assert/strict";
import test from "node:test";

import { buildFilterChips } from "../src/lib/weddingResponseWorkspacePresentationState.ts";
import type { WeddingArtifactSummary } from "../src/lib/weddingArtifactState.ts";

const artifact: WeddingArtifactSummary = {
  id: "artifact-1",
  title: "Top vendor comparison",
  kind: "vendor_table",
  category: "Vendors",
  createdAt: 1,
  metadata: {
    weddingPlanId: "plan-1",
    responseWorkspaceId: "workspace-1",
    sourceResponseId: "source-1",
    privacyScope: "private",
    approvalState: "draft",
    artifactKind: "vendor_table",
    supertags: [],
  },
  exportTargets: ["browser_pdf", "csv"],
  approvalState: "draft",
  sourceLabels: ["Vendor website"],
  sourceLinks: [{ label: "Vendor website", url: "https://example.com" }],
  locationLabels: ["Blue Mountains"],
  vendorLabels: ["Example Venue"],
  linkedTaskIds: [],
  linkedCalendarEventIds: [],
  searchText: "",
};

test("document filters use wedding-friendly labels instead of storage terms", () => {
  const labels = buildFilterChips([artifact]).map((chip) => chip.label);
  assert.ok(labels.includes("Vendor comparisons"));
  assert.ok(labels.includes("Printable"));
  assert.ok(labels.includes("Spreadsheet"));
  assert.ok(labels.includes("Sources attached"));
  assert.doesNotMatch(labels.join(" "), /vendor_table|browser_pdf|source_linked/i);
});
