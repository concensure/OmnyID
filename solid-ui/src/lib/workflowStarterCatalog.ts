// @locs-version: 1.0
import type {
  SemanticStarterDefinition,
  SuggestedTemplateRuntimeLineage,
  TemplateScaffoldStep,
} from "@/lib/workflowReviewTypes";

export const SEMANTIC_STARTERS: SemanticStarterDefinition[] = [
  {
    id: "pdf_source",
    label: "PDF",
    nodeKind: "tool",
    description: "A human-facing document source node for PDF and attachment ingest.",
    config: { capability_id: "document_ingest", operation: "ingest_pdf", source_kind: "attachment_or_url" },
    semanticRole: "pdf_source",
  },
  {
    id: "spreadsheet_output",
    label: "Spreadsheet",
    nodeKind: "termination",
    description: "A human-facing spreadsheet output node for CSV or XLSX export.",
    config: { output_kind: "spreadsheet_export", final_schema: { formats: ["csv", "xlsx"] } },
    semanticRole: "spreadsheet_output",
  },
  {
    id: "weather_source",
    label: "Weather",
    nodeKind: "tool",
    description: "A live forecast source node for daily weather datasets.",
    config: { capability_id: "weather_forecast", operation: "fetch_forecast", source_kind: "live_external" },
    semanticRole: "weather_source",
  },
  {
    id: "chart_output",
    label: "Chart",
    nodeKind: "termination",
    description: "A human-facing chart output node for graph and forecast visualization.",
    config: { output_kind: "chart_view", final_schema: { chart_family: "series_visualization" } },
    semanticRole: "chart_output",
  },
  {
    id: "meeting_source",
    label: "Meeting Recording",
    nodeKind: "tool",
    description: "A human-facing meeting recording or transcript source node.",
    config: { capability_id: "meeting_ingest", operation: "ingest_transcript_or_audio", source_kind: "attachment_or_message" },
    semanticRole: "meeting_source",
  },
  {
    id: "digest_output",
    label: "Digest",
    nodeKind: "termination",
    description: "A human-facing summary or digest output node.",
    config: { output_kind: "content_digest", final_schema: { digest_kind: "summary" } },
    semanticRole: "digest_output",
  },
  {
    id: "budget_source",
    label: "Budget",
    nodeKind: "agent",
    description: "A human-facing budget projection or cash-flow planning node.",
    config: { objective: "Prepare a budget projection workflow step.", memory_scope: "thread_summary", preset_kind: "finance_guardian" },
    semanticRole: "budget_source",
  },
  {
    id: "skill_capsule_step",
    label: "Reusable Skill",
    nodeKind: "tool",
    description: "A user-extensible Skill Capsule step backed by the deterministic skill runtime.",
    config: {
      connector_family: "skill_capsule",
      capability_id: "skill_capsule",
      operation: "compose",
      atom_id: "code.edit.safe",
      source_kind: "user_extensible_skill",
    },
    semanticRole: "skill_capsule_step",
  },
];

export const TEMPLATE_SCAFFOLD_STEPS: Record<string, TemplateScaffoldStep[]> = {
  document_to_spreadsheet: [
    {
      label: "Extract Dataset",
      kind: "transform",
      description: "Normalize document content into a reviewable dataset before export.",
      semanticRole: "extraction_step",
      config: { transform_kind: "document_extract", output_contract: { artifact: "tabular_dataset" } },
    },
    {
      label: "Review Dataset",
      kind: "approval",
      description: "Pause for human review before spreadsheet export.",
      semanticRole: "review_step",
      config: {
        approval_reason: "Review extracted rows and columns before spreadsheet export.",
        decision_point_id: "",
        options: [
          { option_id: "approve", label: "Approve", consequence_summary: "Continue to export." },
          { option_id: "revise", label: "Revise", consequence_summary: "Revise the extracted dataset first." },
        ],
      },
    },
  ],
  weather_to_chart: [
    {
      label: "Prepare Forecast Dataset",
      kind: "transform",
      description: "Shape daily forecast data into a chart-ready series dataset.",
      semanticRole: "extraction_step",
      config: { transform_kind: "forecast_to_dataset", output_contract: { artifact: "tabular_dataset" } },
    },
  ],
  meeting_to_digest: [
    {
      label: "Prepare Transcript",
      kind: "transform",
      description: "Normalize recording or transcript content into a digest-ready text packet.",
      semanticRole: "extraction_step",
      config: { transform_kind: "transcript_normalize", output_contract: { artifact: "transcript" } },
    },
  ],
  budget_projection: [
    {
      label: "Project Cash Flow",
      kind: "transform",
      description: "Turn budget inputs into a month-by-month projection dataset.",
      semanticRole: "extraction_step",
      config: { transform_kind: "budget_projection", output_contract: { artifact: "tabular_dataset" } },
    },
  ],
};

export const SUGGESTED_TEMPLATE_RUNTIME_LINEAGE: Record<string, SuggestedTemplateRuntimeLineage> = {
  document_to_spreadsheet: {
    runtimeTemplateId: "action_guarded",
    slotSequence: ["intake_slot", "context_slot", "approval_slot", "finalize_slot"],
  },
  weather_to_chart: {
    runtimeTemplateId: "linear_worker",
    slotSequence: ["intake_slot", "gather_slot", "finalize_slot"],
  },
  meeting_to_digest: {
    runtimeTemplateId: "linear_worker",
    slotSequence: ["intake_slot", "context_slot", "finalize_slot"],
  },
  budget_projection: {
    runtimeTemplateId: "linear_worker",
    slotSequence: ["intake_slot", "context_slot", "finalize_slot"],
  },
};

export function semanticStarterById(id: string): SemanticStarterDefinition | undefined {
  return SEMANTIC_STARTERS.find((entry) => entry.id === id);
}

export function templateScaffoldSteps(templateId: string): TemplateScaffoldStep[] {
  return TEMPLATE_SCAFFOLD_STEPS[templateId] ?? [];
}

export function suggestedTemplateRuntimeLineage(templateId: string): SuggestedTemplateRuntimeLineage | undefined {
  return SUGGESTED_TEMPLATE_RUNTIME_LINEAGE[templateId];
}
