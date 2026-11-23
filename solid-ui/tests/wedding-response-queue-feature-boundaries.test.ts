import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("response queue defers large Wedding feature surfaces behind explicit boundaries", () => {
  const queue = read("src/components/ResponseQueueView.tsx");
  const boundaries = read("src/components/WeddingResponseQueueFeatureSurfaces.tsx");

  assert.doesNotMatch(queue, /import \{ WeddingResponseWorkspaceView \}/);
  assert.doesNotMatch(queue, /import \{ WeddingSiteIntakeWizard \}/);
  assert.doesNotMatch(queue, /import \{ WeddingRichResponseView \}/);
  assert.match(queue, /<WeddingResponseFeatureBoundary label=/);
  assert.match(queue, /<LazyWeddingResponseWorkspaceView/);
  assert.match(queue, /<LazyWeddingSiteIntakeWizard/);
  assert.match(queue, /<LazyWeddingRichResponseView/);

  assert.match(boundaries, /lazy\(\(\) =>\s*import\("@\/components\/WeddingResponseWorkspaceView"\)/);
  assert.match(boundaries, /lazy\(\(\) =>\s*import\("@\/components\/WeddingSiteIntakeWizard"\)/);
  assert.match(boundaries, /lazy\(\(\) =>\s*import\("@\/components\/WeddingRichResponseView"\)/);
});

test("deferred Wedding surfaces announce a stable accessible loading state", () => {
  const boundaries = read("src/components/WeddingResponseQueueFeatureSurfaces.tsx");

  assert.match(boundaries, /role="status"/);
  assert.match(boundaries, /aria-live="polite"/);
  assert.match(boundaries, /rounded-2xl/);
  assert.match(boundaries, /Loading…/);
  assert.match(boundaries, /<ErrorBoundary/);
  assert.match(boundaries, /role="alert"/);
  assert.match(boundaries, /Your saved planning details have not changed\./);
  assert.match(boundaries, /Reload this view/);
});
