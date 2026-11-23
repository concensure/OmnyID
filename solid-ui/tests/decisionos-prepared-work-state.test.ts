import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsPreparedDraftAutonomySummary,
  decisionOsPreparedDraftPresentationState,
  decisionOsPreparedDraftTrustState,
  decisionOsResponsePreparedDraftPresentationState,
  decisionOsResponsePreparedDraftAutonomySummary,
  decisionOsResponsePreparedDraftTrustState,
  decisionOsPreparedWorkCue,
  decisionOsPreparedWorkSimulatorLaneState,
  decisionOsPreparedWorkSimulatorPreviewState,
  decisionOsPreparedWorkSimulatorSuggestionState,
  decisionOsPreparedWorkSimulatorTileState,
} from "../src/lib/decisionosPreparedWorkState.ts";

test("decisionOsPreparedWorkCue prefers prepared responses for focused mood", () => {
  assert.deepEqual(
    decisionOsPreparedWorkCue({
      suggestedMood: "focused",
      queueCompanionState: {
        responseItems: [
          {
            title: "Reply to Aurora vendor",
            prepared_draft_available: true,
            prepared_draft_summary_lines: [
              "Prepared response draft is ready for vendor follow-up.",
            ],
          },
        ],
        preparedDraftItems: [],
        contextPackItems: [
          {
            title: "Aurora context pack",
            summary: "Grouped continuity around Aurora rollout work.",
          },
        ],
        proactiveSuggestions: [],
      },
    }),
    {
      label: "Prepared response ready",
      detail: "Prepared response draft is ready for vendor follow-up.",
    },
  );
});

test("decisionOsPreparedWorkCue distinguishes prepared decision support from reply drafts", () => {
  assert.deepEqual(
    decisionOsPreparedWorkCue({
      suggestedMood: "focused",
      queueCompanionState: {
        responseItems: [
          {
            title: "Renewal review for Aurora Fiber",
            prepared_draft_available: true,
            prepared_draft_class: "decision_memo",
            prepared_draft_summary_lines: [
              "Prepared renewal review is ready for Aurora Fiber.",
            ],
          },
        ],
        preparedDraftItems: [],
        contextPackItems: [],
        proactiveSuggestions: [],
      },
    }),
    {
      label: "Prepared decision support ready",
      detail: "Prepared renewal review is ready for Aurora Fiber.",
    },
  );
  assert.deepEqual(
    decisionOsPreparedWorkCue({
      suggestedMood: "focused",
      queueCompanionState: {
        responseItems: [
          {
            title: "Launch prep workspace note",
            prepared_draft_available: true,
            prepared_draft_class: "project_prep_note",
            prepared_draft_summary_lines: [
              "Prepared project prep note is ready for launch planning.",
            ],
          },
        ],
        preparedDraftItems: [],
        contextPackItems: [],
        proactiveSuggestions: [],
      },
    }),
    {
      label: "Prepared work ready",
      detail: "Prepared project prep note is ready for launch planning.",
    },
  );
});

test("decisionOsPreparedWorkCue falls back to prepared context for focused mood", () => {
  assert.deepEqual(
    decisionOsPreparedWorkCue({
      suggestedMood: "focused",
      queueCompanionState: {
        responseItems: [],
        preparedDraftItems: [],
        contextPackItems: [
          {
            title: "Aurora context pack",
            summary: "Grouped continuity around Aurora rollout work.",
          },
        ],
        proactiveSuggestions: [],
      },
    }),
    {
      label: "Prepared context ready",
      detail: "Grouped continuity around Aurora rollout work.",
    },
  );
});

test("decisionOsPreparedWorkCue is quiet outside focused mood", () => {
  assert.equal(
    decisionOsPreparedWorkCue({
      suggestedMood: "steady",
      queueCompanionState: {
        responseItems: [
          {
            title: "Reply to Aurora vendor",
            prepared_draft_available: true,
          },
        ],
        preparedDraftItems: [],
        contextPackItems: [],
        proactiveSuggestions: [],
      },
    }),
    null,
  );
});

test("decisionOsPreparedDraftAutonomySummary prefers structured autonomy decision and falls back to tier", () => {
  assert.equal(
    decisionOsPreparedDraftAutonomySummary({
      autonomy_decision: {
        autonomy_level: "notify_then_act",
        reversibility: "reversible",
        reason: "This stays inside reversible execution pathways.",
      },
      autonomy_tier: "hard_confirm",
    }),
    "notify then act: This stays inside reversible execution pathways.",
  );

  assert.equal(
    decisionOsPreparedDraftAutonomySummary({
      autonomy_decision: null,
      autonomy_tier: "soft_confirm",
    }),
    "soft confirm",
  );

  assert.equal(
    decisionOsPreparedDraftAutonomySummary({
      autonomy_decision: null,
      autonomy_tier: null,
    }),
    null,
  );
});

