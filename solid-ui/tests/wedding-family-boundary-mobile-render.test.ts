import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const intake = read("src/components/WeddingSiteIntakeWizard.tsx");
const boundary = read("src/components/WeddingBoundaryManagementCard.tsx");
const mobilePage = read("src/components/WeddingMobilePage.tsx");
const app = read("src/App.tsx");

test("atmosphere photographs toggle exact selections without technical image copy", () => {
  assert.match(intake, /selectedIndex >= 0/);
  assert.match(intake, /parts\.filter\(\(_, index\) => index !== selectedIndex\)/);
  assert.match(intake, /Select a photograph again to remove it\./);
  assert.doesNotMatch(intake, /local WebP thumbnails/i);
});
test("Wedding mobile content removes the desktop outer frame while retaining inner cards", () => {
  assert.match(mobilePage, /wedding-mobile-content[\s\S]*px-0/);
  assert.match(app, /weddingReturnContextActive\(\) && activeView\(\) === "response_queue" \? "p-0 sm:p-6"/);
  assert.match(app, /phone:rounded-none phone:border-0 phone:bg-transparent phone:shadow-none/);
});

test("Family boundaries prioritises request and household metrics and discloses existing controls", () => {
  assert.match(boundary, /Manage requests and family permissions/);
  assert.match(boundary, />Requests</);
  assert.match(boundary, /pendingReviewCount\(\)/);
  assert.match(boundary, />Households</);
  assert.match(boundary, /props\.state\.householdCount/);
  assert.match(boundary, /aria-controls="wedding-family-boundary-details"/);
  assert.match(boundary, /<Show when=\{expanded\(\)\}>/);
  assert.doesNotMatch(boundary, />Shared</);
});
