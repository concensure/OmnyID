import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("wedding menu changes update the application breadcrumb", () => {
  const queue = read("src/components/ResponseQueueView.tsx");
  const breadcrumb = read("src/components/WorkspaceBreadcrumbTrail.tsx");
  assert.match(queue, /menuChanged[\s\S]*dispatchWeddingWorkspaceMenuSelection\(menuId\)/);
  assert.match(breadcrumb, /WEDDING_WORKSPACE_MENU_EVENT/);
  assert.match(breadcrumb, /\["timeline", "tasks", "response_queue"\][\s\S]*menu: "plan"/);
  assert.match(breadcrumb, /\["guests", "seating"\][\s\S]*menu: "people"/);
});

test("home logistics opens its owning timeline without leaking into Calendar", () => {
  const overview = read("src/components/WeddingHomeOverviewGrid.tsx");
  const openTimeline = overview.match(/const openTimeline = \(\) => \{([\s\S]*?)\n  \};/)?.[1] ?? "";
  assert.match(openTimeline, /onSelectMenu/);
  assert.doesNotMatch(openTimeline, /onSidebarAction|open_calendar|weddingTimelinePrimarySidebarAction/);
});

test("seating apply saves and confirms in place instead of opening Tasks", () => {
  const seating = read("src/components/WeddingSeatingPanel.tsx");
  const apply = seating.match(/async function applySeatingDraft\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
  assert.match(apply, /weddingSeatingOptimizationResultToAfpSendInput/);
  assert.match(apply, /Seating plan applied/);
  assert.doesNotMatch(apply, /onSidebarAction|open_tasks/);
});

test("wedding task actions stay inside the template and share People completion storage", () => {
  const queue = read("src/components/ResponseQueueView.tsx");
  const tasks = read("src/components/WeddingPlanningTasksPanel.tsx");
  const people = read("src/components/WeddingHelpersPanel.tsx");
  assert.match(queue, /action\.kind === "open_tasks"[\s\S]*setWeddingWorkspaceMenu\("tasks"\)/);
  assert.match(tasks, /props\.state\.planningTaskItems/);
  assert.match(tasks, /loadWeddingHelperLocalState/);
  assert.match(tasks, /WeddingTaskCompletionButton/);
  assert.match(tasks, /loadWeddingTaskCompletion/);
  assert.match(people, /props\.state\.planningTaskItems/);
  assert.match(people, /saveWeddingHelperLocalState/);
});
