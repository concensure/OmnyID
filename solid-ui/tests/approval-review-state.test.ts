import test from "node:test";
import assert from "node:assert/strict";

import {
  approvalMessageContent,
  approvalDraftPreviewFromUnknown,
  approvalReviewFromUnknown,
  approvalStateRecord,
  approvalStateString,
  approvalStateStringArray,
  autonomyDecisionWithTierFallback,
  autonomyDecisionFromUnknown,
  simulatorApprovalPreviewStateFromUnknown,
  simulatorApprovalReviewFromUnknown,
  simulatorProactivePreviewStateFromUnknown,
  simulatorPreviewCardSummaryStateFromUnknown,
  simulatorPreviewDetailsFromUnknown,
  simulatorPreviewKindFromUnknown,
  simulatorPreviewLinesFromUnknown,
  simulatorReviewSurfaceStateFromUnknown,
} from "../src/lib/approvalReviewState.ts";
import {
  simulatorPreviewBadgeLabel,
  simulatorPreviewBoundaryFallback,
  simulatorPreviewOnlyBadgeLabel,
  simulatorPreviewPersistenceFallback,
  simulatorPreviewRolloutSummary,
  simulatorPreviewSummary,
  simulatorPreviewToggleLabel,
  simulatorPreviewTitle,
} from "../src/lib/simulatorPreviewCopy.ts";

test("approval review state hides encrypted message content before local decryption", () => {
  const content = approvalMessageContent({
    id: "approval-encrypted",
    thread_id: "thread-approval",
    from: "agent://approval",
    to: [],
    timestamp: "2026-08-31T12:00:00.000Z",
    type: "approval",
    content: {
      title: "Hidden vendor approval",
      reason: "Private negotiation details",
      ciphertext: "abc123",
      nonce: "nonce123",
    },
    encryption: { scheme: "xchacha20-poly1305", key_id: "device-key" },
    metadata: {},
    supertags: [],
    views: [],
    attachments: [],
    references: [],
  } as any);

  assert.deepEqual(content, {});
});

test("approval review state helpers normalize draft preview fields from unknown payloads", () => {
  assert.deepEqual(
    approvalDraftPreviewFromUnknown({
      label: "Review draft",
      content: "Line one | Line two",
      content_type: "text",
      ignored: true,
    }),
    {
      label: "Review draft",
      content: "Line one | Line two",
      content_type: "text",
    },
  );

  assert.equal(approvalDraftPreviewFromUnknown(null), null);
  assert.equal(approvalDraftPreviewFromUnknown("not-an-object"), null);
});

test("approval review state helpers normalize autonomy decisions from unknown payloads", () => {
  assert.deepEqual(
    autonomyDecisionFromUnknown({
      autonomy_level: "request_approval",
      reversibility: "reversible",
      consequence_level: "medium",
      confidence: "high",
      approval_required: true,
      interruption_budget: "low",
      reason: "Crosses an approval boundary.",
      ignored: "value",
    }),
    {
      autonomy_level: "request_approval",
      reversibility: "reversible",
      consequence_level: "medium",
      confidence: "high",
      approval_required: true,
      interruption_budget: "low",
      reason: "Crosses an approval boundary.",
    },
  );

  assert.equal(autonomyDecisionFromUnknown(undefined), null);
});

test("approval review state helpers accept rust-style autonomy decision fields", () => {
  assert.deepEqual(
    autonomyDecisionFromUnknown({
      autonomy_level: "suggest_with_artifact",
      reversible: true,
      consequence: "low",
      approval_required: false,
      interruption_budget: "low",
      rationale: "Prepared suggestion remains reviewable.",
    }),
    {
      autonomy_level: "suggest_with_artifact",
      reversibility: "reversible",
      consequence_level: "low",
      approval_required: false,
      interruption_budget: "low",
      reason: "Prepared suggestion remains reviewable.",
    },
  );
});

