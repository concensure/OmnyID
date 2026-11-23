import test from "node:test";
import assert from "node:assert/strict";

import type {
  WorkflowGraphDraft,
  WorkflowNodeDraft,
} from "../src/lib/workflowGraphTypes.ts";
import {
  workflowGraphAfterTemplateSuggestionScaffold,
  workflowPresetTemplateMetadata,
  workflowTemplateSuggestionAcceptedFeedback,
  workflowTemplateSuggestionDismissedFeedback,
  workflowTemplateSuggestionPreferenceMetadata,
  workflowTemplateSuggestionScaffoldMetadata,
} from "../src/lib/workflowTemplateScaffold.ts";
import type { TemplateScaffoldStep } from "../src/lib/workflowReviewTypes.ts";

function node(
  id: string,
  role: string,
  position = { x: 0, y: 0 },
): WorkflowNodeDraft {
  return {
    id,
    kind: "tool",
    label: id,
    position,
    config: {},
    policy: {},
    hidden_runtime_nodes: [],
    metadata: {
      semantic_role: role,
    },
  };
}

function graph(): WorkflowGraphDraft {
  return {
    version: "omnyid-workflow.v1",
    workflow_id: "wf-template",
    title: "Template graph",
    status: "draft",
    environment: "dev",
    owner_user_id: "user-1",
    root_node_ids: ["source"],
    nodes: [
      node("source", "pdf_source", { x: 0, y: 100 }),
      node("target", "spreadsheet_output", { x: 300, y: 100 }),
    ],
    edges: [
      { id: "edge-direct", source: "source", target: "target", metadata: { existing: true } },
    ],
    presets: [],
    template_bindings: [
      {
        template_id: "old-template",
        slot_name: "old-source",
        node_ids: ["source"],
        metadata: { old: true },
      },
    ],
    optimization_mode: "balanced",
    metadata: {},
  };
}

const steps: TemplateScaffoldStep[] = [
  {
    label: "Extract Dataset",
    kind: "transform",
    description: "Extract tabular data.",
    semanticRole: "extraction_step",
    config: {
      transform_kind: "document_extract",
    },
  },
  {
    label: "Review Dataset",
    kind: "approval",
    description: "Review extracted data.",
    semanticRole: "review_step",
    config: {
      approval_reason: "Review rows.",
      decision_point_id: "",
      options: [],
    },
  },
];

test("workflowTemplateSuggestionPreferenceMetadata accepts a template and removes it from dismissed", () => {
  assert.deepEqual(
    workflowTemplateSuggestionPreferenceMetadata({
      metadata: {
        accepted_template_suggestions: ["existing", "existing", 3],
        dismissed_template_suggestions: ["template-a", "other", null],
        unchanged: "kept",
      },
      templateId: "template-a",
      preference: "accepted",
      reviewedAt: "2026-07-18T00:00:00.000Z",
    }),
    {
      accepted_template_suggestions: ["existing", "template-a"],
      dismissed_template_suggestions: ["other"],
      template_suggestion_reviewed_at: "2026-07-18T00:00:00.000Z",
      unchanged: "kept",
    },
  );
});

test("workflowTemplateSuggestionPreferenceMetadata dismisses a template and removes it from accepted", () => {
  assert.deepEqual(
    workflowTemplateSuggestionPreferenceMetadata({
      metadata: {
        accepted_template_suggestions: ["template-a", "existing"],
        dismissed_template_suggestions: ["other", "other"],
      },
      templateId: "template-a",
      preference: "dismissed",
      reviewedAt: "2026-07-18T00:01:00.000Z",
    }),
    {
      accepted_template_suggestions: ["existing"],
      dismissed_template_suggestions: ["other", "template-a"],
      template_suggestion_reviewed_at: "2026-07-18T00:01:00.000Z",
    },
  );
});

test("workflowTemplateSuggestionScaffoldMetadata records scaffold and runtime ids", () => {
  assert.deepEqual(
    workflowTemplateSuggestionScaffoldMetadata({
      metadata: {
        scaffolded_template_suggestions: ["existing", "existing", 4],
        suggested_template_runtime_ids: ["runtime-a", null],
        preset_template_ids: ["runtime-a", "runtime-a"],
        other: true,
      },
      templateId: "template-a",
      runtimeTemplateId: "runtime-b",
    }),
    {
      scaffolded_template_suggestions: ["existing", "template-a"],
      suggested_template_runtime_ids: ["runtime-a", "runtime-b"],
      preset_template_ids: ["runtime-a", "runtime-b"],
      other: true,
    },
  );
});

test("workflowTemplateSuggestionScaffoldMetadata omits missing runtime ids while recording scaffold", () => {
  assert.deepEqual(
    workflowTemplateSuggestionScaffoldMetadata({
      metadata: {},
      templateId: "template-a",
      runtimeTemplateId: null,
    }),
    {
      scaffolded_template_suggestions: ["template-a"],
      suggested_template_runtime_ids: [],
      preset_template_ids: [],
    },
  );
});

test("workflowPresetTemplateMetadata records preset template ids defensively", () => {
  assert.deepEqual(
    workflowPresetTemplateMetadata({
      metadata: {
        preset_template_ids: ["template-a", 1, "template-a"],
        other: "kept",
      },
      templateId: "template-b",
    }),
    {
      preset_template_ids: ["template-a", "template-b"],
      other: "kept",
    },
  );
});