test("decisionOsPreparedDraftTrustState prefers explicit trust metadata and falls back to tier", () => {
  assert.deepEqual(
    decisionOsPreparedDraftTrustState({
      draft_class: "decision_memo",
      requires_approval: true,
      readiness: "ready_now",
      response_due_hint: "Today",
      source_refs: ["thread:1"],
      approval_or_reversibility_hint: "Approval would send the supplier-ready recommendation.",
      provenance_cue: "Grounded in the supplier thread and scorecard.",
      autonomy_decision: {
        autonomy_level: "notify_then_act",
        reversibility: "reversible",
        reason: "This can proceed once the recommendation is surfaced.",
      },
      autonomy_tier: "hard_confirm",
    }),
    {
      consequencePreview: "Approval would send the supplier-ready recommendation.",
      provenanceCue: "Grounded in the supplier thread and scorecard.",
      autonomySummary: "notify then act: This can proceed once the recommendation is surfaced.",
    },
  );

  assert.deepEqual(
    decisionOsPreparedDraftTrustState({
      draft_class: "decision_memo",
      requires_approval: false,
      readiness: "ready_now",
      response_due_hint: "Today",
      source_refs: ["thread:1"],
      approval_or_reversibility_hint: null,
      provenance_cue: null,
      autonomy_decision: null,
      autonomy_tier: "soft_confirm",
    }),
    {
      consequencePreview: "Acting now opens prepared decision support without committing to a final action.",
      provenanceCue: "Traceable to the decision evidence used to prepare this artifact.",
      autonomySummary: "soft confirm",
    },
  );
});

test("decisionOsPreparedDraftPresentationState keeps bounded and trust copy aligned", () => {
  assert.deepEqual(
    decisionOsPreparedDraftPresentationState({
      draft_class: "decision_memo",
      requires_approval: true,
      readiness: "ready_now",
      response_due_hint: "Today",
      selection_reason: "Prepared supplier review is ready now.",
      suggested_action: "Open the supplier review.",
      source_refs: ["thread:1"],
      approval_or_reversibility_hint: "Approval would send the supplier-ready recommendation.",
      provenance_cue: "Grounded in the supplier thread and scorecard.",
      autonomy_decision: {
        autonomy_level: "notify_then_act",
        reversibility: "reversible",
        reason: "This can proceed once the recommendation is surfaced.",
      },
      autonomy_tier: "hard_confirm",
    }),
    {
      boundedReason: "Due today.",
      distinctSelectionReason: "Prepared supplier review is ready now.",
      distinctSuggestedAction: "Open the supplier review.",
      sourceSummary: "Based on 1 source",
      consequencePreview: "Approval would send the supplier-ready recommendation.",
      provenanceCue: "Grounded in the supplier thread and scorecard.",
      autonomySummary: "notify then act: This can proceed once the recommendation is surfaced.",
    },
  );
});

test("decisionOsResponsePreparedDraftAutonomySummary reads prepared draft response autonomy", () => {
  assert.equal(
    decisionOsResponsePreparedDraftAutonomySummary({
      prepared_draft_autonomy_decision: {
        autonomy_level: "notify_then_act",
        reversibility: "reversible",
        reason: "This stays inside reversible execution pathways.",
      },
    }),
    "notify then act: This stays inside reversible execution pathways.",
  );

  assert.equal(
    decisionOsResponsePreparedDraftAutonomySummary({
      prepared_draft_autonomy_decision: null,
    }),
    null,
  );
});