test("approval review state helpers prefer structured autonomy decisions and otherwise fall back to tiers", () => {
  assert.deepEqual(
    autonomyDecisionWithTierFallback(
      {
        autonomy_level: "request_approval",
        reason: "Outbound send requires approval.",
      },
      "notify_then_act",
    ),
    {
      autonomy_level: "request_approval",
      reason: "Outbound send requires approval.",
    },
  );

  assert.deepEqual(
    autonomyDecisionWithTierFallback(null, "ask_always"),
    {
      autonomy_level: "ask_always",
    },
  );

  assert.equal(autonomyDecisionWithTierFallback(null, null), null);
});

test("approval review state helpers reject malformed proactive autonomy tiers", () => {
  assert.equal(
    autonomyDecisionWithTierFallback(null, "hard_confirm"),
    null,
  );
  assert.equal(
    autonomyDecisionWithTierFallback(null, " definitely_auto "),
    null,
  );
});

test("approval review state helpers normalize full approval review payloads from unknown objects", () => {
  assert.deepEqual(
    approvalReviewFromUnknown({
      title: "Approval review",
      reason: "Please confirm before sending.",
      confidence: "high",
      provenance_summary: "Based on 2 sources",
      consequence_summary_lines: ["Will send the prepared reply", "", 3],
      source_refs: ["message:1", "", 2],
      approval_kind: "send",
      draft_preview: {
        label: "Reply draft",
        content: "Subject: Update | Body: Ready to send",
        content_type: "text",
      },
      autonomy_decision: {
        autonomy_level: "request_approval",
        reason: "Outbound send requires approval.",
      },
      ignored: "value",
    }),
    {
      title: "Approval review",
      reason: "Please confirm before sending.",
      confidence: "high",
      provenance_summary: "Based on 2 sources",
      consequence_summary_lines: ["Will send the prepared reply"],
      source_refs: ["message:1"],
      approval_kind: "send",
      draft_preview: {
        label: "Reply draft",
        content: "Subject: Update | Body: Ready to send",
        content_type: "text",
      },
      autonomy_decision: {
        autonomy_level: "request_approval",
        reason: "Outbound send requires approval.",
      },
    },
  );

  assert.equal(approvalReviewFromUnknown([]), null);
});

test("approval review state helpers preserve autonomy tiers when structured autonomy decisions are absent", () => {
  assert.deepEqual(
    approvalReviewFromUnknown({
      title: "Approval review",
      autonomy_tier: "ask_always",
    }),
    {
      title: "Approval review",
      autonomy_decision: {
        autonomy_level: "ask_always",
      },
    },
  );
});

test("approval review state helpers drop malformed tier-only approval review payloads", () => {
  assert.deepEqual(
    approvalReviewFromUnknown({
      title: "Approval review",
      autonomy_tier: "hard_confirm",
    }),
    {
      title: "Approval review",
    },
  );
});

test("approval review state primitive helpers reject non-object values and trim string arrays", () => {
  assert.equal(approvalStateRecord([]), null);
  assert.equal(approvalStateRecord("hello"), null);
  assert.deepEqual(approvalStateRecord({ ok: true }), { ok: true });

  assert.equal(approvalStateString("  ready  "), "ready");
  assert.equal(approvalStateString("   "), null);
  assert.equal(approvalStateString(4), null);

  assert.deepEqual(
    approvalStateStringArray(["first", " ", "second", 4, null]),
    ["first", "second"],
  );
});

test("approval review state helper derives simulator approval review payloads from preview content", () => {
  assert.deepEqual(
    simulatorApprovalReviewFromUnknown({
      kind: "simulator_approval_preview",
      title: "Interview prep approval",
      description: "Bounded simulator found an approval step.",
      confidence: "medium",
      approval_kind: "calendar_hold",
      draft_preview: {
        label: "Draft hold",
        content: "Hold Tue 3pm | Protect 45 minutes of prep",
        content_type: "text",
      },
      artifact_summary_lines: ["Protect 45 minutes before the interview", "Keep the slot reviewable"],
      source_refs: ["calendar:event:1", "", 2],
    }),
    {
      title: "Interview prep approval",
      reason: "Bounded simulator found an approval step.",
      confidence: "medium",
      consequence_summary_lines: [
        "Protect 45 minutes before the interview",
        "Keep the slot reviewable",
      ],
      source_refs: ["calendar:event:1"],
      approval_kind: "calendar_hold",
      draft_preview: {
        label: "Draft hold",
        content: "Hold Tue 3pm | Protect 45 minutes of prep",
        content_type: "text",
      },
    },
  );

  assert.equal(
    simulatorApprovalReviewFromUnknown({ kind: "simulator_reversible_preview", title: "Nope" }),
    null,
  );
});

