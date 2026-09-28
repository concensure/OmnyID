import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsOperationalCardBadge,
  decisionOsOperationalCardLabel,
  decisionOsOperationalContinuityCardState,
  decisionOsOperationalCostFooterLabel,
  decisionOsOperationalHiddenLabelsSummary,
  decisionOsOperationalSimulatorPreviewCardStateFromUnknown,
  decisionOsOperationalSimulatorPreviewCardState,
  decisionOsResponseAttentionDetail,
  decisionOsResponseAttentionTitle,
  decisionOsResponseQueueReviewLabel,
} from "../src/lib/decisionOsOperationalPressureState.ts";

test("decisionos operational pressure state exposes stable card labels and badges", () => {
  assert.equal(decisionOsOperationalCardLabel("continuity"), "Continuity");
  assert.equal(decisionOsOperationalCardLabel("responses"), "Responses");
  assert.equal(decisionOsOperationalCardLabel("cost"), "Cost");
  assert.equal(decisionOsOperationalCardBadge({ kind: "continuity", isPrimary: true }), "leading");
  assert.equal(decisionOsOperationalCardBadge({ kind: "continuity", isPrimary: false }), "active");
  assert.equal(decisionOsOperationalCardBadge({ kind: "responses", isUrgent: true }), "urgent");
  assert.equal(decisionOsOperationalCardBadge({ kind: "responses", isUrgent: false }), "due soon");
});

test("decisionos operational pressure state formats response attention copy", () => {
  assert.equal(decisionOsResponseAttentionTitle(1), "1 conversation need attention");
  assert.equal(decisionOsResponseAttentionTitle(3), "3 conversations need attention");
  assert.equal(decisionOsResponseAttentionDetail("Reply to Alex"), "Reply to Alex");
  assert.equal(
    decisionOsResponseAttentionDetail(""),
    "A response deadline is approaching.",
  );
  assert.equal(decisionOsResponseQueueReviewLabel("Due at 4 PM"), "Due at 4 PM");
  assert.equal(decisionOsResponseQueueReviewLabel(""), "Review response queue");
});

test("decisionos operational pressure state formats cost footer and hidden summaries", () => {
  assert.equal(
    decisionOsOperationalCostFooterLabel(42),
    "42% of monthly cap - Open cost dashboard",
  );
  assert.equal(decisionOsOperationalCostFooterLabel(null), "Open cost dashboard");
  assert.equal(
    decisionOsOperationalHiddenLabelsSummary(["Continuity", "Responses", "Cost"]),
    "continuity - responses - cost",
  );
});

test("decisionos operational pressure state preserves trust-aware continuity review semantics", () => {
  assert.deepEqual(
    decisionOsOperationalContinuityCardState({
      title: "Renewal review ready",
      context: "Prepared decision support is ready for review",
      priorityReason: "Prioritized because object-linked continuity reinforces the same active work item.",
      boundedReason: "Prepared renewal comparison",
      rawReason: null,
      sourceSummary: "Based on 1 source",
      autonomySummary: "notify then act: Prepared work stays reviewable before execution.",
      footer: "Prioritized as decision memo",
      destinationLabel: "decision queue",
      fieldEngineCue: "renewals: 1 pending review",
      isPrimary: true,
    }),
    {
      label: "Continuity",
      title: "Renewal review ready",
      badge: "leading",
      detail: "Prepared decision support is ready for review renewals: 1 pending review",
      boundedReason: "Prepared renewal comparison",
      rawReason: null,
      autonomySummary: "notify then act: Prepared work stays reviewable before execution.",
      priorityRationale: "Prioritized because object-linked continuity reinforces the same active work item.",
      sourceSummary: "Based on 1 source",
      footer: "Prioritized as decision memo",
      actionLabel: "Open decision queue",
    },
  );
});

test("decisionos operational pressure state preserves workspace destination wording for prepared work", () => {
  assert.equal(
    decisionOsOperationalContinuityCardState({
      title: "Prepared work ready",
      context: "Prepared work is ready for review",
      priorityReason: "Prioritized because project preparation is already grounded.",
      boundedReason: "Prepared project workspace review",
      rawReason: null,
      sourceSummary: "Based on 1 source",
      footer: "Prioritized as project prep note",
      destinationLabel: "workspace",
      fieldEngineCue: null,
      isPrimary: false,
    }).actionLabel,
    "Open workspace",
  );
});

