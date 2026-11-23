import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("operator workspace mounts the client-side Binder co-branding tool", () => {
  const operator = read("solid-ui/src/components/UsageOperatorSection.tsx");
  const panel = read("solid-ui/src/components/UsageAdminWeddingBinderCobrandPanel.tsx");

  assert.match(operator, /<UsageAdminWeddingBinderCobrandPanel\s*\/>/);
  assert.match(panel, /wedding-day-binder-print\.pdf/);
  assert.match(panel, /pdfjs-dist/);
  assert.match(panel, /image\/png/);
  assert.match(panel, /image\/jpeg/);
  assert.match(panel, /The source PDF is never changed/);
  assert.match(panel, /Use only logos you have permission to reproduce/);
});

test("co-branding export stays local and requires an uploaded logo", () => {
  const panel = read("solid-ui/src/components/UsageAdminWeddingBinderCobrandPanel.tsx");

  assert.match(panel, /canvas\.toBlob/);
  assert.match(panel, /disabled=\{!logoReady\(\) \|\| busy\(\)\}/);
  assert.doesNotMatch(panel, /apiFetch|fetch\([^)]*,\s*\{[^}]*method:\s*["']POST/);
});
