import assert from "node:assert/strict";
import test from "node:test";

import type { WeddingArtifactSummary } from "../src/lib/weddingArtifactState.ts";
import {
  buildWeddingVendorSearchQueryEditState,
  buildWeddingVendorSearchResultAction,
  buildWeddingVendorSearchResultActionFromArtifacts,
  hasWeddingVendorComparisonArtifactSummary,
  hasWeddingVendorSearchArtifactSummary,
  hasWeddingVendorTopFiveComparisonExpansion,
} from "../src/lib/weddingVendorSearchResultActionState.ts";

function artifact(overrides: Partial<WeddingArtifactSummary>): WeddingArtifactSummary {
  return {
    id: "artifact",
    title: "Artifact",
    kind: "vendor_table",
    category: "Vendors",
    createdAt: 1,
    metadata: {
      weddingPlanId: "plan",
      responseWorkspaceId: "workspace",
      sourceResponseId: "response",
      artifactKind: "vendor_table",
      supertags: [],
      approvalState: "none",
    } as WeddingArtifactSummary["metadata"],
    exportTargets: [],
    approvalState: "none",
    sourceLabels: [],
    sourceLinks: [],
    locationLabels: [],
    vendorLabels: [],
    linkedTaskIds: [],
    linkedCalendarEventIds: [],
    searchText: "",
    ...overrides,
  };
}

test("buildWeddingVendorSearchResultAction prefers the source-backed comparison artifact", () => {
  assert.deepEqual(
    buildWeddingVendorSearchResultAction({
      sourceArtifactId: "vendor-notes-1",
      comparisonArtifactId: "vendor-comparison-1",
      comparisonCreated: true,
      topChoiceCount: 3,
    }),
    {
      label: "Show full search result",
      detail: "3 suitable vendor choices found from the saved source-backed search.",
      artifactId: "vendor-comparison-1",
      sourceArtifactId: "vendor-notes-1",
      menu: "documents",
    },
  );
});

test("buildWeddingVendorSearchResultAction falls back to vendor notes without a comparison", () => {
  assert.deepEqual(
    buildWeddingVendorSearchResultAction({
      sourceArtifactId: " vendor-notes-1 ",
      comparisonArtifactId: "",
      comparisonCreated: false,
    }),
    {
      label: "Show full search result",
      detail: "Show the saved source-backed vendor notes here.",
      artifactId: "vendor-notes-1",
      sourceArtifactId: "vendor-notes-1",
      menu: "documents",
    },
  );
});

test("buildWeddingVendorSearchResultAction returns null without a saved artifact target", () => {
  assert.equal(
    buildWeddingVendorSearchResultAction({
      sourceArtifactId: "",
      comparisonArtifactId: "comparison-without-created-state",
      comparisonCreated: false,
    }),
    null,
  );
});

test("buildWeddingVendorSearchResultAction describes a bounded partial comparison", () => {
  assert.equal(
    buildWeddingVendorSearchResultAction({
      sourceArtifactId: "vendor-notes-1",
      comparisonArtifactId: "vendor-comparison-1",
      comparisonCreated: true,
      topChoiceCount: 30,
    })?.detail,
    "5 suitable vendor choices found from the saved source-backed search.",
  );
});

test("buildWeddingVendorSearchQueryEditState clears stale result actions after manual edits", () => {
  assert.deepEqual(buildWeddingVendorSearchQueryEditState(" florist in Sydney "), {
    resultAction: null,
    notice: "Search request updated. Run live search to refresh the saved vendor results.",
  });
});

test("buildWeddingVendorSearchQueryEditState explains fallback after clearing the query", () => {
  assert.deepEqual(buildWeddingVendorSearchQueryEditState("   "), {
    resultAction: null,
    notice: "Search request cleared. Add a vendor search request or use your onboarding answers.",
  });
});

