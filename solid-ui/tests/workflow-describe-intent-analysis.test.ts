import test from "node:test";
import assert from "node:assert/strict";

import type { WorkflowGraphDraft, WorkflowNodeDraft } from "../src/lib/workflowGraphTypes.ts";
import {
  describeHistoryComparison,
  describeHistoryComparisonForDraft,
  describeHistoryEntryComposerState,
  selectedDescribeHistoryEntryForDraft,
  workflowDescribeBranchFailureFeedback,
  workflowDescribeBranchSavedFeedback,
  workflowDescribeCreatePreflightFeedback,
  workflowDescribeCreatedFeedback,
  workflowDescribeFallbackFeedback,
  workflowIntentExpansionWithOverrides,
  workflowRegeneratePreflightFeedback,
  workflowRegeneratedFeedback,
  workflowRegenerationFallbackFeedback,
  workflowRegenerationImpactVisible,
  workflowSourceIntentForRegeneration,
} from "../src/lib/workflowDescribeIntentAnalysis.ts";

function node(
  id: string,
  metadata: Record<string, unknown> = {},
  config: Record<string, unknown> = {},
): WorkflowNodeDraft {
  return {
    id,
    kind: "tool",
    label: id,
    description: "",
    position: { x: 0, y: 0 },
    config,
    policy: {},
    hidden_runtime_nodes: [],
    metadata,
  };
}

function graph(): WorkflowGraphDraft {
  return {
    version: "1",
    workflow_id: "wf-1",
    title: "Workflow",
    description: "Existing objective",
    status: "draft",
    environment: "dev",
    owner_user_id: "user-1",
    root_node_ids: ["trigger"],
    nodes: [
      node("trigger", { generated_by: "intent_builder" }),
      node("locked", { generated_by: "intent_builder" }, {
        regeneration_lock: true,
        regeneration_lock_scope: "subgraph",
      }),
      node("manual"),
    ],
    edges: [
      {
        id: "edge-1",
        source: "trigger",
        target: "locked",
        metadata: { generated_by: "intent_builder" },
      },
      {
        id: "edge-2",
        source: "locked",
        target: "manual",
        metadata: {},
      },
    ],
    presets: [],
    template_bindings: [],
    optimization_mode: "balanced",
    metadata: {
      inferred_preset: "email_guardian",
      source_intent: "Existing objective",
    },
  };
}

test("describeHistoryComparison compares current graph state with a describe event", () => {
  const comparison = describeHistoryComparison({
    draft: graph(),
    entry: {
      event_id: "event-1",
      event_kind: "updated",
      intent: "New objective",
      preset_kind: "research_assistant",
      optimization_mode: "speed",
      regeneration_mode: "rebuild",
    },
    intentOverride: "",
    optimizationOverride: "",
    presetOverride: "",
    regenerationMode: "preserve_manual",
    workflowDescription: "Fallback objective",
  });

  assert.equal(comparison.intentChanged, true);
  assert.equal(comparison.presetChanged, true);
  assert.equal(comparison.optimizationChanged, true);
  assert.equal(comparison.regenerationChanged, true);
  assert.equal(comparison.currentNodeCount, 3);
  assert.equal(comparison.currentEdgeCount, 2);
  assert.equal(comparison.currentGeneratedNodeCount, 2);
  assert.equal(comparison.currentGeneratedEdgeCount, 1);
  assert.equal(comparison.protectedNodeCount, 2);
  assert.equal(comparison.protectedEdgeCount, 1);
  assert.equal(comparison.preservedManualNodeCount, 2);
  assert.equal(comparison.preservedManualEdgeCount, 1);
  assert.equal(comparison.preservedProtectedNodeCount, 2);
  assert.equal(comparison.preservedProtectedEdgeCount, 1);
  assert.equal(typeof comparison.estimatedPresetKind, "string");
  assert.equal(comparison.estimatedGeneratedNodeCount > 0, true);
  assert.equal(comparison.estimatedGeneratedEdgeCount >= 0, true);
});

test("describeHistoryComparison honors explicit current overrides", () => {
  const comparison = describeHistoryComparison({
    draft: graph(),
    entry: {
      event_id: "event-1",
      event_kind: "updated",
      intent: "Override objective",
      preset_kind: "finance_guardian",
      optimization_mode: "cost",
      regeneration_mode: "rebuild",
    },
    intentOverride: "Override objective",
    optimizationOverride: "cost",
    presetOverride: "finance_guardian",
    regenerationMode: "rebuild",
    workflowDescription: "Fallback objective",
  });

  assert.equal(comparison.intentChanged, false);
  assert.equal(comparison.presetChanged, false);
  assert.equal(comparison.optimizationChanged, false);
  assert.equal(comparison.regenerationChanged, false);
});

test("workflow intent expansion and regeneration visibility helpers normalize view state", () => {
  assert.equal(workflowIntentExpansionWithOverrides("   ", "", ""), null);

  const expansion = workflowIntentExpansionWithOverrides("Research customer renewals", "finance_guardian", "cost");
  assert.ok(expansion);
  assert.equal(expansion.preset_kind, "finance_guardian");
  assert.equal(expansion.optimization_mode, "cost");

  assert.equal(workflowRegenerationImpactVisible({ intent: "   ", hasWorkflow: true }), false);
  assert.equal(workflowRegenerationImpactVisible({ intent: "Build workflow", hasWorkflow: false }), false);
  assert.equal(workflowRegenerationImpactVisible({ intent: "Build workflow", hasWorkflow: true }), true);
});

