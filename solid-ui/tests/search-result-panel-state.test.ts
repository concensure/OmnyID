import test from "node:test";
import assert from "node:assert/strict";

import { buildSearchResultPanelState } from "../src/lib/searchResultPanelState.js";

test("search result panel state assembles search, router, refinement, and source sections", () => {
  const panel = buildSearchResultPanelState({
    query: "market update",
    summary: "Summarized the latest market signals.",
    searchConfidence: {
      tone: "success",
      title: "Higher-confidence preview",
      detail: "Grounded in 3 sources.",
    },
    evidenceOrigin: {
      tone: "info",
      title: "Mixed evidence",
      detail: "Grounded in mixed sources.",
    },
    localRouterCompanion: {
      tone: "warning",
      title: "Local retrieval preview",
      detail: "Local router ran to the deep layer.",
      stats: [{ label: "Sources", value: "2" }],
      badges: ["Local index", "Latency cap reached"],
    },
    bullets: ["Point one", "Point two"],
    refinementSuggestions: ["Limit to a recent time window"],
    sourceItems: [
      { title: "Source A", url: "https://a.example.com", subtitle: "External - a.example.com - snippet" },
    ],
  });

  assert.equal(panel.title, 'Search result for "market update"');
  assert.equal(panel.nodes.length, 9);
  assert.deepEqual(panel.nodes[0], {
    id: "search-summary",
    type: "callout",
    props: {
      tone: "info",
      title: "Research summary",
      body: "Summarized the latest market signals.",
    },
  });
  assert.equal(panel.nodes[3].id, "search-local-router");
  assert.equal(panel.nodes[4].id, "search-local-router-stats");
  assert.equal(panel.nodes[5].id, "search-local-router-badges");
  assert.equal(panel.nodes[6].id, "search-bullets");
  assert.equal(panel.nodes[7].id, "search-refinements");
  assert.equal(panel.nodes[8].id, "search-sources");
});

test("search result panel state omits optional sections when inputs are empty", () => {
  const panel = buildSearchResultPanelState({
    query: "",
    summary: "No sources available.",
    searchConfidence: {
      tone: "warning",
      title: "Low-confidence preview",
      detail: "No explicit source links were attached.",
    },
    evidenceOrigin: {
      tone: "warning",
      title: "No explicit evidence sources",
      detail: "This preview does not yet distinguish workspace ledger evidence from external web sources.",
    },
    localRouterCompanion: null,
    bullets: [],
    refinementSuggestions: [],
    sourceItems: [],
  });

  assert.equal(panel.title, "Search result");
  assert.equal(panel.nodes.length, 3);
  assert.deepEqual(
    panel.nodes.map((node) => node.id),
    ["search-summary", "search-evidence-origin", "search-confidence"],
  );
});