test("decisionos operational pressure state formats simulator preview cards", () => {
  assert.deepEqual(
    decisionOsOperationalSimulatorPreviewCardState({
      kind: "approval",
      title: "Approval preview ready",
      boundedReason: "Nearest high-stakes event needs protected prep.",
      footer: "Approving would create a reviewable hold.",
      destinationLabel: "calendar",
    }),
    {
      label: "Preview",
      title: "Approval preview ready",
      badge: "approval preview",
      detail: "Nearest high-stakes event needs protected prep.",
      boundedReason: null,
      rawReason: null,
      footer: "Approving would create a reviewable hold.",
      actionLabel: "Open calendar",
    },
  );

  assert.deepEqual(
    decisionOsOperationalSimulatorPreviewCardState({
      kind: "reversible",
      title: "Reversible preview ready",
      boundedReason: null,
      footer: null,
      destinationLabel: "workspace",
    }),
    {
      label: "Preview",
      title: "Reversible preview ready",
      badge: "reversible preview",
      detail: "Bounded simulator projection prepared a reversible internal preview.",
      boundedReason: null,
      rawReason: null,
      footer: "Review bounded reversible preview",
      actionLabel: "Open workspace",
    },
  );

  assert.deepEqual(
    decisionOsOperationalSimulatorPreviewCardState({
      kind: "fusion",
      title: "Fusion preview ready",
      boundedReason: null,
      footer: null,
      destinationLabel: "decision queue",
    }),
    {
      label: "Preview",
      title: "Fusion preview ready",
      badge: "fusion preview",
      detail: "Bounded simulator projection prepared one comparison that keeps approval and reversible paths together.",
      boundedReason: null,
      rawReason: null,
      footer: "Review bounded fusion preview",
      actionLabel: "Open decision queue",
    },
  );
});

test("decisionos operational pressure state derives simulator preview cards from preview payloads", () => {
  assert.deepEqual(
    decisionOsOperationalSimulatorPreviewCardStateFromUnknown({
      item: {
        kind: "simulator_approval_preview",
        title: "Approval preview ready",
        selection_reason: "Nearest high-stakes event needs protected prep.",
        approval_or_reversibility_hint: "Approving would create a reviewable hold.",
        preview_boundary_summary: "Preview only.",
        source_refs: ["calendar:event:1"],
        autonomy_decision: {
          autonomy_level: "notify_then_act",
          reason: "This remains reviewable before any calendar hold is promoted.",
        },
      },
      destinationLabel: "calendar",
    }),
    {
      label: "Preview",
      title: "Approval preview ready",
      badge: "approval preview",
      detail: "Nearest high-stakes event needs protected prep.",
      boundedReason: null,
      rawReason: null,
      consequencePreview: "Approving would create a reviewable hold.",
      previewBoundarySummary: "Preview only.",
      provenanceCue: "Traceable to append-only continuity artifacts.",
      autonomySummary: "notify then act: This remains reviewable before any calendar hold is promoted.",
      sourceSummary: "Based on 1 source",
      footer: "Approving would create a reviewable hold.",
      actionLabel: "Open calendar",
    },
  );

  assert.deepEqual(
    decisionOsOperationalSimulatorPreviewCardStateFromUnknown({
      item: {
        kind: "simulator_reversible_preview",
        title: "Reversible preview ready",
        description: "Preview a reversible internal change.",
        source_refs: ["calendar:event:2"],
        preview_boundary_summary: "Preview only.",
      },
      destinationLabel: "workspace",
    }),
    {
      label: "Preview",
      title: "Reversible preview ready",
      badge: "reversible preview",
      detail: "Preview a reversible internal change.",
      boundedReason: null,
      rawReason: null,
      previewBoundarySummary: "Preview only.",
      provenanceCue: "Traceable to append-only continuity artifacts.",
      sourceSummary: "Based on 1 source",
      footer: "Preview only.",
      actionLabel: "Open workspace",
    },
  );

  assert.deepEqual(
    decisionOsOperationalSimulatorPreviewCardStateFromUnknown({
      item: {
        kind: "simulator_conflict_fusion",
        title: "Fusion preview ready",
        description: "Keep the approval and reversible paths together in one review point.",
        source_refs: ["thread:aurora"],
        preview_boundary_summary: "Preview only.",
      },
      destinationLabel: "decision queue",
    }),
    {
      label: "Preview",
      title: "Fusion preview ready",
      badge: "fusion preview",
      detail: "Keep the approval and reversible paths together in one review point.",
      boundedReason: null,
      rawReason: null,
      previewBoundarySummary: "Preview only.",
      provenanceCue: "Traceable to append-only continuity artifacts.",
      sourceSummary: "Based on 1 source",
      footer: "Preview only.",
      actionLabel: "Open decision queue",
    },
  );

  assert.equal(
    decisionOsOperationalSimulatorPreviewCardStateFromUnknown({
      item: { kind: "prepared_draft" },
      destinationLabel: "workspace",
    }),
    null,
  );
});
