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

test("a successful vendor delivery has a clear, encouraging confirmation", () => {
  assert.match(choiceCard, /Message sent!/);
  assert.match(choiceCard, /another step closer to your wedding/);
});

test("live vendor results offer a persisted follow-up selection on mobile", () => {
  assert.match(vendorSearch, /loadWeddingDecisionSelections/);
  assert.match(vendorSearch, /onToggleFollowUp=\{\(card\) => toggleFollowUp/);
  assert.match(choiceCard, /min-h-11 w-full rounded-xl[\s\S]*sm:w-auto/);
});

test("phone tooltip placement flips inside the viewport and custom image cards use pointer drag", () => {
  assert.match(infoTip, /spaceBelow >= estimatedTipHeight/);
  assert.match(infoTip, /max-h-\[calc\(100dvh-1\.5rem\)\] .*overflow-y-auto/);
  assert.match(customizer, /touch-none cursor-grab active:cursor-grabbing/);
  assert.match(customizer, /setPointerCapture\?\.\(event\.pointerId\)/);
});
