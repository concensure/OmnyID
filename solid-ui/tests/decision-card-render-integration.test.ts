import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("general and wedding decision surfaces share the native DecisionCard renderer", () => {
  const queue = read("src/components/DecisionQueuePanels.tsx");
  const wedding = read("src/components/WeddingDecisionFocusCard.tsx");
  const mobile = read("src/components/WeddingMobileFocusHome.tsx");

  assert.match(queue, /<DecisionCard[\s\S]*decisionCardFromQueueEntry/);
  assert.match(wedding, /<DecisionCard[\s\S]*decisionCardFromWeddingFocus/);
  assert.match(mobile, /<DecisionCard[\s\S]*decisionCardFromFocusDeckItem/);
});

test("live vendor research reuses the photo-aware vendor choice card on laptop", () => {
  const workspace = read("src/components/WeddingResponseWorkspaceView.tsx");
  const presentation = read("src/lib/weddingResponseWorkspacePresentationState.ts");

  assert.match(workspace, /preview\(\)\.vendorComparisonCards\.slice\(0, 3\)[\s\S]*<WeddingVendorChoiceCard/);
  assert.match(workspace, /onContactVendor=\{\(card\) => void vendorOutreach\.onContactVendor\(card, action\(\)\.artifactId\)\}/);
  assert.match(presentation, /vendor-photo\\\/google[\s\S]*return url/);
  assert.doesNotMatch(presentation, /apiUrlForPath\(url\)/);
});
