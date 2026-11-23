import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const panel = read("src/components/WeddingMealChoiceCataloguePanel.tsx");
const context = read("src/components/WeddingWorkspaceContextPanels.tsx");
const rsvp = read("src/components/WeddingRsvpSetupPanel.tsx");

test("Plan and RSVP use the same AFP meal catalogue save path", () => {
  assert.match(context, /WeddingMealChoiceCataloguePanel/);
  assert.match(context, /onSave=\{saveMealChoices\}/);
  assert.match(context, /WeddingRsvpSetupPanel[\s\S]*onSaveMealChoices=\{saveMealChoices\}/);
  assert.match(context, /weddingMealChoiceCatalogueToAfpSendInput/);
  assert.doesNotMatch(panel, /localStorage|sessionStorage/);
});

test("catalogue controls are mobile friendly, labelled and separate meal from health facts", () => {
  assert.match(panel, /aria-labelledby="wedding-meal-catalogue-title"/);
  assert.match(panel, /min-h-11 w-full/);
  assert.match(panel, /role="status"/);
  assert.match(panel, /Review affected RSVPs/);
  assert.match(panel, /Dietary and allergy details stay separate/);
  assert.match(rsvp, /rsvp-meal-impact-title/);
  assert.match(rsvp, /Keep them for follow-up instead of changing a guest's answer/);
});
