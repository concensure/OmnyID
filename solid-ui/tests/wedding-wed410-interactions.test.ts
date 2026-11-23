import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { weddingAssistantDirectWorkspaceAction } from "@/lib/weddingAssistantApi";
import { buildWeddingSetupDecisionContract } from "@/lib/weddingDecisionDefinitionState";

test("date setup decision carries useful planning and official climate guidance", () => {
  const contract = buildWeddingSetupDecisionContract("date");
  assert.match(contract.knownFacts.join(" "), /12–18 month/i);
  assert.match(contract.knownFacts.join(" "), /spring and autumn/i);
  assert.equal(contract.evidence.some((item) => item.ref === "https://www.bom.gov.au/climate/data/"), true);
  assert.doesNotMatch(contract.evidence.map((item) => item.label).join(" "), /^date needed$/i);
});

test("Sprout prepares an account-local invitation proposal instead of only explaining", () => {
  const result = weddingAssistantDirectWorkspaceAction(
    "Open invite proposals and help me fill in a sample proposal for a wedding next year in November for 90 guests",
    new Date("2026-11-23T00:00:00Z"),
  );
  assert.ok(result);
  assert.equal(result.action.kind, "stage_update");
  assert.equal(result.action.target, "home");
  assert.equal(result.action.draftFields?.inviteProposal?.dateOrSeason, "November 2027");
  assert.equal(result.action.draftFields?.inviteProposal?.guestCount, 90);
  assert.match(result.action.draftFields?.inviteProposal?.requestText ?? "", /GST, deposit and payment dates/i);
});

test("planner interactions stay in place and expose the requested controls", () => {
  const focus = readFileSync(new URL("../src/components/WeddingDecisionFocusCard.tsx", import.meta.url), "utf8");
  const timeline = readFileSync(new URL("../src/components/WeddingTimelinePanel.tsx", import.meta.url), "utf8");
  const guest = readFileSync(new URL("../src/components/WeddingGuestOperationsCard.tsx", import.meta.url), "utf8");
  const assistant = readFileSync(new URL("../src/components/AgentPersonaFAB.tsx", import.meta.url), "utf8");
  assert.match(focus, /WeddingDateEntryControl startOpen hideTrigger/);
  assert.match(timeline, /Show Gantt chart/);
  assert.match(guest, /not automatically shown or sent to guests/i);
  assert.match(assistant, /expanded\(\) \? "Shrink" : "Enlarge"/);
});
