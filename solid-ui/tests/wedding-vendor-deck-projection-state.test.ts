import test from "node:test";
import assert from "node:assert/strict";
import { buildWeddingVendorDeckProjectionState } from "../src/lib/weddingVendorDeckProjectionState.ts";
import { decisionCardFromFocusDeckItem } from "../src/lib/decisionCardState.ts";

test("vendor deck projects an exactly-three comparison ahead of blocked fallback", () => {
  const preview = { artifactId: "a1", title: "Venue comparison", vendorComparisonCards: [{}, {}, {}], vendorComparisonHandoff: null };
  const items = buildWeddingVendorDeckProjectionState({ artifactPreviews: [preview as never], blockedReason: "Add location" });
  assert.equal(items[0]?.kind, "vendor_comparison");
  assert.equal(items[0]?.vendorComparison?.cards.length, 3);
});

test("vendor deck emits one actionable blocked card when no comparison exists", () => {
  const items = buildWeddingVendorDeckProjectionState({ artifactPreviews: [], blockedReason: "Add a category or location" });
  assert.deepEqual(items.map((item) => item.kind), ["vendor_blocked"]);
});

test("persisted outreach keeps the comparison visible beside its draft and receipt", () => {
  const preview = { artifactId: "a1", title: "Venue comparison", vendorComparisonCards: [{}, {}, {}], vendorComparisonHandoff: null };
  const flow = {
    choiceId: "choice-1", vendorName: "Harbour House", recipientEmail: "hello@example.com",
    stage: "draft_ready" as const, subject: "Availability", bodyMarkdown: "Hello", groundedOnLabels: ["Wedding date"],
    sentAtIso: null, receiptRef: null, threadId: "thread-1", blockedReason: null,
  };
  const draft = buildWeddingVendorDeckProjectionState({ artifactPreviews: [preview as never], outreachFlows: [flow] });
  assert.deepEqual(draft.map((item) => item.kind), ["vendor_comparison", "vendor_draft"]);
  assert.equal(draft[1]?.vendorOutreachFlow?.bodyMarkdown, "Hello");

  const receipt = buildWeddingVendorDeckProjectionState({
    artifactPreviews: [preview as never],
    outreachFlows: [{ ...flow, stage: "sent", sentAtIso: "2026-10-06T00:00:00Z", receiptRef: "provider-1" }],
  });
  assert.deepEqual(receipt.map((item) => item.kind), ["vendor_comparison", "vendor_receipt"]);
  assert.match(receipt[1]?.whyNowLabel ?? "", /provider-1/i);
});

test("a prepared vendor decision presents the personalized top three in the decision card", () => {
  const card = decisionCardFromFocusDeckItem({
    id: "task:beauty-timeline",
    kind: "decision",
    sourceSurface: "tasks",
    title: "Schedule hair and make up trial and final beauty timeline",
    recommendedActionLabel: "Linda Hair is the current top match based on the saved soft-colour style and trial availability.",
    whyNowLabel: "The trial window is approaching.",
    dueAt: "2027-06-01T00:00:00.000Z",
    evidenceLabels: ["Saved wedding preferences", "Source-backed top-three vendor comparison"],
    deferCount: 0,
    returnedFromLater: false,
    external: false,
    vendorComparison: {
      artifactId: "comparison:hair",
      cards: [
        { choiceId: "linda", title: "Linda Hair", rank: 1, situationFit: "Matches the saved soft-colour style." },
        { choiceId: "jess", title: "Jess Beauty", rank: 2, situationFit: "Offers trials." },
        { choiceId: "maya", title: "Maya Styling", rank: 3, situationFit: "Works near the venue." },
      ] as never,
    },
  });

  assert.equal(card.pattern, "choose");
  assert.equal(card.actions[0]?.label, "Open shortlist");
  assert.deepEqual(card.patternSlots.options?.map((option) => [option.name, option.recommended]), [
    ["Linda Hair", true],
    ["Jess Beauty", false],
    ["Maya Styling", false],
  ]);
});
