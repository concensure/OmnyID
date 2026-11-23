// @locs-version: 1.0
import type { SavedWorkflow } from "@/lib/api";
import type {
  WorkflowFamilyParameterField,
  WorkflowFamilyParameterFieldDraft,
} from "@/lib/workflowReviewTypes";
import { isRecord } from "@/lib/eventDetail";

export function branchOriginRecord(
  workflow: SavedWorkflow,
): { parent_workflow_id?: string; history_event_id?: string } | null {
  const metadata = workflowGraphMetadata(workflow);
  const branchOrigin = metadata && isRecord(metadata["branch_origin"]) ? metadata["branch_origin"] : null;
  if (!branchOrigin) return null;
  return {
    parent_workflow_id:
      typeof branchOrigin.parent_workflow_id === "string"
        ? branchOrigin.parent_workflow_id
        : undefined,
    history_event_id:
      typeof branchOrigin.history_event_id === "string"
        ? branchOrigin.history_event_id
        : undefined,
  };
}

export function workflowGraphMetadata(workflow: SavedWorkflow): Record<string, unknown> | null {
  const graph = workflow.graph;
  if (!isRecord(graph)) return null;
  return isRecord(graph.metadata) ? graph.metadata : null;
}

export function workflowFamilyAssetRecord(
  workflow: SavedWorkflow,
): {
  family_id?: string;
  family_label?: string;
  source_workflow_id?: string;
  template_ids: string[];
  runtime_template_ids: string[];
  parameter_schema: WorkflowFamilyParameterField[];
  default_parameters: Record<string, string>;
  promoted_at?: string;
} | null {
  const metadata = workflowGraphMetadata(workflow);
  const record = metadata && isRecord(metadata["workflow_family_asset"]) ? metadata["workflow_family_asset"] : null;
  if (!record) return null;
  return {
    family_id: typeof record.family_id === "string" ? record.family_id : undefined,
    family_label: typeof record.family_label === "string" ? record.family_label : undefined,
    source_workflow_id: typeof record.source_workflow_id === "string" ? record.source_workflow_id : undefined,
    template_ids: Array.isArray(record.template_ids)
      ? record.template_ids.filter((value): value is string => typeof value === "string")
      : [],
    runtime_template_ids: Array.isArray(record.runtime_template_ids)
      ? record.runtime_template_ids.filter((value): value is string => typeof value === "string")
      : [],
    parameter_schema: Array.isArray(record.parameter_schema)
      ? (record.parameter_schema
          .map((entry): WorkflowFamilyParameterFieldDraft | null => {
            if (!isRecord(entry)) return null;
            const raw = entry;
            const kind = raw.kind === "text" || raw.kind === "number" || raw.kind === "select" ? raw.kind : null;
            if (typeof raw.id !== "string" || typeof raw.label !== "string" || !kind) return null;
            return {
              id: raw.id,
              label: raw.label,
              kind,
              description: typeof raw.description === "string" ? raw.description : undefined,
              defaultValue: typeof raw.defaultValue === "string" ? raw.defaultValue : "",
              options: Array.isArray(raw.options)
                ? raw.options
                    .map((option) => {
                      if (!isRecord(option)) return null;
                      const optionRaw = option;
                      if (typeof optionRaw.value !== "string" || typeof optionRaw.label !== "string") return null;
                      return { value: optionRaw.value, label: optionRaw.label };
                    })
                    .filter((option): option is { value: string; label: string } => Boolean(option))
                : undefined,
            };
          })
          .filter((entry): entry is WorkflowFamilyParameterFieldDraft => Boolean(entry))
          .map((entry) => ({
            id: entry.id,
            label: entry.label,
            kind: entry.kind,
            description: entry.description,
            defaultValue: entry.defaultValue,
            options: entry.options,
          } satisfies WorkflowFamilyParameterField)))
      : [],
    default_parameters:
      isRecord(record.default_parameters)
        ? Object.fromEntries(
            Object.entries(record.default_parameters)
              .filter(([, value]) => typeof value === "string")
              .map(([key, value]) => [key, value as string]),
          )
        : {},
    promoted_at: typeof record.promoted_at === "string" ? record.promoted_at : undefined,
  };
}

export function workflowFamilyInstanceRecord(
  workflow: SavedWorkflow,
): {
  family_id?: string;
  family_workflow_id?: string;
  family_label?: string;
  instantiated_at?: string;
} | null {
  const metadata = workflowGraphMetadata(workflow);
  const record = metadata && isRecord(metadata["workflow_family_instance"]) ? metadata["workflow_family_instance"] : null;
  if (!record) return null;
  return {
    family_id: typeof record.family_id === "string" ? record.family_id : undefined,
    family_workflow_id: typeof record.family_workflow_id === "string" ? record.family_workflow_id : undefined,
    family_label: typeof record.family_label === "string" ? record.family_label : undefined,
    instantiated_at: typeof record.instantiated_at === "string" ? record.instantiated_at : undefined,
  };
}
