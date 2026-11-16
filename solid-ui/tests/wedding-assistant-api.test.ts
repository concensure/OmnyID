import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWeddingAssistantResponse } from "../src/lib/weddingAssistantApi";

test("normalizes a review-first Wedding navigation suggestion", () => {
  assert.deepEqual(normalizeWeddingAssistantResponse({
    answer: "Open Budget and review the amount before saving.",
    model: "funded-model",
    suggested_action: { kind: "stage_update", target: "budget", label: "Review Budget", draft_fields: { budget_target_aud: 35000 } },
  }), {
    answer: "Open Budget and review the amount before saving.",
    model: "funded-model",
    suggestedAction: { kind: "stage_update", target: "budget", label: "Review Budget", draftFields: { budgetTargetAud: 35000 } },
  });
});

test("drops unknown destinations instead of navigating outside Wedding", () => {
  assert.equal(normalizeWeddingAssistantResponse({
    answer: "I can only help in Wedding.",
    suggested_action: { kind: "open_view", target: "admin", label: "Open admin" },
  }).suggestedAction, null);
});