test("decisionOsResponsePreparedDraftTrustState keeps response prepared-draft trust copy aligned", () => {
  assert.deepEqual(
    decisionOsResponsePreparedDraftTrustState({
      prepared_draft_class: "communication_reply",
      prepared_draft_requires_approval: true,
      prepared_draft_readiness: "ready_now",
      response_due_hint: "Today",
      source_refs: ["thread:1"],
      prepared_draft_object_refs: ["contact:1"],
      prepared_draft_object_labels: ["Aurora vendor"],
      prepared_draft_autonomy_decision: {
        autonomy_level: "notify_then_act",
        reversibility: "reversible",
        reason: "This remains reviewable before any send.",
      },
    }),
    {
      consequencePreview: "Acting now opens a review step first; no external action runs without approval.",
      provenanceCue: "Traceable to the continuity artifacts used to prepare this draft.",
      autonomySummary: "notify then act: This remains reviewable before any send.",
    },
  );

  assert.deepEqual(
    decisionOsResponsePreparedDraftTrustState({
      prepared_draft_class: "decision_memo",
      prepared_draft_requires_approval: false,
      prepared_draft_readiness: "ready_now",
      response_due_hint: "Today",
      source_refs: ["thread:1"],
      prepared_draft_object_refs: [],
      prepared_draft_object_labels: [],
      prepared_draft_autonomy_decision: null,
    }),
    {
      consequencePreview: "Acting now opens prepared decision support without committing to a final action.",
      provenanceCue: "Traceable to the decision evidence used to prepare this artifact.",
      autonomySummary: null,
    },
  );
});

test("decisionOsResponsePreparedDraftPresentationState keeps response bounded and trust copy aligned", () => {
  assert.deepEqual(
    decisionOsResponsePreparedDraftPresentationState({
      prepared_draft_class: "communication_reply",
      prepared_draft_requires_approval: true,
      prepared_draft_readiness: "ready_now",
      prepared_draft_selection_reason: "Reply draft is ready for review.",
      urgency: "today",
      response_due_hint: "Today",
      source_refs: ["thread:1"],
      prepared_draft_object_refs: ["contact:1"],
      prepared_draft_object_labels: ["Aurora vendor"],
      prepared_draft_autonomy_decision: {
        autonomy_level: "notify_then_act",
        reversibility: "reversible",
        reason: "This remains reviewable before any send.",
      },
      suggested_action: "Review the draft reply.",
    }),
    {
      boundedReason: "Due today.",
      distinctSelectionReason: "Reply draft is ready for review.",
      distinctSuggestedAction: "Review the draft reply.",
      sourceSummary: "Based on 1 source",
      consequencePreview: "Acting now opens a review step first; no external action runs without approval.",
      provenanceCue: "Traceable to the continuity artifacts used to prepare this draft.",
      autonomySummary: "notify then act: This remains reviewable before any send.",
    },
  );
});

test("decisionOsPreparedWorkSimulatorPreviewState normalizes simulator strip copy", () => {
  assert.deepEqual(
    decisionOsPreparedWorkSimulatorPreviewState({
      kind: "simulator_approval_preview",
      selection_reason: "Nearest high-stakes event needs protected prep.",
      artifact_summary_lines: [
        "Protect 45 minutes before the interview",
        "Keep the slot reviewable",
      ],
      approval_or_reversibility_hint: "Approving would create a reviewable hold.",
      preview_boundary_summary: "Preview only.",
      source_refs: ["calendar:event:1"],
      evidence_kinds: ["calendar"],
      draft_preview: {
        label: "Draft hold",
        content: "Hold Tue 3pm",
        content_type: "text",
      },
    }),
    {
      boundedReason: "Nearest high-stakes event needs protected prep.",
      hasDistinctSelectionReason: false,
      leadSummaryLine: "Protect 45 minutes before the interview",
      supportingSummaryLines: ["Keep the slot reviewable"],
      consequencePreview: "Approving would create a reviewable hold.",
      previewBoundarySummary: "Preview only.",
      provenanceCue: "Traceable to append-only continuity artifacts.",
      sourceSummary: "Based on 1 source",
      rolloutSummary: null,
      persistenceReason: null,
      autonomySummary: null,
    },
  );

  assert.equal(
    decisionOsPreparedWorkSimulatorPreviewState({ kind: "prepared_draft" }),
    null,
  );
});

test("decisionOsPreparedWorkSimulatorTileState normalizes bento fallback tile copy", () => {
  assert.deepEqual(
    decisionOsPreparedWorkSimulatorTileState({
      kind: "simulator_reversible_preview",
      title: "Reversible preview",
      description: "Preview a reversible internal change.",
      artifact_summary_lines: [
        "Temporary hold only",
        "Undo restores the prior state",
      ],
      approval_or_reversibility_hint: "Undo would remove the temporary hold.",
      preview_boundary_summary: "Preview only.",
      source_refs: ["calendar:event:2"],
      evidence_kinds: ["calendar"],
    }),
    {
      kind: "reversible",
      title: "Reversible preview",
      detail: "Preview a reversible internal change.",
      leadSummaryLine: "Temporary hold only",
      supportingSummaryLines: ["Undo restores the prior state"],
      consequencePreview: "Undo would remove the temporary hold.",
      provenanceCue: "Traceable to append-only continuity artifacts.",
      previewBoundarySummary: "Preview only.",
      sourceSummary: "Based on 1 source",
      rolloutSummary: null,
      persistenceReason: null,
      autonomySummary: null,
    },
  );

  assert.equal(
    decisionOsPreparedWorkSimulatorTileState({ kind: "prepared_draft" }),
    null,
  );
});

