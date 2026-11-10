import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(
  resolve(process.cwd(), "src/components/WeddingVendorSearchHomeSections.tsx"),
  "utf8",
);
const responseQueueSource = readFileSync(
  resolve(process.cwd(), "src/components/ResponseQueueView.tsx"),
  "utf8",
);
const copySource = readFileSync(
  resolve(process.cwd(), "src/lib/weddingHomeUiCopyState.ts"),
  "utf8",
);

test("vendor search uses native form submission so Enter and the button share one action", () => {
  assert.match(source, /<form[\s\S]*onSubmit=\{\(event\) => \{/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /type="submit"/);
  assert.match(source, /workspace\(\)\.onRunLiveVendorSearch\?\.\(\{ category \}\)/);
});

test("vendor search preserves native caret and word or sentence selection", () => {
  assert.doesNotMatch(source, /onFocus=\{selectQuery\}/);
  assert.doesNotMatch(source, /onPointerUp=\{\(event\) => \{[\s\S]*selectQuery\(event\)/);
  assert.doesNotMatch(source, /event\.currentTarget\.select\(\)/);
});

test("vendor search owns Enter rather than an armed global action", () => {
  const magicPointer = readFileSync(resolve(process.cwd(), "src/components/MagicPointer.tsx"), "utf8");
  assert.match(magicPointer, /e\.defaultPrevented \|\| isEditableTarget\(e\.target\)/);
});

test("provider readiness does not disable a named directory lookup", () => {
  assert.doesNotMatch(source, /\|\| Boolean\(workspace\(\)\.vendorSearchBlockedReason\)/);
  assert.match(source, /weddingVendorSearchBlockedCopy/);
  assert.match(copySource, /You can still search by name/);
});

test("full vendor search evidence expands and closes in place", () => {
  assert.match(source, /See all results/);
  assert.match(source, /aria-controls="wedding-vendor-search-full-result"/);
  assert.match(source, /result\(\)\.sourcePreview\?\.bodyText/);
  assert.match(source, /setFullResultExpanded\(false\)/);
});

test("vendor lifecycle filters keep the vendor brief and mount evidence-backed workflow tabs in place", () => {
  const panel = readFileSync(resolve(process.cwd(), "src/components/WeddingVendorLifecycleDetailPanel.tsx"), "utf8");
  assert.match(source, /About this vendor/);
  assert.match(source, /Conversation history/);
  assert.match(source, /WeddingVendorLifecycleDetailPanel/);
  assert.match(source, /View vendor, conversation and files/);
  assert.match(panel, /label: "Message"/);
  assert.match(panel, /label: "Quote"/);
  assert.match(panel, /label: "Booking"/);
  assert.match(panel, /Add another vendor quote/);
  assert.match(panel, /Open original quote/);
});

test("category chips preserve visible wording and pass category as a separate search constraint", () => {
  assert.doesNotMatch(source, /onVendorSearchQueryChange\?\.\(query\)/);
  assert.match(source, /setSelectedVendorCategory\(query\)/);
  assert.match(source, /onRunLiveVendorSearch\?\.\(options\)/);
  assert.match(responseQueueSource, /const freeformQuery = currentWeddingVendorSearchQuery\(\)/);
  assert.match(responseQueueSource, /queryIntent\.category \?\? options\?\.category/);
  assert.match(source, /label: "Venues", query: "venue"/);
  assert.match(source, /label: "Musicians", query: "band"/);
});

test("completed comparisons suppress the readiness-only notice and scroll the result into view", () => {
  assert.match(source, /when=\{!props\.result\}/);
  assert.match(source, /comparisonResultElement\?\.scrollIntoView/);
  assert.match(source, /ref=\{comparisonResultElement\}/);
});

test("a manual vendor search remains on the vendor surface when it launches and completes", () => {
  assert.match(responseQueueSource, /function applyWeddingVendorSearchLaunch[\s\S]*setWeddingWorkspaceMenu\("response_queue"\)/);
  assert.match(responseQueueSource, /setWeddingWorkspaceMenu\(options\?\.stayOnHome \? "home" : "response_queue"\)/);
  assert.doesNotMatch(responseQueueSource, /options\?\.stayOnHome === false \? "documents" : "home"/);
});

test("an explicit freeform search can return candidates while omitted facts remain verification gaps", () => {
  assert.match(responseQueueSource, /!freeformQuery && liveWorkflowReadiness\.status === "blocked"/);
  assert.match(responseQueueSource, /vendorPreferences: freeformQuery[\s\S]*queryIntent\.preferences \?\? freeformQuery/);
});
