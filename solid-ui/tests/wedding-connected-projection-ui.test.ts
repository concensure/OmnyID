import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("task status and journey stage filters compose from one completion projection", () => {
  const panel = read("src/components/WeddingPlanningTasksPanel.tsx");
  const button = read("src/components/WeddingTaskCompletionButton.tsx");
  assert.match(panel, /stageFilter/);
  assert.match(panel, /Filter wedding tasks by stage/);
  assert.match(panel, /weddingJourneyStageId\(task\) === stageFilter\(\)/);
  assert.match(panel, /completed=\{isDone\(task\)\}/);
  assert.match(button, /props\.completed/);
  assert.match(button, /Move back to to-do/);
  assert.match(button, /Mark done/);
});

test("vendor lifecycle rows open matched Documents and map guidance is a link", () => {
  const search = read("src/components/WeddingVendorSearchHomeSections.tsx");
  const detail = read("src/components/WeddingArtifactDetailPanel.tsx");
  const queue = read("src/components/ResponseQueueView.tsx");
  assert.match(search, /lifecycleArtifact/);
  assert.match(search, /onSelectArtifact/);
  assert.match(search, /onSelectMenu\?\.\("documents"\)/);
  assert.match(detail, /href=\{preview\.locationSearchUrl\}/);
  assert.match(queue, /freeformQuery && !queryIntent\.category/);
});

test("RSVP defaults names from profile and guest summary counts filter in place", () => {
  const context = read("src/components/WeddingWorkspaceContextPanels.tsx");
  const setup = read("src/components/WeddingRsvpSetupPanel.tsx");
  const guests = read("src/components/WeddingGuestOperationsCard.tsx");
  assert.match(context, /rsvpHostLabel/);
  assert.match(setup, /defaultHostLabel/);
  assert.match(guests, /aria-pressed=\{guestFilter\(\) === "Replied"\}/);
  assert.match(guests, /filteredGuestRows/);
  assert.match(guests, /WeddingDashboardIcon id="check-circle"/);
  assert.match(context, /activeMenu\(\) !== "guests" && activeMenu\(\) !== "people"/);
});

test("the More sheet exposes Guests, helpers, Documents and Inspiration without a parallel hub", () => {
  const more = read("src/components/WeddingMobileMoreSheet.tsx");
  assert.match(more, /Guests & RSVP/);
  assert.match(more, /Who is helping/);
  assert.match(more, /Documents/);
  assert.match(more, /Inspiration/);
});

test("wedding projection uses the authenticated session before bootstrap arrives", () => {
  const app = read("src/App.tsx");
  const queue = read("src/components/ResponseQueueView.tsx");
  const vite = read("vite.config.mjs");
  assert.match(app, /sessionUser=\{session\(\)\?\.user \?\? null\}/);
  assert.match(app, /signedIn=\{Boolean\(session\(\)\?\.token\)\}/);
  assert.match(queue, /props\.sessionUser \?\? bootstrap\(\)\?\.user/);
  assert.match(queue, /props\.signedIn \?\?/);
  assert.match(vite, /"\/notes": \{ target: apiProxyTarget/);
});