test("approval review state helpers derive simulator preview kind and lines from unknown payloads", () => {
  assert.equal(
    simulatorPreviewKindFromUnknown({ kind: "simulator_approval_preview" }),
    "approval",
  );
  assert.equal(
    simulatorPreviewKindFromUnknown({ kind: "simulator_reversible_preview" }),
    "reversible",
  );
  assert.equal(
    simulatorPreviewKindFromUnknown({ kind: "simulator_conflict_fusion" }),
    "fusion",
  );
  assert.equal(
    simulatorPreviewKindFromUnknown({ kind: "prepared_draft" }),
    null,
  );

  assert.deepEqual(
    simulatorPreviewLinesFromUnknown({
      kind: "simulator_approval_preview",
      artifact_summary_lines: ["Protect the slot", "Keep approval in the loop"],
      description: "Fallback description",
      draft_preview: {
        label: "Draft hold",
        content: "Protect Tue 3pm",
        content_type: "text",
      },
    }),
    ["Protect the slot", "Keep approval in the loop"],
  );

  assert.deepEqual(
    simulatorPreviewLinesFromUnknown({
      kind: "prepared_draft",
      artifact_summary_lines: ["Should not render"],
    }),
    [],
  );
});

test("approval review state helper derives simulator approval preview summary state", () => {
  assert.deepEqual(
    simulatorApprovalPreviewStateFromUnknown({
      kind: "simulator_approval_preview",
      title: "Approval preview",
      description: "Review the draft slot before protecting it.",
      preview_boundary_summary: "Preview only.",
      selection_reason: "Nearest high-stakes event needs protected prep.",
      approval_or_reversibility_hint: "Approving would create a reviewable hold.",
      autonomy_tier: "ask_always",
      draft_class: "calendar_hold",
      source_refs: ["calendar:event:1"],
      evidence_kinds: ["calendar"],
      artifact_summary_lines: ["Protect 45 minutes before the interview"],
      draft_preview: {
        label: "Draft hold",
        content: "Hold Tue 3pm",
        content_type: "text",
      },
    }),
    {
      title: "Approval preview",
      summary: "Review the draft slot before protecting it.",
      previewBoundarySummary: "Preview only.",
      boundedReason: "Nearest high-stakes event needs protected prep.",
      selectionReason: "Nearest high-stakes event needs protected prep.",
      consequencePreview: "Approving would create a reviewable hold.",
      provenanceCue: "Traceable to the continuity artifacts used to prepare this draft.",
      sourceSummary: "Based on 1 source",
      autonomyDecision: {
        autonomy_level: "ask_always",
      },
      approvalReview: {
        title: "Approval preview",
        reason: "Review the draft slot before protecting it.",
        consequence_summary_lines: ["Protect 45 minutes before the interview"],
        source_refs: ["calendar:event:1"],
        draft_preview: {
          label: "Draft hold",
          content: "Hold Tue 3pm",
          content_type: "text",
        },
      },
    },
  );

  assert.equal(
    simulatorApprovalPreviewStateFromUnknown({ kind: "simulator_reversible_preview" }),
    null,
  );
});

