import test from "node:test";
import assert from "node:assert/strict";

import {
  searchPreviewConfidence,
  searchPreviewEvidenceOrigin,
  searchPreviewIsLikelyWorkspaceLink,
  searchPreviewRefinementSuggestions,
  searchPreviewSourceDomain,
  searchPreviewSourceSubtitle,
} from "../src/lib/searchPreviewState.js";

test("search preview helpers summarize confidence and evidence origin", () => {
  assert.deepEqual(
    searchPreviewConfidence({ sourceCount: 3, bulletCount: 2 }),
    {
      tone: "success",
      title: "Higher-confidence preview",
      detail: "Grounded in 3 sources with 2 extracted research signals.",
    },
  );
  assert.deepEqual(
    searchPreviewConfidence({ sourceCount: 1, bulletCount: 0 }),
    {
      tone: "info",
      title: "Moderate-confidence preview",
      detail: "Grounded in 1 source; refine if you want narrower or fresher evidence.",
    },
  );
  assert.equal(searchPreviewSourceDomain("https://www.example.com/path"), "example.com");
  assert.equal(searchPreviewSourceDomain("not a url"), null);

  const workspaceLink = {
    url: "omnyid://thread/123",
    snippet: "workspace ledger thread",
    origin: null,
  };
  const externalLink = {
    url: "https://news.example.com/story",
    snippet: "external coverage",
    origin: "external",
  };
  assert.equal(searchPreviewIsLikelyWorkspaceLink(workspaceLink), true);
  assert.equal(searchPreviewIsLikelyWorkspaceLink(externalLink), false);
  assert.equal(
    searchPreviewSourceSubtitle(workspaceLink),
    "Workspace - thread - workspace ledger thread",
  );
  assert.equal(
    searchPreviewSourceSubtitle(externalLink),
    "External - news.example.com - external coverage",
  );

  assert.deepEqual(
    searchPreviewEvidenceOrigin([]),
    {
      tone: "warning",
      title: "No explicit evidence sources",
      detail: "This preview does not yet distinguish workspace ledger evidence from external web sources.",
    },
  );
  assert.deepEqual(
    searchPreviewEvidenceOrigin([workspaceLink, externalLink]),
    {
      tone: "info",
      title: "Mixed evidence",
      detail: "Grounded in 1 workspace source and 1 external source.",
    },
  );
});

test("search preview helpers suggest refinements from query and sources", () => {
  assert.deepEqual(
    searchPreviewRefinementSuggestions({
      query: "market update",
      links: [
        { url: "https://a.example.com/1", snippet: "a", origin: "external" },
        { url: "https://b.example.com/2", snippet: "b", origin: "external" },
      ],
    }),
    [
      "Limit to a recent time window",
      "Ask for a comparison or trade-off view",
      "Focus on one source family such as a.example.com",
      "Ask for only local workspace evidence if you want ledger-grounded results",
    ],
  );
  assert.deepEqual(
    searchPreviewRefinementSuggestions({
      query: "compare workspace notes from last 7 days",
      links: [{ url: "omnyid://thread/123", snippet: "workspace notes", origin: "workspace" }],
    }),
    [],
  );
});