test("decisionOsPreparedWorkSimulatorTileState supplies default simulator titles when missing", () => {
  assert.equal(
    decisionOsPreparedWorkSimulatorTileState({
      kind: "simulator_approval_preview",
      title: "   ",
      description: "Approval path preview.",
    })?.title,
    "Simulator approval preview",
  );
  assert.equal(
    decisionOsPreparedWorkSimulatorTileState({
      kind: "simulator_reversible_preview",
      title: "",
      description: "Reversible path preview.",
    })?.title,
    "Simulator reversible preview",
  );
  assert.equal(
    decisionOsPreparedWorkSimulatorTileState({
      kind: "simulator_conflict_fusion",
      title: "",
      description: "Keep both paths together.",
    })?.title,
    "Simulator conflict fusion",
  );
});

test("decisionOsPreparedWorkSimulatorLaneState normalizes operational lane preview copy", () => {
  assert.deepEqual(
    decisionOsPreparedWorkSimulatorLaneState({
      kind: "simulator_approval_preview",
      title: "  ",
      selection_reason: "Nearest high-stakes event needs protected prep.",
      artifact_summary_lines: [
        "Protect 45 minutes before the interview",
        "Keep the slot reviewable",
      ],
      draft_preview: {
        label: "Draft hold",
        content: "Hold Tue 3pm",
        content_type: "text",
      },
    }),
    {
      kind: "approval",
      title: "Simulator approval preview ready",
      detail:
        "Protect 45 minutes before the interview This remains a bounded preview and does not execute external work.",
      reason: "bounded simulator approval preview available",
      consequencePreview: null,
      provenanceCue: null,
      sourceSummary: null,
      rolloutSummary: null,
    },
  );

  assert.deepEqual(
    decisionOsPreparedWorkSimulatorLaneState({
      kind: "simulator_reversible_preview",
      description: "Preview a reversible internal change.",
    }),
    {
      kind: "reversible",
      title: "Simulator reversible preview ready",
      detail:
        "Preview a reversible internal change. This remains a bounded preview and does not execute external work.",
      reason: "bounded simulator reversible preview available",
      consequencePreview: null,
      provenanceCue: null,
      sourceSummary: null,
      rolloutSummary: null,
    },
  );

  assert.deepEqual(
    decisionOsPreparedWorkSimulatorLaneState({
      kind: "simulator_conflict_fusion",
      artifact_summary_lines: ["Keep approval and reversible paths together"],
    }),
    {
      kind: "fusion",
      title: "Simulator conflict fusion ready",
      detail:
        "Keep approval and reversible paths together This remains a bounded preview and does not execute external work.",
      reason: "bounded simulator fusion preview available",
      consequencePreview: null,
      provenanceCue: null,
      sourceSummary: null,
      rolloutSummary: null,
    },
  );

  assert.equal(
    decisionOsPreparedWorkSimulatorLaneState({ kind: "prepared_draft" }),
    null,
  );
});

test("decisionOsPreparedWorkSimulatorSuggestionState folds strip fallbacks into shared simulator state", () => {
  assert.deepEqual(
    decisionOsPreparedWorkSimulatorSuggestionState({
      kind: "simulator_reversible_preview",
      description: "Preview a reversible internal change.",
      selection_reason: "Prefer the reversible path first.",
      artifact_summary_lines: [
        "Temporary hold only",
        "Undo restores the prior state",
      ],
      preview_boundary_summary: "Preview only.",
      source_refs: ["calendar:event:2"],
      evidence_kinds: ["calendar"],
    }),
    {
      boundedReason: "Preview a reversible internal change.",
      hasDistinctSelectionReason: true,
      leadSummaryLine: "Temporary hold only",
      supportingSummaryLines: ["Undo restores the prior state"],
      consequencePreview: null,
      previewBoundarySummary: "Preview only.",
      provenanceCue: "Traceable to append-only continuity artifacts.",
      sourceSummary: "Based on 1 source",
      rolloutSummary: null,
      persistenceReason: null,
      autonomySummary: null,
    },
  );

  assert.deepEqual(
    decisionOsPreparedWorkSimulatorSuggestionState({
      kind: "simulator_conflict_fusion",
      description: "Hold both paths in one bounded comparison.",
      selection_reason: "Keep both options reviewable together.",
      artifact_summary_lines: [
        "Approval and reversible paths share the same context",
      ],
      preview_boundary_summary: "Preview only.",
      source_refs: ["thread:1"],
      evidence_kinds: ["simulator_projection"],
    }),
    {
      boundedReason: "Hold both paths in one bounded comparison.",
      hasDistinctSelectionReason: true,
      leadSummaryLine: "Approval and reversible paths share the same context",
      supportingSummaryLines: [],
      consequencePreview: null,
      previewBoundarySummary: "Preview only.",
      provenanceCue: "Traceable to append-only continuity artifacts.",
      sourceSummary: "Based on 1 source",
      rolloutSummary: null,
      persistenceReason: null,
      autonomySummary: null,
    },
  );

  assert.equal(
    decisionOsPreparedWorkSimulatorSuggestionState({ kind: "prepared_draft" }),
    null,
  );
});