test("buildWeddingVendorSearchResultActionFromArtifacts restores latest comparison action after refresh", () => {
  const action = buildWeddingVendorSearchResultActionFromArtifacts([
    artifact({
      id: "older-vendor-notes",
      createdAt: 10,
      searchText: "source-backed vendor-search google_places",
    }),
    artifact({
      id: "newer-comparison",
      title: "Top vendor comparison",
      createdAt: 20,
      metadata: {
        weddingPlanId: "plan",
        responseWorkspaceId: "workspace",
        sourceResponseId: "response",
        artifactKind: "vendor_table",
        supertags: [],
        approvalState: "none",
        source: "vendor_search_comparison",
        topChoiceCount: 5,
      } as WeddingArtifactSummary["metadata"],
      searchText: "top vendor comparison",
    }),
  ]);

  assert.deepEqual(action, {
    label: "Show full search result",
    detail: "5 suitable vendor choices found from the saved source-backed search.",
    artifactId: "newer-comparison",
    sourceArtifactId: "older-vendor-notes",
    menu: "documents",
  });
});

test("buildWeddingVendorSearchResultActionFromArtifacts restores latest notes action without comparison", () => {
  const action = buildWeddingVendorSearchResultActionFromArtifacts([
    artifact({
      id: "old-notes",
      createdAt: 10,
      searchText: "vendor search source packet brave search",
    }),
    artifact({
      id: "new-notes",
      createdAt: 30,
      searchText: "source-backed vendor-search overpass",
    }),
  ]);

  assert.deepEqual(action, {
    label: "Show full search result",
    detail: "Show the saved source-backed vendor notes here.",
    artifactId: "new-notes",
    sourceArtifactId: "new-notes",
    menu: "documents",
  });
});

test("vendor search summary helpers identify saved search and comparison artifacts", () => {
  const notes = artifact({ searchText: "vendor_search_executor google_places" });
  const comparison = artifact({
    title: "Top vendor comparison",
    metadata: {
      weddingPlanId: "plan",
      responseWorkspaceId: "workspace",
      sourceResponseId: "response",
      artifactKind: "vendor_table",
      supertags: [],
      approvalState: "none",
      source: "vendor_search_comparison",
    } as WeddingArtifactSummary["metadata"],
  });
  const unrelated = artifact({ id: "budget", kind: "budget_sheet", searchText: "vendor_search_executor" });

  assert.equal(hasWeddingVendorSearchArtifactSummary([notes]), true);
  assert.equal(hasWeddingVendorComparisonArtifactSummary([comparison]), true);
  assert.equal(hasWeddingVendorSearchArtifactSummary([unrelated]), false);
  assert.equal(hasWeddingVendorComparisonArtifactSummary([unrelated]), false);
});

test("hasWeddingVendorTopFiveComparisonExpansion requires comparison count and handoff metadata", () => {
  const expandable = artifact({
    title: "Top vendor comparison",
    metadata: {
      weddingPlanId: "plan",
      responseWorkspaceId: "workspace",
      sourceResponseId: "response",
      artifactKind: "vendor_table",
      supertags: [],
      approvalState: "none",
      source: "vendor_search_comparison",
      topChoiceCount: 5,
      vendorComparisonHandoff: { mode: "select_vendors" },
    } as WeddingArtifactSummary["metadata"],
  });
  const topThreeOnly = artifact({
    title: "Top vendor comparison",
    metadata: {
      weddingPlanId: "plan",
      responseWorkspaceId: "workspace",
      sourceResponseId: "response",
      artifactKind: "vendor_table",
      supertags: [],
      approvalState: "none",
      source: "vendor_search_comparison",
      topChoiceCount: 3,
      vendorComparisonHandoff: { mode: "select_vendors" },
    } as WeddingArtifactSummary["metadata"],
  });
  const missingHandoff = artifact({
    title: "Top vendor comparison",
    metadata: {
      weddingPlanId: "plan",
      responseWorkspaceId: "workspace",
      sourceResponseId: "response",
      artifactKind: "vendor_table",
      supertags: [],
      approvalState: "none",
      source: "vendor_search_comparison",
      topChoiceCount: 5,
    } as WeddingArtifactSummary["metadata"],
  });

  assert.equal(hasWeddingVendorTopFiveComparisonExpansion([expandable]), true);
  assert.equal(hasWeddingVendorTopFiveComparisonExpansion([topThreeOnly]), false);
  assert.equal(hasWeddingVendorTopFiveComparisonExpansion([missingHandoff]), false);
});
