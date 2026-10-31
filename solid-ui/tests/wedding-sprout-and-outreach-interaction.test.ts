import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { formatWeddingVendorOutreachParagraphs } from "../src/lib/useWeddingVendorOutreachOwner.ts";

const personaFab = readFileSync(resolve(process.cwd(), "src/components/AgentPersonaFAB.tsx"), "utf8");
const choiceCard = readFileSync(resolve(process.cwd(), "src/components/WeddingVendorChoiceCard.tsx"), "utf8");
const vendorSearch = readFileSync(resolve(process.cwd(), "src/components/WeddingVendorSearchHomeSections.tsx"), "utf8");
const infoTip = readFileSync(resolve(process.cwd(), "src/components/WeddingInfoTip.tsx"), "utf8");
const customizer = readFileSync(resolve(process.cwd(), "src/components/ViewCustomizer.tsx"), "utf8");
const workspaceView = readFileSync(resolve(process.cwd(), "src/components/WeddingResponseWorkspaceView.tsx"), "utf8");
const helpersPanel = readFileSync(resolve(process.cwd(), "src/components/WeddingHelpersPanel.tsx"), "utf8");
const helpersState = readFileSync(resolve(process.cwd(), "src/lib/weddingHelpersPanelState.ts"), "utf8");
const budgetTracker = readFileSync(resolve(process.cwd(), "src/components/WeddingBudgetTrackerCard.tsx"), "utf8");
const timelinePanel = readFileSync(resolve(process.cwd(), "src/components/WeddingTimelinePanel.tsx"), "utf8");
const outreachComposer = readFileSync(resolve(process.cwd(), "src/components/WeddingVendorOutreachComposer.tsx"), "utf8");
const followUpPanel = readFileSync(resolve(process.cwd(), "src/components/WeddingVendorFollowUpPanel.tsx"), "utf8");
const responseQueue = readFileSync(resolve(process.cwd(), "src/components/ResponseQueueView.tsx"), "utf8");
const followUpApi = readFileSync(resolve(process.cwd(), "src/lib/weddingVendorFollowUpApi.ts"), "utf8");
const editor = readFileSync(resolve(process.cwd(), "src/components/editor/TiptapEditor.tsx"), "utf8");
const taskHelp = readFileSync(resolve(process.cwd(), "src/components/WeddingTaskContextHelp.tsx"), "utf8");

test("Sprout performs its initial persona load before enabling template actions", () => {
  assert.match(personaFab, /reloadPersonas\(options\?: \{ initial\?: boolean \}\)/);
  assert.match(personaFab, /onMount\(\(\) => void reloadPersonas\(\{ initial: true \}\)\)/);
  assert.match(personaFab, /!options\?\.initial && personaReloadBlocked/);
});

test("provider outreach drafts are displayed and sent as readable paragraphs", () => {
  assert.equal(
    formatWeddingVendorOutreachParagraphs("Hello River team. We are planning our wedding. Could you share availability? Thank you."),
    "Hello River team.\n\nWe are planning our wedding.\n\nCould you share availability?\n\nThank you.",
  );
  assert.equal(
    formatWeddingVendorOutreachParagraphs("Hello River team.\n\nCould you share availability?"),
    "Hello River team.\n\nCould you share availability?",
  );
});

test("vendor outreach uses the shared rich editor with email formatting controls", () => {
  assert.match(outreachComposer, /<TiptapEditor/);
  assert.match(outreachComposer, /mode="email"/);
  assert.match(outreachComposer, /showToolbar=\{true\}/);
  assert.match(outreachComposer, /onBodyChange\(markdown, html\)/);
  assert.match(editor, /editorReady\(\) && showToolbar\(\)/);
  assert.match(outreachComposer, /Array\.from\(event\.currentTarget\.files \?\? \[\]\)/);
  assert.match(outreachComposer, /will be sent with this enquiry after you approve it/);
});

test("unknown wedding costs expose a focused hover and keyboard help tip", () => {
  assert.match(taskHelp, /verify unknown wedding costs/i);
  assert.match(taskHelp, /minimum spend/);
  assert.match(taskHelp, /cancellation terms/);
  assert.match(taskHelp, /WeddingInfoTip/);
});

test("live wedding workspace does not manufacture demo artifacts", () => {
  assert.doesNotMatch(responseQueue, /buildWeddingTemplateDemoState/);
  assert.doesNotMatch(responseQueue, /demo:wedding_workspace_bridge/);
});

test("follow-up date edits have controlled input, an explicit save, and a schedule-only API", () => {
  assert.match(followUpPanel, /type="date"/);
  assert.match(followUpPanel, /onInput=.*setFollowUpDate/);
  assert.match(followUpPanel, />\{dateSaving\(\) \? [^:]+ : "Save"\}<\/button>/);
  assert.match(followUpApi, /method: "PATCH"/);
  assert.match(followUpApi, /follow_up_due_at/);
});

test("a successful vendor delivery has a clear, encouraging confirmation", () => {
  assert.match(choiceCard, /Message sent!/);
  assert.match(choiceCard, /another step closer to your wedding/);
});

test("live vendor results expose a distinct mobile favourite action", () => {
  assert.match(vendorSearch, /loadWeddingDecisionSelections/);
  assert.match(vendorSearch, /onToggleFollowUp=\{\(card\) => toggleFollowUp/);
  assert.match(choiceCard, /inline-flex min-h-11 w-full items-center justify-center/);
  assert.match(choiceCard, /"Favourited" : "Favourite"/);
  assert.match(choiceCard, /min-h-12 w-full rounded-lg/);
});

test("phone tooltip placement clamps inside the viewport and custom image cards use pointer drag", () => {
  assert.match(infoTip, /const opensBelow = spaceBelow >= estimatedTipHeight/);
  assert.match(infoTip, /window\.innerWidth - tooltipWidth - viewportMargin/);
  assert.match(infoTip, /"max-height": `\$\{position\(\)\.maxHeight\}px`/);
  assert.match(customizer, /touch-none cursor-grab active:cursor-grabbing/);
  assert.match(customizer, /setPointerCapture\?\.\(event\.pointerId\)/);
});

test("live selection persists an AFP update without remounting the comparison", () => {
  assert.match(workspaceView, /refreshWorkspace: false, surfaceNotice: false/);
  assert.match(workspaceView, /if \(options\?\.refreshWorkspace !== false\) props\.onRefreshWorkspace/);
});

test("agenda confirmations and due dates use the wedding responsibility AFP projection", () => {
  assert.match(helpersPanel, /status: "on_track"/);
  assert.match(helpersPanel, /type="date" value=\{agendaDueDateDraft\(\)\}/);
  assert.match(helpersPanel, /dueAt: `\$\{dueDate\}T12:00:00\.000Z`/);
  assert.match(helpersState, /WeddingHelperResponsibilityStatus = "open" \| "on_track" \| "done"/);
  assert.match(helpersState, /confirmedTaskIds/);
});

test("budget contributions support saved people and adding a selected contact", () => {
  assert.match(budgetTracker, /list="wedding-budget-contributor-people"/);
  assert.match(budgetTracker, /__add_new_contributor_contact__/);
  assert.match(budgetTracker, /Add and select/);
  assert.match(budgetTracker, /weddingHelperContactToAfpSendInput/);
  assert.match(timelinePanel, /overflow-visible text-left text-xs/);
});
