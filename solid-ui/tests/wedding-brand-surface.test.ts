import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const config = require("../tailwind.config.cjs") as { theme: { extend: { colors: Record<string, string> } } };
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("wedding planner brand tokens match design-system section 11", () => {
  const colors = config.theme.extend.colors;
  assert.deepEqual({
    page: colors["wedding-page"],
    primary: colors["wedding-primary"],
    secondary: colors["wedding-secondary"],
    border: colors["wedding-border"],
    card: colors["wedding-card"],
    ink: colors["wedding-ink"],
    slate: colors["wedding-slate"],
  }, {
    page: "#FAF7F2",
    primary: "#0F5F5A",
    secondary: "#274B77",
    border: "#E8E2D9",
    card: "#FFFFFF",
    ink: "#1F1A17",
    slate: "#EFEBE4",
  });
  assert.match(read("../docs/DESIGN_SYSTEM.md"), /## 11\. Wedding Planner Surface[\s\S]*Radius 8px or 12px/);
});

test("migrated home and decision surfaces use the teal brand without old rose or plum tokens", () => {
  const paths = [
    "src/components/WeddingHomeOverviewGrid.tsx",
    "src/components/WeddingPlanningJourneyStepper.tsx",
    "src/components/WeddingVendorSearchHomeSections.tsx",
    "src/components/WeddingVendorChoiceCard.tsx",
    "src/components/WeddingMobilePage.tsx",
    "src/components/WeddingMobileAppBar.tsx",
    "src/components/WeddingMobileTabBar.tsx",
    "src/components/WeddingDateEntryControl.tsx",
  ];
  const source = paths.map(read).join("\n");
  assert.match(source, /wedding-primary/);
  assert.match(source, /wedding-page/);
  assert.match(source, /wedding-secondary/);
  assert.match(source, /wedding-border/);
  assert.match(source, /wedding-card/);
  assert.doesNotMatch(source, /wedding-(?:accent|cta|plum|bubblegum|butter|surface-blush|tile-)/);
  assert.doesNotMatch(source, /rounded-\[(?:24|28|32)px\]/);
});

test("home uses task-bound journey and preserves the separate mobile navigation shell", () => {
  const overview = read("src/components/WeddingHomeOverviewGrid.tsx");
  const journey = read("src/components/WeddingPlanningJourneyStepper.tsx");
  const mobilePage = read("src/components/WeddingMobilePage.tsx");
  assert.match(overview, /WeddingPlanningJourneyStepper/);
  assert.match(overview, /aria-label="Wedding plan up next"/);
  assert.match(overview, /Saved vendors/);
  assert.match(journey, /completed\(\).*planning tasks complete/);
  assert.match(mobilePage, /WeddingMobileTabBar/);
  assert.match(mobilePage, /bg-wedding-page/);
});

test("wedding decisions expose best fit, checked facts, risk notes, and rectangular actions", () => {
  const source = read("src/components/DecisionCard.tsx");
  assert.match(source, /"Best fit"/);
  assert.match(source, /card\(\)\.evidence\.slice/);
  assert.match(source, /Still to confirm:/);
  assert.match(source, /rounded-lg px-4 py-2/);
  assert.match(source, /border-l-4 border-l-wedding-primary/);
});
