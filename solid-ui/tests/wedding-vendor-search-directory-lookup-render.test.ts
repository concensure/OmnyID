import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("named vendor lookups retain an exact local directory pass without intake or provider gating", () => {
  const source = read("src/components/ResponseQueueView.tsx");
  assert.match(source, /const queryIntent = weddingVendorQueryIntent\(freeformQuery\)/);
  assert.match(source, /const directoryLookupOnly = Boolean\(freeformQuery && queryIntent\.exactNameLookup\)/);
  assert.match(source, /if \(!directoryLookupOnly && !freeformQuery && liveWorkflowReadiness\.status === "blocked"\)/);
  assert.match(source, /if \(!directoryLookupOnly && readiness\.status === "blocked"\)/);
  assert.match(source, /canRunOnlineFallback: !directoryLookupOnly && configuredProviderKinds\.length > 0/);
  assert.match(source, /sourcePolicy === "directory_only" && directoryLookupOnly \? \[\] : providerPlansForExecution/);
});

test("a source-only vendor result cannot crash Planner when an old cached packet lacks cards", () => {
  const source = read("src/components/WeddingVendorSearchHomeSections.tsx");
  assert.match(source, /Array\.isArray\(preview\(\)\.vendorComparisonCards\)/);
  assert.match(source, /vendorComparisonCards: \[\]/);
});

test("an older vendor card without personalised evidence rows remains renderable", () => {
  const source = read("src/components/WeddingVendorChoiceCard.tsx");
  assert.match(source, /Array\.isArray\(card\.anchorRows\)/);
  assert.match(source, /Array\.isArray\(card\.verifyQuestions\)/);
  assert.match(source, /Array\.isArray\(card\.rooms\)/);
  assert.match(source, /typeof card\.checkedFactsCount === "number"/);
});

test("mobile decision saves receive the authenticated wedding account identity", () => {
  const source = read("src/components/WeddingMobileFocusHome.tsx");
  const workspace = read("src/components/WeddingResponseWorkspaceView.tsx");
  assert.match(source, /userId: props\.userId/);
  assert.match(workspace, /saveProjection=\{props\.saveProjection\}[\s\S]*userId=\{props\.contactUserId\}/);
});