test("decisionOsPreparedWorkSimulatorTileState preserves rollout and continuity persistence cues", () => {
  assert.deepEqual(
    decisionOsPreparedWorkSimulatorTileState({
      kind: "simulator_approval_preview",
      title: "Approval preview",
      description: "Review the protected slot before applying it.",
      artifact_summary_lines: ["Protect 45 minutes before the interview"],
      approval_or_reversibility_hint: "Approving would create a reviewable hold.",
      preview_boundary_summary: "Preview only.",
      source_refs: ["calendar:event:1", "thread:follow-up:1"],
      evidence_kinds: ["calendar"],
      persisted_from_continuity: true,
      rollout_summary: "Simulator rollout stage: shadow. Calibration mode: shadow only.",
      approval_kind: "calendar_hold",
    }),
    {
      kind: "approval",
      title: "Approval preview",
      detail: "Review the protected slot before applying it.",
      leadSummaryLine: "Protect 45 minutes before the interview",
      supportingSummaryLines: [],
      consequencePreview: "Approving would create a reviewable hold.",
      provenanceCue: "Traceable to append-only continuity artifacts.",
      previewBoundarySummary: "Preview only.",
      sourceSummary: "Based on 2 sources",
      rolloutSummary: "Simulator rollout stage: shadow. Calibration mode: shadow only.",
      persistenceReason:
        "Persisted from continuity so this bounded simulator review remains available between refreshes.",
      autonomySummary: null,
    },
  );
});

test("decisionOsPreparedWorkSimulatorPreviewState preserves autonomy policy summaries", () => {
  assert.deepEqual(
    decisionOsPreparedWorkSimulatorPreviewState({
      kind: "simulator_reversible_preview",
      description: "Preview a reversible internal change.",
      artifact_summary_lines: [
        "Temporary hold only",
      ],
      source_refs: ["calendar:event:2"],
      autonomy_decision: {
        autonomy_level: "notify_then_act",
        reason: "This stays inside reversible execution pathways.",
      },
    }),
    {
      boundedReason: "Preview a reversible internal change.",
      hasDistinctSelectionReason: false,
      leadSummaryLine: "Temporary hold only",
      supportingSummaryLines: [],
      consequencePreview: null,
      previewBoundarySummary: "This remains a bounded preview and does not execute external work.",
      provenanceCue: "Traceable to append-only continuity artifacts.",
      sourceSummary: "Based on 1 source",
      rolloutSummary: null,
      persistenceReason: null,
      autonomySummary: "notify then act: This stays inside reversible execution pathways.",
    },
  );
});

test("decisionOsPreparedWorkSimulatorPreviewState falls back to autonomy tiers when structured policy is absent", () => {
  assert.deepEqual(
    decisionOsPreparedWorkSimulatorPreviewState({
      kind: "simulator_reversible_preview",
      description: "Preview a reversible internal change.",
      artifact_summary_lines: [
        "Temporary hold only",
      ],
      source_refs: ["calendar:event:2"],
      autonomy_tier: "notify_then_act",
    }),
    {
      boundedReason: "Preview a reversible internal change.",
      hasDistinctSelectionReason: false,
      leadSummaryLine: "Temporary hold only",
      supportingSummaryLines: [],
      consequencePreview: null,
      previewBoundarySummary: "This remains a bounded preview and does not execute external work.",
      provenanceCue: "Traceable to append-only continuity artifacts.",
      sourceSummary: "Based on 1 source",
      rolloutSummary: null,
      persistenceReason: null,
      autonomySummary: "notify then act",
    },
  );
});
