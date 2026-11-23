// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import type { WorkflowFamilyContext } from "@/lib/workflowReviewTypes";

export function parseWorkflowFamilyContext(value: unknown): WorkflowFamilyContext | null {
  if (!isRecord(value)) return null;
  const raw = value;
  const rawValues = isRecord(raw.values) ? raw.values : {};
  const values = Object.entries(rawValues)
    .map(([key, item]) => {
      if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
        return { key, value: String(item) };
      }
      return null;
    })
    .filter((entry): entry is { key: string; value: string } => entry !== null);
  const semanticRole = typeof raw.semantic_role === "string" ? raw.semantic_role : null;
  const familyId = typeof raw.family_id === "string" ? raw.family_id : null;
  const familyWorkflowId =
    typeof raw.family_workflow_id === "string" ? raw.family_workflow_id : null;
  const familyAssetWorkflowId =
    typeof raw.family_asset_workflow_id === "string" ? raw.family_asset_workflow_id : null;
  const instanceWorkflowId =
    typeof raw.instance_workflow_id === "string" ? raw.instance_workflow_id : null;
  if (!semanticRole && !familyId && !familyWorkflowId && !familyAssetWorkflowId && !instanceWorkflowId && values.length === 0) {
    return null;
  }
  return {
    semanticRole,
    familyId,
    familyWorkflowId,
    familyAssetWorkflowId,
    instanceWorkflowId,
    values,
  };
}