test("workflow describe feedback helpers preserve action copy", () => {
  assert.equal(workflowDescribeBranchSavedFeedback(), "Saved a new workflow branch from this describe event.");
  assert.equal(
    workflowDescribeBranchFailureFeedback(new Error("offline")),
    "Could not save branch from describe history: offline",
  );
  assert.equal(
    workflowDescribeBranchFailureFeedback("blocked"),
    "Could not save branch from describe history: blocked",
  );
  assert.equal(
    workflowDescribeCreatePreflightFeedback("   "),
    "Describe the workflow you want to build first.",
  );
  assert.equal(workflowDescribeCreatePreflightFeedback("Build workflow"), null);
  assert.equal(
    workflowDescribeCreatedFeedback("research_assistant"),
    "Generated a Research Assistant starter workflow from your description.",
  );
  assert.equal(
    workflowDescribeCreatedFeedback(undefined),
    "Generated a Research Assistant starter workflow from your description.",
  );
  assert.equal(
    workflowDescribeFallbackFeedback(new Error("service unavailable")),
    "Used local describe fallback: service unavailable",
  );
  assert.equal(
    workflowRegeneratePreflightFeedback({ hasWorkflow: false, sourceIntent: "" }),
    "Select a workflow to regenerate it from description.",
  );
  assert.equal(
    workflowRegeneratePreflightFeedback({ hasWorkflow: true, sourceIntent: "" }),
    "This workflow does not have a saved description to regenerate from.",
  );
  assert.equal(
    workflowRegeneratePreflightFeedback({ hasWorkflow: true, sourceIntent: "Build workflow" }),
    null,
  );
  assert.equal(
    workflowRegeneratedFeedback(),
    "Regenerated the workflow draft from its description. Save when you're happy with the updated graph.",
  );
  assert.equal(
    workflowRegenerationFallbackFeedback("local only"),
    "Used local regeneration fallback: local only",
  );
});

test("workflowSourceIntentForRegeneration resolves composer, metadata, then description", () => {
  assert.equal(
    workflowSourceIntentForRegeneration({
      composerIntent: "  Composer objective  ",
      draft: graph(),
      description: "Description objective",
    }),
    "Composer objective",
  );
  assert.equal(
    workflowSourceIntentForRegeneration({
      composerIntent: "  ",
      draft: graph(),
      description: "Description objective",
    }),
    "Existing objective",
  );
  assert.equal(
    workflowSourceIntentForRegeneration({
      composerIntent: "",
      draft: {
        ...graph(),
        metadata: {},
      },
      description: " Description objective ",
    }),
    "Description objective",
  );
  assert.equal(
    workflowSourceIntentForRegeneration({
      composerIntent: "",
      draft: {
        ...graph(),
        metadata: {},
      },
      description: "",
    }),
    "",
  );
});

test("describe history view helpers select entries and wrap nullable comparison state", () => {
  const draft = {
    ...graph(),
    metadata: {
      ...graph().metadata,
      describe_history: [
        {
          event_id: "older",
          event_kind: "created",
          intent: "Older objective",
        },
        {
          event_id: "newer",
          event_kind: "updated",
          intent: "Newer objective",
          preset_kind: "research_assistant",
        },
      ],
    },
  };

  const selected = selectedDescribeHistoryEntryForDraft(draft, "newer");
  assert.equal(selected?.event_id, "newer");
  assert.equal(selectedDescribeHistoryEntryForDraft(draft, "missing"), null);
  assert.equal(selectedDescribeHistoryEntryForDraft(null, "newer"), null);

  assert.equal(
    describeHistoryComparisonForDraft({
      draft: null,
      entry: selected,
      intentOverride: "",
      optimizationOverride: "",
      presetOverride: "",
      regenerationMode: "preserve_manual",
    }),
    null,
  );
  const comparison = describeHistoryComparisonForDraft({
    draft,
    entry: selected,
    intentOverride: "",
    optimizationOverride: "",
    presetOverride: "",
    regenerationMode: "preserve_manual",
    workflowDescription: "Fallback objective",
  });
  assert.ok(comparison);
  assert.equal(comparison.intentChanged, true);
});

test("describeHistoryEntryComposerState normalizes history entry controls", () => {
  assert.deepEqual(
    describeHistoryEntryComposerState({
      event_id: "event-1",
      event_kind: "updated",
      intent: "Build workflow",
      preset_kind: "research_assistant",
      optimization_mode: "speed",
      regeneration_mode: "rebuild",
    }),
    {
      intent: "Build workflow",
      presetOverride: "research_assistant",
      optimizationOverride: "speed",
      regenerationMode: "rebuild",
    },
  );

  assert.deepEqual(
    describeHistoryEntryComposerState({
      event_id: "event-2",
      event_kind: "updated",
      intent: "Build workflow",
      preset_kind: undefined,
      optimization_mode: "invalid",
      regeneration_mode: "invalid",
    }),
    {
      intent: "Build workflow",
      presetOverride: "",
      optimizationOverride: "",
      regenerationMode: "preserve_manual",
    },
  );
});
