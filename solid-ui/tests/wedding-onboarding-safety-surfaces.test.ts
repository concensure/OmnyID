import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("onboarding uses compact local photos and confirmation for clearing vendor choices", () => {
  const intake = read("../src/components/WeddingSiteIntakeWizard.tsx");
  assert.match(intake, /assets\/images\/quiz\/restaurant\.webp/);
  assert.match(intake, /loading=\{index\(\) < 2 \? "eager" : "lazy"\}/);
  assert.match(intake, /WeddingConfirmDialog/);
  assert.match(intake, /Clear your first vendor choices/);
});

test("seating instructions are persistent and material saves are confirmed", () => {
  const panel = read("../src/components/WeddingSeatingPanel.tsx");
  const canvas = read("../src/components/WeddingSeatingCanvas.tsx");
  assert.match(panel, /Click or tap a guest/);
  assert.match(panel, /Apply this seating change/);
  assert.match(canvas, /Click any guest and then a table/);
});

test("operator blog uploads are database-backed and require a publish confirmation", () => {
  const publisher = read("../src/components/UsageAdminWeddingBlogPublisher.tsx");
  const migration = read("../../postgres/migrations/0120_wedding_blog_publications.sql");
  assert.match(publisher, /Nothing is uploaded until you confirm/);
  assert.match(publisher, /Publish this article now/);
  assert.match(migration, /wedding_blog_publications/);
});