test("workflow template suggestion feedback preserves accepted and dismissed copy", () => {
  assert.equal(
    workflowTemplateSuggestionAcceptedFeedback({ insertedCount: 2, title: "Document to spreadsheet" }),
    "Marked Document to spreadsheet as the preferred reliable template and scaffolded 2 supporting nodes.",
  );
  assert.equal(
    workflowTemplateSuggestionAcceptedFeedback({ insertedCount: 1, title: "Document to spreadsheet" }),
    "Marked Document to spreadsheet as the preferred reliable template and scaffolded 1 supporting node.",
  );
  assert.equal(
    workflowTemplateSuggestionAcceptedFeedback({ insertedCount: 0, title: "Document to spreadsheet" }),
    "Marked Document to spreadsheet as the preferred reliable template while keeping the graph customizable.",
  );
  assert.equal(
    workflowTemplateSuggestionDismissedFeedback("Document to spreadsheet"),
    "Kept the custom graph and dismissed the Document to spreadsheet template suggestion for this draft.",
  );
});

test("workflowGraphAfterTemplateSuggestionScaffold inserts missing steps between matched nodes", () => {
  const draft = graph();
  const result = workflowGraphAfterTemplateSuggestionScaffold({
    draft,
    matchedNodeIds: ["source", "target"],
    runtimeLineage: null,
    steps,
    templateId: "document_to_spreadsheet",
  });

  assert.equal(result.insertedCount, 2);
  assert.equal(draft.nodes.length, 2);
  assert.equal(draft.edges[0].id, "edge-direct");
  assert.deepEqual(result.graph.nodes.map((entry) => entry.label), [
    "source",
    "target",
    "Extract Dataset",
    "Review Dataset",
  ]);
  assert.equal(result.graph.edges.some((entry) => entry.id === "edge-direct"), false);
  assert.equal(result.graph.edges[0].source, "source");
  assert.equal(result.graph.edges[0].target, result.graph.nodes[2].id);
  assert.equal(result.graph.edges[1].source, result.graph.nodes[2].id);
  assert.equal(result.graph.edges[1].target, result.graph.nodes[3].id);
  assert.equal(result.graph.edges[2].source, result.graph.nodes[3].id);
  assert.equal(result.graph.edges[2].target, "target");
  assert.equal(result.graph.metadata.scaffolded_template_suggestions instanceof Array, true);
});

test("workflowGraphAfterTemplateSuggestionScaffold applies runtime lineage to chain nodes", () => {
  const result = workflowGraphAfterTemplateSuggestionScaffold({
    draft: graph(),
    matchedNodeIds: ["source", "target"],
    runtimeLineage: {
      runtimeTemplateId: "action_guarded",
      slotSequence: ["intake_slot", "context_slot", "approval_slot", "finalize_slot"],
    },
    steps,
    templateId: "document_to_spreadsheet",
  });

  assert.equal(result.insertedCount, 2);
  assert.deepEqual(
    result.graph.template_bindings.map((binding) => [binding.template_id, binding.slot_name, binding.node_ids[0]]),
    [
      ["action_guarded", "intake_slot", "source"],
      ["action_guarded", "context_slot", result.graph.nodes[2].id],
      ["action_guarded", "approval_slot", result.graph.nodes[3].id],
      ["action_guarded", "finalize_slot", "target"],
    ],
  );
  assert.equal(result.graph.nodes[0].metadata.template_id, "action_guarded");
  assert.equal(result.graph.nodes[0].metadata.template_slot, "intake_slot");
  assert.deepEqual(result.graph.metadata.suggested_template_runtime_ids, ["action_guarded"]);
});

test("workflowGraphAfterTemplateSuggestionScaffold updates lineage even when roles already exist", () => {
  const draft = {
    ...graph(),
    nodes: [
      ...graph().nodes,
      node("existing-extraction", "extraction_step"),
      node("existing-review", "review_step"),
    ],
  };
  const result = workflowGraphAfterTemplateSuggestionScaffold({
    draft,
    matchedNodeIds: ["source", "target"],
    runtimeLineage: {
      runtimeTemplateId: "linear_worker",
      slotSequence: ["intake_slot", "finalize_slot"],
    },
    steps,
    templateId: "document_to_spreadsheet",
  });

  assert.equal(result.insertedCount, 0);
  assert.equal(result.graph.nodes.length, 4);
  assert.deepEqual(
    result.graph.template_bindings.map((binding) => [binding.slot_name, binding.node_ids[0]]),
    [
      ["intake_slot", "source"],
      ["finalize_slot", "target"],
    ],
  );
});

test("workflowGraphAfterTemplateSuggestionScaffold no-ops without two matched nodes", () => {
  const draft = graph();
  const result = workflowGraphAfterTemplateSuggestionScaffold({
    draft,
    matchedNodeIds: ["source", "missing"],
    runtimeLineage: null,
    steps,
    templateId: "document_to_spreadsheet",
  });

  assert.equal(result.insertedCount, 0);
  assert.equal(result.graph, draft);
});
