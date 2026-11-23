import test from "node:test";
import assert from "node:assert/strict";

import { CATALOG } from "../src/lib/toolCatalog.ts";

test("external billing providers are present in the catalog with per-provider billing metadata", () => {
  const required = [
    "firecrawl",
    "bright-data",
    "newsapi-org",
    "newsapi-ai",
    "exa",
    "tavily",
    "brave-search-api",
  ];

  for (const slug of required) {
    const entry = CATALOG.find((tool) => tool.slug === slug);
    assert.ok(entry, `missing catalog entry for ${slug}`);
    assert.ok(entry?.billing, `missing billing metadata for ${slug}`);
    assert.equal(typeof entry?.billing?.pricing_summary, "string");
    assert.ok((entry?.billing?.pricing_summary?.length ?? 0) > 0);
    assert.equal(typeof entry?.billing?.provider_key, "string");
    assert.equal(typeof entry?.billing?.provider_category, "string");
  }
});

test("NewsAPI.org is marked with a production caveat instead of being presented as a normal free production provider", () => {
  const entry = CATALOG.find((tool) => tool.slug === "newsapi-org");
  assert.ok(entry);
  assert.equal(entry?.billing?.billing_model, "free_dev_only");
  assert.ok(entry?.billing?.production_caveat?.toLowerCase().includes("production"));
  assert.equal(entry?.billing?.default_usage_unit, "requests");
});
