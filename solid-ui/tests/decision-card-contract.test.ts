import assert from "node:assert/strict";
import test from "node:test";

import {
  decisionCardFromFocusDeckItem,
  decisionCardFromQueueEntry,
  decisionCardFromWeddingFocus,
  validateDecisionCard,
} from "../src/lib/decisionCardState.ts";
import type { QueueEntry } from "../src/lib/decisionQueueModel.ts";
import type { WeddingDecisionFocusItemCard } from "../src/lib/weddingDecisionFocusDisplayState.ts";

test("general DecisionOS entries map to a valid shared Choose card", () => {
  const entry = {
    id: "decision:venue",
    source: "action",
    decision: {
      id: "decision:venue",
      urgency: "high",
      title: "Choose a venue",
      context: "The preferred date is approaching.",
      impact: "high",
      effort: "10 minutes",
      options: [
        { id: "a", label: "Harbour Room", aiRecommended: true },
        { id: "b", label: "Garden Hall" },
      ],
      whyBullets: [{ text: "It best matches the guest count." }],
      whyMatters: "Holding a date avoids losing the preferred weekend.",
    },
    queueActionItem: { source_refs: ["afp:venue-search"] },
  } as unknown as QueueEntry;
  const card = decisionCardFromQueueEntry(entry);

  assert.equal(card.schema, "content.decision_card");
  assert.equal(card.pattern, "choose");
  assert.equal(card.domain, "general");
  assert.equal(card.actions.filter((action) => action.role === "primary").length, 1);
  assert.equal(card.recommendation?.summary, "Harbour Room");
  assert.deepEqual(validateDecisionCard(card), []);
});

test("wedding focus entries use pattern-specific shared cards with real deferral", () => {
  const displayCard = {
    id: "wedding:approval",
    title: "Approve the florist brief",
    neededByLabel: "By Friday",
    whyNowLabel: "The quote window closes this week.",
    checkedLabel: "OmnyID checked the saved quote.",
    recommendedActionLabel: "Review and approve only if it looks right",
    compareLabel: "Review approval",
    item: {
      id: "wedding:approval",
      kind: "approval",
      title: "Approve the florist brief",
      pressureFamily: "obligation",
      rankWeight: 10,
      dueLabel: "By Friday",
      dueAt: "2026-10-09T00:00:00Z",
      explanation: "The quote window closes this week.",
      evidenceLabels: ["Saved florist quote"],
      sourceSurface: "approval_queue",
      simulatorSeedKind: "decision",
    },
  } as WeddingDecisionFocusItemCard;
  const card = decisionCardFromWeddingFocus(displayCard);

  assert.equal(card.pattern, "approve_act");
  assert.equal(card.domain, "wedding");
  assert.ok(card.actions.some((action) => action.id === "later" && action.role === "dismiss"));
  assert.deepEqual(validateDecisionCard(card), []);
});

test("mobile focus deck uses the same Decision Card contract", () => {
  const card = decisionCardFromFocusDeckItem({
    id: "response:vendor",
    kind: "response",
    sourceSurface: "vendor_quote_reply",
    title: "Review the venue reply",
    recommendedActionLabel: "Open the guarded draft",
    whyNowLabel: "The hold expires soon.",
    dueAt: null,
    evidenceLabels: ["Vendor reply"],
    deferCount: 0,
    returnedFromLater: false,
    external: true,
  });

  assert.equal(card.pattern, "approve_act");
  assert.equal(card.actions[0]?.effect, "Opens the guarded review flow");
  assert.deepEqual(validateDecisionCard(card), []);
});
