// @locs-version: 1.0
import { titleCase } from "@/lib/workflowGraphCopy";
import { makeId } from "@/lib/workflowGraphUtils";

export function runtimeHints(kind: string): string[] {
  switch (kind) {
    case "trigger": return ["goal_intake"];
    case "condition": return ["ambiguity"];
    case "transform": return ["context"];
    case "tool": return ["executor"];
    case "delegation": return ["capability_router"];
    case "policy": return ["policy_runtime"];
    case "approval": return ["approval_runtime"];
    case "merge": return ["merge_runtime"];
    case "termination": return ["termination_runtime"];
    default: return ["plan", "reflection"];
  }
}

export function defaultPolicy(): Record<string, unknown> {
  return {
    mask: "private",
    approval_mode: "none",
    allowed_tools: [],
    allowed_capabilities: [],
    max_steps: 1,
    max_cost_cents: 0,
    outbound_allowlist: [],
  };
}

export function defaultConfig(kind: string, preset?: string): Record<string, unknown> {
  if (preset) {
    return {
      objective: `Run the ${titleCase(preset)} preset responsibly.`,
      preset_kind: preset,
      memory_scope: "thread_summary",
    };
  }
  switch (kind) {
    case "trigger": return {
      trigger_family: "manual",
      trigger_kind: "manual",
      event_filter: {},
    };
    case "condition": return { expression: "true" };
    case "transform": return { transform_kind: "template", output_contract: {} };
    case "tool": return { capability_id: "web_search", operation: "search", timeout_seconds: 60 };
    case "delegation": return { target_role: "specialist", handoff_contract: {} };
    case "policy": return { enforce_before_node_ids: [] };
    case "approval":
      return {
        approval_reason: "Human review required",
        decision_point_id: makeId("dp"),
        options: [
          { option_id: "approve", label: "Approve", consequence_summary: "Continue the workflow." },
          { option_id: "cancel", label: "Cancel", consequence_summary: "Stop execution." },
        ],
      };
    case "merge": return { merge_strategy: "structured_merge" };
    case "termination": return { output_kind: "chat_reply", final_schema: {} };
    default: return { objective: "Handle this workflow step", memory_scope: "thread_summary" };
  }
}