test("approval review state helper derives shared simulator preview detail state", () => {
  assert.deepEqual(
    simulatorPreviewDetailsFromUnknown({
      kind: "simulator_reversible_preview",
      description: "Preview a reversible change.",
      selection_reason: "This change remains inside reversible boundaries.",
      approval_or_reversibility_hint: "Undo would remove the temporary hold.",
      draft_class: "calendar_hold",
      source_refs: ["calendar:event:2"],
      evidence_kinds: ["calendar"],
      preview_boundary_summary: "No external writes occur in preview mode.",
      rollout_stage: "review",
      calibration_mode: "bounded_deterministic",
      review_surface_available: false,
    }),
    {
      boundedReason: "This change remains inside reversible boundaries.",
      selectionReason: "This change remains inside reversible boundaries.",
      hasDistinctSelectionReason: false,
      consequencePreview: "Undo would remove the temporary hold.",
      provenanceCue: "Traceable to the continuity artifacts used to prepare this draft.",
      sourceSummary: "Based on 1 source",
      rolloutSummary:
        "Rollout stage: review. Calibration mode: bounded deterministic. Review surface remains hidden in this rollout.",
      previewBoundarySummary: "No external writes occur in preview mode.",
      reversibilityHint: "Undo would remove the temporary hold.",
    },
  );

  assert.deepEqual(
    simulatorPreviewDetailsFromUnknown({ kind: "prepared_draft" }),
    {
      boundedReason: null,
      selectionReason: null,
      hasDistinctSelectionReason: false,
      consequencePreview: null,
      provenanceCue: null,
      sourceSummary: null,
      rolloutSummary: null,
      previewBoundarySummary: null,
      reversibilityHint: null,
    },
  );
});

test("approval review state helper derives proactive simulator preview metadata", () => {
  assert.deepEqual(
    simulatorProactivePreviewStateFromUnknown({
      kind: "simulator_approval_preview",
      source_refs: ["thread:1", "thread:2"],
      persisted_from_continuity: true,
      approval_kind: "calendar_hold",
      draft_preview: {
        label: "Draft hold",
        content: "Hold Tue 3pm | Protect prep time",
        content_type: "text",
      },
    }),
    {
      sourceSummary: "Based on 2 sources",
      persistenceReason:
        simulatorPreviewPersistenceFallback(),
      approvalKindLabel: "calendar hold",
      draftPreview: {
        label: "Draft hold",
        content: "Hold Tue 3pm | Protect prep time",
        content_type: "text",
      },
      draftPreviewSummary: "Hold Tue 3pm | Protect prep time",
    },
  );

  assert.deepEqual(
    simulatorProactivePreviewStateFromUnknown({ kind: "simulator_reversible_preview" }),
    {
      sourceSummary: null,
      persistenceReason: null,
      approvalKindLabel: null,
      draftPreview: null,
      draftPreviewSummary: null,
    },
  );
});

test("approval review state helper derives simulator dashboard card summary state", () => {
  assert.deepEqual(
    simulatorPreviewCardSummaryStateFromUnknown({
      kind: "simulator_approval_preview",
      title: "Approval preview",
      description: "Review the draft slot before protecting it.",
      selection_reason: "Nearest high-stakes event needs protected prep.",
      approval_or_reversibility_hint: "Approving would create a reviewable hold.",
      source_refs: ["calendar:event:1"],
      evidence_kinds: ["calendar"],
      preview_boundary_summary: "Preview only.",
      artifact_summary_lines: ["Protect 45 minutes before the interview", "Keep the slot reviewable"],
      draft_preview: {
        label: "Draft hold",
        content: "Hold Tue 3pm",
        content_type: "text",
      },
    }),
    {
      kind: "approval",
      title: "Approval preview",
      boundedReason: "Nearest high-stakes event needs protected prep.",
      leadSummaryLine: "Protect 45 minutes before the interview",
      supportingSummaryLines: ["Keep the slot reviewable"],
      consequencePreview: "Approving would create a reviewable hold.",
      provenanceCue: "Traceable to append-only continuity artifacts.",
      sourceSummary: "Based on 1 source",
      rolloutSummary: null,
      previewBoundarySummary: "Preview only.",
    },
  );

  assert.deepEqual(
    simulatorPreviewCardSummaryStateFromUnknown({
      kind: "simulator_conflict_fusion",
      title: "Fusion preview",
      description: "Keep both paths together.",
      artifact_summary_lines: ["Approval and reversible options share the same context"],
      source_refs: ["thread:1"],
      preview_boundary_summary: "Preview only.",
    }),
    {
      kind: "fusion",
      title: "Fusion preview",
      boundedReason: "Keep both paths together.",
      leadSummaryLine: "Approval and reversible options share the same context",
      supportingSummaryLines: [],
      consequencePreview: null,
      provenanceCue: "Traceable to append-only continuity artifacts.",
      sourceSummary: "Based on 1 source",
      rolloutSummary: null,
      previewBoundarySummary: "Preview only.",
    },
  );

  assert.equal(
    simulatorPreviewCardSummaryStateFromUnknown({ kind: "prepared_draft" }),
    null,
  );
});

