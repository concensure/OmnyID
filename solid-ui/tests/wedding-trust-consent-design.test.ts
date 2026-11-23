import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const composer = readFileSync(new URL("../src/components/WeddingVendorOutreachComposer.tsx", import.meta.url), "utf8");
const choice = readFileSync(new URL("../src/components/WeddingVendorChoiceCard.tsx", import.meta.url), "utf8");
const quote = readFileSync(new URL("../src/components/WeddingNormalizedQuoteSummary.tsx", import.meta.url), "utf8");
const site = readFileSync(new URL("../../wedding/index.html", import.meta.url), "utf8");

test("enquiry composer previews consequence and sharing controls before send", () => {
  for (const label of [
    "Before this enquiry is sent",
    "Share my approximate category budget",
    "Allow this vendor to contact me by phone",
    "Remind me about unanswered enquiries",
    "Preview what the vendor receives",
    "Protected OmnyID replies",
    "I have reviewed the recipient, exact message and shared information.",
  ]) assert.match(composer, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(composer, /Changing a control never sends anything/);
});

test("trust answers appear at comparison and normalized-quote decision points", () => {
  assert.match(choice, /Are these vendors genuine/);
  assert.match(choice, /recommendations influenced by payments/);
  assert.match(quote, /Is the quoted price accurate/);
  assert.match(quote, /Could the AI have invented a detail/);
});

test("public wedding FAQ covers all seven trust questions", () => {
  for (const phrase of [
    "Are the vendors genuine?",
    "Are recommendations influenced by vendor payments?",
    "Is the quoted price accurate?",
    "What personal information will a vendor receive?",
    "Will I be bombarded with sales calls?",
    "Can the AI invent details?",
    "What happens if a vendor never replies?",
  ]) assert.match(site, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
