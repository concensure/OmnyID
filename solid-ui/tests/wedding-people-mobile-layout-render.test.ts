import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const contextPanels = readFileSync(
  resolve(process.cwd(), "src/components/WeddingWorkspaceContextPanels.tsx"),
  "utf8",
);
const peopleHub = readFileSync(
  resolve(process.cwd(), "src/components/WeddingPeopleHub.tsx"),
  "utf8",
);
const mobilePage = readFileSync(
  resolve(process.cwd(), "src/components/WeddingMobilePage.tsx"),
  "utf8",
);

test("People summary stacks semantic status shortcuts until the tablet breakpoint", () => {
  assert.match(contextPanels, /<WeddingPeopleHub state=\{peopleAggregate\(\)\}/);
  assert.match(peopleHub, /grid grid-cols-1 gap-2 sm:flex sm:flex-wrap/);
  assert.match(peopleHub, /aria-label="People status shortcuts"/);
  assert.match(peopleHub, /statusClasses\(item\.tone\)/);
  assert.match(peopleHub, /item\.targetMenu === "seating" \? "Seating Plan" : "Guests and family boundaries"/);
  assert.match(peopleHub, /border-wedding-status-progress-ink\/20 bg-wedding-status-progress-bg/);
  assert.match(peopleHub, /border-wedding-status-track-ink\/20 bg-wedding-status-track-bg/);
});

test("People action cards are equal-height whole-card controls with bottom-aligned concise CTAs", () => {
  assert.match(peopleHub, /grid items-stretch gap-4 sm:grid-cols-2/);
  assert.match(peopleHub, /group flex h-full min-h-\[18rem\][\s\S]*flex-col rounded-xl/);
  assert.match(peopleHub, /<span data-people-cta class="mt-auto flex min-h-12 w-full/);
  assert.match(peopleHub, /action\.ctaLabel \?\? `Open \$\{action\.title\}`/);
  assert.match(peopleHub, /<For each=\{action\.metaItems \?\? \[action\.metaLabel\]\}>/);
  assert.doesNotMatch(peopleHub, /bg-amber-900/);
});

test("mobile pages reserve only the compact tab-bar safe area", () => {
  assert.match(mobilePage, /pb-\[calc\(3\.5rem\+env\(safe-area-inset-bottom\)\)\]/);
});