test("approval review state helper derives proactive simulator review surface state", () => {
  assert.deepEqual(
    simulatorReviewSurfaceStateFromUnknown({
      kind: "simulator_approval_preview",
      source_refs: ["thread:1", "thread:2"],
      persisted_from_continuity: true,
      approval_kind: "calendar_hold",
      preview_boundary_summary: "Preview only.",
      approval_or_reversibility_hint: "Approving would create a reviewable hold.",
      evidence_kinds: ["calendar"],
      artifact_summary_lines: ["Protect 45 minutes before the interview"],
      draft_preview: {
        label: "Draft hold",
        content: "Hold Tue 3pm | Protect prep time",
        content_type: "text",
      },
    }),
    {
      kind: "approval",
      sourceSummary: "Based on 2 sources",
      persistenceReason:
        "Persisted from continuity so this bounded simulator review remains available between refreshes.",
      primarySourceRef: "thread:1",
      approvalKindLabel: "calendar hold",
      draftPreview: {
        label: "Draft hold",
        content: "Hold Tue 3pm | Protect prep time",
        content_type: "text",
      },
      draftPreviewSummary: "Hold Tue 3pm | Protect prep time",
      previewBoundarySummary: "Preview only.",
      consequencePreview: "Approving would create a reviewable hold.",
      provenanceCue: "Traceable to append-only continuity artifacts.",
      rolloutSummary: null,
      reviewAvailable: true,
    },
  );

  assert.equal(
    simulatorReviewSurfaceStateFromUnknown({ kind: "prepared_draft" }),
    null,
  );
});

test("simulator preview copy helpers keep shared fallback language stable", () => {
  assert.equal(simulatorPreviewTitle("approval"), "Simulator approval preview");
  assert.equal(simulatorPreviewTitle("fusion"), "Simulator conflict fusion");
  assert.equal(
    simulatorPreviewSummary("reversible"),
    "Bounded simulator projection prepared a reversible internal preview.",
  );
  assert.match(simulatorPreviewSummary("fusion"), /keeps approval and reversible paths together/i);
  assert.equal(simulatorPreviewBadgeLabel("approval"), "approval preview");
  assert.equal(simulatorPreviewBadgeLabel("fusion"), "fusion preview");
  assert.equal(simulatorPreviewToggleLabel(false), "Review preview");
  assert.equal(simulatorPreviewToggleLabel(true), "Hide preview");
  assert.equal(simulatorPreviewOnlyBadgeLabel(), "preview only");
  assert.match(simulatorPreviewBoundaryFallback(), /preview only/i);
  assert.match(simulatorPreviewPersistenceFallback(), /between refreshes/i);
  assert.equal(
    simulatorPreviewRolloutSummary({
      rolloutStage: "shadow",
      calibrationMode: "shadow_only",
      reviewSurfaceAvailable: true,
    }),
    "Rollout stage: shadow. Calibration mode: shadow only.",
  );
  assert.equal(
    simulatorPreviewRolloutSummary({
      rolloutStage: null,
      calibrationMode: null,
      reviewSurfaceAvailable: true,
    }),
    null,
  );
});
