import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const documentsPanel = readFileSync(resolve(process.cwd(), "src/components/WeddingWorkspaceDocumentsPanel.tsx"), "utf8");
const workspaceView = readFileSync(resolve(process.cwd(), "src/components/WeddingResponseWorkspaceView.tsx"), "utf8");
const mobilePage = readFileSync(resolve(process.cwd(), "src/components/WeddingMobilePage.tsx"), "utf8");
const mobileDeck = readFileSync(resolve(process.cwd(), "src/components/MobileFocusDeck.tsx"), "utf8");
const mobileFocus = readFileSync(resolve(process.cwd(), "src/components/WeddingMobileFocusHome.tsx"), "utf8");
const templateFollowUp = readFileSync(resolve(process.cwd(), "src/lib/weddingTemplateFollowUpState.ts"), "utf8");
const personalOs = readFileSync(resolve(process.cwd(), "src/lib/weddingPersonalOsProjectionState.ts"), "utf8");

test("mobile Documents uses one coherent toolbar, privacy row, and export card", () => {
  assert.match(documentsPanel, /grid grid-cols-2 gap-2 sm:flex sm:flex-wrap/);
  assert.match(documentsPanel, /rounded-xl bg-slate-900/);
  assert.match(documentsPanel, /rounded-2xl border border-slate-200 bg-white/);
  assert.match(documentsPanel, /Export plan/);
  assert.match(documentsPanel, /wedding:documents:download-plan/);
  assert.match(mobilePage, /pb-\[calc\(10rem\+env\(safe-area-inset-bottom\)\)\]/);
});

test("mobile wedding surfaces remove redundant chrome without removing actions", () => {
  assert.match(workspaceView, /phone:rounded-none phone:border-0 phone:bg-transparent phone:shadow-none/);
  assert.match(workspaceView, /hidden min-h-11[\s\S]*sm:inline-flex/);
  assert.match(mobileDeck, /phone:rounded-none phone:border-0 phone:bg-transparent phone:px-0 phone:shadow-none/);
  assert.match(mobileDeck, /!props\.sequential && event\.key === "ArrowRight"/);
  assert.match(mobileFocus, /label=\{mobileFocusMode\(\) === "responses" \? "Response" : "Decision"\}[\s\S]*sequential/);
  assert.match(mobileFocus, /immersive=\{clearDecisionView\(\) \|\| \(!selectedSection\(\) && mobileFocusMode\(\) !== "overview"\)\}/);
  assert.doesNotMatch(mobileFocus, /Decision"\} \$\{Math\.min\(position/);
  assert.match(mobileDeck, /primaryActionLabel/);
  assert.doesNotMatch(mobileDeck, />Approve<\/button>/);
  assert.match(mobileFocus, /if \(openVendorResearch\(item\)\) return/);
  assert.match(mobileFocus, /setMobileFocusSingleCardSectionId\("vendor_search"\)/);
  assert.match(mobileFocus, /hasVendorShortlist\(item\) \? "Open shortlist" : "Search vendors"/);
});

test("operator-only vendor provider setup and technical freshness copy stay out of decision cards", () => {
  assert.match(templateFollowUp, /if \(vendorSearch\.status !== "blocked"\) return \[\]/);
  assert.doesNotMatch(templateFollowUp, /Connect live vendor-search provider before presenting vendor matches/);
  assert.match(personalOs, /Review the shortlist and choose who you want to contact/);
  assert.doesNotMatch(personalOs, /Vendor search results need source freshness/);
});
