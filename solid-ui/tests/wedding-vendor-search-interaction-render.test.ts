import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(
  resolve(process.cwd(), "src/components/WeddingVendorSearchHomeSections.tsx"),
  "utf8",
);

test("vendor search uses native form submission so Enter and the button share one action", () => {
  assert.match(source, /<form[\s\S]*onSubmit=\{\(event\) => \{/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /type="submit"/);
  assert.match(source, /workspace\(\)\.onRunLiveVendorSearch\?\.\(\)/);
});

test("full vendor search evidence expands and closes in place", () => {
  assert.match(source, /Show full search result/);
  assert.match(source, /aria-controls="wedding-vendor-search-full-result"/);
  assert.match(source, /result\(\)\.sourcePreview\?\.bodyText/);
  assert.match(source, /setFullResultExpanded\(false\)/);
  assert.doesNotMatch(source, /Open in Documents/);
});
