import test from "node:test";
import assert from "node:assert/strict";

import {
  trustFieldFromContents,
  trustFieldFromRecord,
  trustSummaryStateFromExplicitFields,
  trustSummaryStateFromContents,
  trustSummaryStateFromRecord,
} from "../src/lib/trustFieldState.ts";

test("trust field state prefers newer trust keys before legacy consequence preview keys", () => {
  assert.equal(
    trustFieldFromRecord(
      {
        consequence_preview: "Legacy preview",
        approval_or_reversibility_hint: "Server-authored review boundary",
      },
      ["approval_or_reversibility_hint", "consequence_preview"],
    ),
    "Server-authored review boundary",
  );
});

test("trust field state falls back from view content to message content", () => {
  assert.equal(
    trustFieldFromContents(
      {},
      {
        approval_or_reversibility_hint: "Message-level review boundary",
      },
      ["approval_or_reversibility_hint", "consequence_preview"],
    ),
    "Message-level review boundary",
  );
});

test("trust field state ignores blank values while scanning fallback keys", () => {
  assert.equal(
    trustFieldFromContents(
      {
        approval_or_reversibility_hint: "   ",
        consequence_preview: "Legacy fallback still present",
      },
      {},
      ["approval_or_reversibility_hint", "consequence_preview"],
    ),
    "Legacy fallback still present",
  );
});

test("trust summary state from contents prefers view trust fields and suppresses duplicate selection reason", () => {
  assert.deepEqual(
    trustSummaryStateFromContents(
      {
        kind: "prepared_draft",
        selection_reason: "Prepared response is ready for review.",
        approval_or_reversibility_hint: "Review before sending.",
        provenance_cue: "Grounded in the thread transcript.",
      },
      {
        kind: "prepared_draft",
        selection_reason: "Older message reason",
        consequence_preview: "Legacy preview",
      },
    ),
    {
      boundedReason: "Prepared response is ready for review.",
      selectionReason: "Prepared response is ready for review.",
      showSelectionReason: false,
      consequencePreview: "Review before sending.",
      provenanceCue: "Grounded in the thread transcript.",
      sourceSummary: null,
    },
  );
});

test("trust summary state from record falls back to legacy consequence preview keys", () => {
  assert.deepEqual(
    trustSummaryStateFromRecord({
      kind: "decision_request",
      urgency: "high",
      selection_reason: "Escalated due to deadline pressure.",
      consequence_preview: "Missing review could delay the deadline.",
    }),
    {
      boundedReason: "Escalated due to deadline pressure.",
      selectionReason: "Escalated due to deadline pressure.",
      showSelectionReason: false,
      consequencePreview: "Missing review could delay the deadline.",
      provenanceCue: "",
      sourceSummary: null,
    },
  );
});

test("trust summary state from explicit fields suppresses duplicate selection reason", () => {
  assert.deepEqual(
    trustSummaryStateFromExplicitFields({
      boundedReason: "Due today.",
      selectionReason: "Due today.",
      consequencePreview: "Missing review could delay the deadline.",
      provenanceCue: "Grounded in the current thread and timeline.",
    }),
    {
      boundedReason: "Due today.",
      selectionReason: "Due today.",
      showSelectionReason: false,
      consequencePreview: "Missing review could delay the deadline.",
      provenanceCue: "Grounded in the current thread and timeline.",
      sourceSummary: null,
    },
  );
});

test("trust summary state derives source summary from source refs and respects explicit source summary", () => {
  assert.deepEqual(
    trustSummaryStateFromContents(
      {
        kind: "prepared_draft",
        selection_reason: "Prepared response is ready for review.",
        source_refs: ["thread:1", "thread:2"],
      },
      {},
    ),
    {
      boundedReason: "Prepared response is ready for review.",
      selectionReason: "Prepared response is ready for review.",
      showSelectionReason: false,
      consequencePreview: "",
      provenanceCue: "",
      sourceSummary: "Based on 2 sources",
    },
  );

  assert.deepEqual(
    trustSummaryStateFromRecord({
      kind: "prepared_draft",
      selection_reason: "Prepared response is ready for review.",
      source_summary: "Clustered from the renewal thread and finance note.",
      source_refs: ["thread:1", "thread:2"],
    }),
    {
      boundedReason: "Prepared response is ready for review.",
      selectionReason: "Prepared response is ready for review.",
      showSelectionReason: false,
      consequencePreview: "",
      provenanceCue: "",
      sourceSummary: "Clustered from the renewal thread and finance note.",
    },
  );
});
