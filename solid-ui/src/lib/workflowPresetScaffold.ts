// @locs-version: 1.0
import {
  presetStarterBlueprintsForPreset,
  templateForPreset,
  type PresetNodeKind,
  type PresetStarterBlueprint,
} from "afp-ts/workflows";
import { titleCase } from "@/lib/workflowGraphCopy";
import { defaultConfig } from "@/lib/workflowGraphDefaults";
import { cloneJson, makeId } from "@/lib/workflowGraphUtils";
import { PRESETS } from "@/lib/workflowGraphTypes";
import type { WorkflowNodeDraft } from "@/lib/workflowGraphTypes";
import { isRecord } from "@/lib/eventDetail";

export function branchScaffoldBlueprint(
  label: string,
  parentKind: string,
): Pick<WorkflowNodeDraft, "kind" | "description" | "config" | "prompt" | "metadata"> {
  const normalized = label.toLowerCase();
  if (["reject", "cancel", "block"].includes(normalized)) {
    return {
      kind: "termination",
      description: `${titleCase(label)} ends the workflow from this ${parentKind} branch.`,
      config: {
        ...defaultConfig("termination"),
        output_kind: "chat_reply",
        final_schema: { branch_outcome: normalized, parent_kind: parentKind },
      },
      prompt: undefined,
      metadata: { scaffold_role: "terminal_branch" },
    };
  }
  if (normalized === "escalate") {
    return {
      kind: "delegation",
      description: `${titleCase(label)} hands the workflow to a specialist path.`,
      config: {
        ...defaultConfig("delegation"),
        target_role: "specialist_reviewer",
        handoff_contract: { branch_label: normalized, parent_kind: parentKind },
      },
      prompt: {
        system_prompt: "Escalate this workflow branch to a bounded specialist path.",
        instruction_prompt: "Preserve policy context and explain why escalation was required.",
        user_editable: true,
      },
      metadata: { scaffold_role: "delegated_branch" },
    };
  }
  if (["fallback", "secondary"].includes(normalized)) {
    return {
      kind: "agent",
      description: `${titleCase(label)} handles the alternate branch with additional reasoning.`,
      config: {
        ...defaultConfig("agent"),
        objective: `Handle the ${normalized} branch for this workflow.`,
      },
      prompt: {
        system_prompt: `Handle the ${normalized} path safely and keep the workflow moving.`,
        instruction_prompt: "Prefer lower-risk or lower-cost alternatives before escalating.",
        user_editable: true,
      },
      metadata: { scaffold_role: "alternate_branch" },
    };
  }
  if (["approve", "allow", "pass", "success", "primary"].includes(normalized)) {
    return {
      kind: "agent",
      description: `${titleCase(label)} continues the main execution path.`,
      config: {
        ...defaultConfig("agent"),
        objective: `Continue the ${normalized} branch for this workflow.`,
      },
      prompt: {
        system_prompt: `Advance the ${normalized} branch responsibly.`,
        instruction_prompt: "Carry forward the current workflow context and stay within policy.",
        user_editable: true,
      },
      metadata: { scaffold_role: "mainline_branch" },
    };
  }
  return {
    kind: "transform",
    description: `${titleCase(label)} transforms workflow state for the next branch step.`,
    config: {
      ...defaultConfig("transform"),
      transform_kind: "template",
      output_contract: { branch_label: normalized, parent_kind: parentKind },
    },
    prompt: undefined,
    metadata: { scaffold_role: "transform_branch" },
  };
}

export function presetTemplateId(preset: string): string {
  const mapping = templateForPreset(preset as PresetNodeKind);
  return mapping?.template_id ?? "linear_worker";
}

export function presetStarterBlueprints(preset: string): PresetStarterBlueprint[] {
  const presetKind = PRESETS.includes(preset as typeof PRESETS[number]) ? preset as PresetNodeKind : null;
  const sharedBlueprints = presetKind ? presetStarterBlueprintsForPreset(presetKind) : null;
  if (!sharedBlueprints) {
    return [
      {
        kind: "agent",
        label: titleCase(preset),
        description: `${titleCase(preset)} preset node.`,
        slot_name: "intake_slot",
        config: defaultConfig("agent", preset),
        runtime_kind_source: "agent",
      },
    ];
  }

  return sharedBlueprints.map((blueprint) => {
    const config = cloneJson(blueprint.config);
    if (blueprint.kind === "approval" && isRecord(config)) {
      const approvalConfig = config;
      if (typeof approvalConfig.decision_point_id !== "string" || !approvalConfig.decision_point_id) {
        approvalConfig.decision_point_id = makeId("dp");
      }
    }
    return {
      ...blueprint,
      config,
      policy: blueprint.policy ? cloneJson(blueprint.policy) : undefined,
      prompt: blueprint.prompt ? cloneJson(blueprint.prompt) : undefined,
    };
  });
}
