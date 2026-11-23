// Pure utility functions for deployment policy extraction, drift, and AFP analysis.

import type {
  WorkflowConnectorOverrideFields,
  WorkflowDeployment,
  WorkflowRun,
} from "@/lib/api";
import type {
  CompiledAfpGapFilter,
  CompiledOrchestrationRole,
  DeploymentOverrideDraft,
  DeploymentPolicyDiffEntry,
  NodeDeploymentPolicy,
  NodeDeploymentPolicyChange,
  PendingNodeDeploymentPolicy,
  TargetedDeploymentOverrideDraft,
  WorkflowGraphDraft,
  WorkflowNodeDraft,
} from "./workflowGraphTypes";
import { isRecord } from "@/lib/eventDetail";
import {
  runTimelineSliceForEdge,
  timelineStepAction,
  timelineStepNodeId,
} from "./workflowRunAnalysis";
import {
  compactOverrideDraft,
  deploymentPolicyChanges,
  mergeOverrideFields,
} from "./workflowDeploymentOverrideState";
import {
  deploymentChangeSummaryFieldChangesForNode,
  workflowHasCompiledContract,
  workflowTriggerReadinessSummaryForCompiledIr,
  workflowTriggerReadinessSummaryForWorkflow,
} from "./workflowDeploymentMetadataState";

export type WorkflowConnectorOverrideTargets = {
  families: string[];
  nodes: Array<{ id: string; label: string; family: string }>;
};

export function workflowConnectorOverrideTargets(
  graph: WorkflowGraphDraft | null | undefined,
): WorkflowConnectorOverrideTargets {
  if (!graph) return { families: [], nodes: [] };
  const nodes = graph.nodes
    .filter((node) => node.kind === "tool")
    .map((node) => ({
      id: node.id,
      label: node.label,
      family: workflowNodeIntegrationFamily(node) ?? "integration",
    }));
  const families = Array.from(new Set(nodes.map((node) => node.family))).sort();
  return { families, nodes };
}

export function latestDeploymentForEnvironment(
  deployments: WorkflowDeployment[],
  environment: string,
): WorkflowDeployment | null {
  return deployments.find((deployment) => deployment.environment === environment) ?? deployments[0] ?? null;
}

export function rollbackPreviewDeploymentIdForFocus(
  deploymentId: string | null | undefined,
  deployments: readonly Pick<WorkflowDeployment, "deployment_id" | "environment">[],
): string | null {
  if (!deploymentId) return null;
  const deployment = deployments.find((entry) => entry.deployment_id === deploymentId);
  if (!deployment) return null;
  const activeForEnvironment = deployments.find((entry) => entry.environment === deployment.environment)
    ?? deployments[0]
    ?? null;
  return activeForEnvironment && activeForEnvironment.deployment_id !== deploymentId ? deploymentId : null;
}

// ---------------------------------------------------------------------------
// Node deployment policy extraction
// ---------------------------------------------------------------------------

export function workflowNodeIntegrationFamily(node: WorkflowNodeDraft): string | null {
  if (node.kind !== "tool") return null;
  const capabilityId = typeof node.config.capability_id === "string" ? node.config.capability_id : null;
  switch (capabilityId) {
    case "email": return "communications";
    case "calendar": return "scheduling";
    case "document_extract": return "document_processing";
    case "web_search": return "research";
    case "finance": return "finance";
    case "travel": return "travel";
    default: return "integration";
  }
}

export function nodeDeploymentPolicyFromDeployment(
  node: WorkflowNodeDraft,
  deployment: WorkflowDeployment | null,
  environment: string,
): NodeDeploymentPolicy | null {
  if (!deployment || node.kind !== "tool") return null;
  const manifests = Array.isArray(deployment.ir_snapshot?.manifests)
    ? deployment.ir_snapshot.manifests
    : [];
  const manifest = manifests.find(
    (entry) =>
      isRecord(entry)
      && entry.source_graph_node_id === node.id,
  );
  if (!manifest) return null;

  const binding = isRecord(manifest.connector_binding) ? manifest.connector_binding : null;
  if (!binding) return null;

  const deploymentOverrides = isRecord(binding.deployment_overrides) ? binding.deployment_overrides : null;
  const effectiveOverrides = deploymentOverrides?.[environment];
  if (!isRecord(effectiveOverrides)) return null;
  const overrideRecord = effectiveOverrides;
  return {
    deploymentId: deployment.deployment_id,
    environment,
    family: typeof binding.integration_family === "string" ? binding.integration_family : null,
    provider: typeof binding.provider === "string" ? binding.provider : null,
    service: typeof binding.service === "string" ? binding.service : null,
    source: typeof overrideRecord.source === "string" ? overrideRecord.source : "environment_default",
    fields: {
      delivery_tier: typeof overrideRecord.delivery_tier === "string" ? overrideRecord.delivery_tier : undefined,
      auth_mode: typeof overrideRecord.auth_mode === "string" ? overrideRecord.auth_mode : undefined,
      side_effects: typeof overrideRecord.side_effects === "string" ? overrideRecord.side_effects : undefined,
      provider_route: typeof overrideRecord.provider_route === "string" ? overrideRecord.provider_route : undefined,
    },
  };
}

export function deploymentNodePoliciesForEnvironment(
  deployment: WorkflowDeployment | null,
  environment: string,
): Map<string, NodeDeploymentPolicy> {
  const policies = new Map<string, NodeDeploymentPolicy>();
  if (!deployment) return policies;
  const manifests = Array.isArray(deployment.ir_snapshot?.manifests)
    ? deployment.ir_snapshot.manifests
    : [];
  for (const entry of manifests) {
    if (!isRecord(entry)) continue;
    const manifest = entry;
    const sourceGraphNodeId =
      typeof manifest.source_graph_node_id === "string" ? manifest.source_graph_node_id : null;
    if (!sourceGraphNodeId) continue;

    const binding = isRecord(manifest.connector_binding) ? manifest.connector_binding : null;
    if (!binding) continue;

    const deploymentOverrides = isRecord(binding.deployment_overrides) ? binding.deployment_overrides : null;
    const effectiveOverrides = deploymentOverrides?.[environment];
    if (!isRecord(effectiveOverrides)) continue;
    const overrideRecord = effectiveOverrides;
    policies.set(sourceGraphNodeId, {
      deploymentId: deployment.deployment_id,
      environment,
      family: typeof binding.integration_family === "string" ? binding.integration_family : null,
      provider: typeof binding.provider === "string" ? binding.provider : null,
      service: typeof binding.service === "string" ? binding.service : null,
      source: typeof overrideRecord.source === "string" ? overrideRecord.source : "environment_default",
      fields: {
        delivery_tier: typeof overrideRecord.delivery_tier === "string" ? overrideRecord.delivery_tier : undefined,
        auth_mode: typeof overrideRecord.auth_mode === "string" ? overrideRecord.auth_mode : undefined,
        side_effects: typeof overrideRecord.side_effects === "string" ? overrideRecord.side_effects : undefined,
        provider_route: typeof overrideRecord.provider_route === "string" ? overrideRecord.provider_route : undefined,
      },
    });
  }
  return policies;
}

export function pendingDeploymentPolicyForNode(
  node: WorkflowNodeDraft,
  environment: string,
  deploymentDraft: DeploymentOverrideDraft,
  familyDrafts: Record<string, TargetedDeploymentOverrideDraft>,
  nodeDrafts: Record<string, TargetedDeploymentOverrideDraft>,
): PendingNodeDeploymentPolicy | null {
  if (node.kind !== "tool") return null;
  const family = workflowNodeIntegrationFamily(node) ?? "integration";
  const familyOverride = compactOverrideDraft(familyDrafts[family] ?? {});
  const nodeOverride = compactOverrideDraft(nodeDrafts[node.id] ?? {});
  const fields = mergeOverrideFields(
    mergeOverrideFields(deploymentDraft, familyOverride),
    nodeOverride,
  );
  const source =
    nodeOverride ? "deployment_node_override"
    : familyOverride ? "deployment_family_override"
    : "deployment_override";
  return { environment, family, source, fields };
}

// ---------------------------------------------------------------------------
// Deployment policy diff
// ---------------------------------------------------------------------------

export function deploymentPolicyDiff(
  previousDeployment: WorkflowDeployment | null,
  currentDeployment: WorkflowDeployment,
): DeploymentPolicyDiffEntry[] {
  const environment = currentDeployment.environment;
  const previousPolicies = deploymentNodePoliciesForEnvironment(previousDeployment, environment);
  const currentPolicies = deploymentNodePoliciesForEnvironment(currentDeployment, environment);
  const nodeIds = new Set<string>([...previousPolicies.keys(), ...currentPolicies.keys()]);
  const diffs: DeploymentPolicyDiffEntry[] = [];
  for (const nodeId of nodeIds) {
    const previous = previousPolicies.get(nodeId)?.fields ?? null;
    const current = currentPolicies.get(nodeId)?.fields ?? null;
    const changes = deploymentPolicyChanges(previous, current);
    if (changes.length > 0) diffs.push({ nodeId, previous, current, changes });
  }
  return diffs;
}

export function deploymentPolicyDiffEntryForNode(
  previousDeployment: WorkflowDeployment | null,
  currentDeployment: WorkflowDeployment | null,
  nodeId: string | null | undefined,
): DeploymentPolicyDiffEntry | null {
  if (!currentDeployment || !nodeId) return null;
  return (
    deploymentPolicyDiff(previousDeployment, currentDeployment).find((entry) => entry.nodeId === nodeId) ?? null
  );
}

export function deploymentPolicyVisual(source: string): {
  label: string;
  chipClass: string;
  panelClass: string;
} {
  switch (source) {
    case "deployment_node_override":
      return {
        label: "Node override",
        chipClass: "border-rose-200/70 bg-rose-50/85 text-rose-700",
        panelClass: "border-rose-200/70 bg-rose-50/75 text-rose-900",
      };
    case "deployment_family_override":
      return {
        label: "Family override",
        chipClass: "border-fuchsia-200/70 bg-fuchsia-50/85 text-fuchsia-700",
        panelClass: "border-fuchsia-200/70 bg-fuchsia-50/75 text-fuchsia-900",
      };
    case "deployment_override":
      return {
        label: "Deployment override",
        chipClass: "border-sky-200/70 bg-sky-50/85 text-sky-700",
        panelClass: "border-sky-200/70 bg-sky-50/75 text-sky-900",
      };
    default:
      return {
        label: "Inherited default",
        chipClass: "border-slate-200/70 bg-slate-50/85 text-slate-700",
        panelClass: "border-slate-200/70 bg-slate-50/75 text-slate-900",
      };
  }
}

// ---------------------------------------------------------------------------
// Policy drift across run timeline
// ---------------------------------------------------------------------------

export function runNodePolicyDeltaSummary(
  run: WorkflowRun | null | undefined,
  deploymentLookup: Map<string, WorkflowDeployment>,
  nodeId: string | null | undefined,
): { source: string; changes: NodeDeploymentPolicyChange[]; deploymentId: string | null } | null {
  if (!run || !nodeId || !Array.isArray(run.timeline)) return null;

  const matchingStep = [...run.timeline]
    .reverse()
    .find(
      (entry) =>
        isRecord(entry) && timelineStepNodeId(entry) === nodeId,
    );
  if (!isRecord(matchingStep)) return null;

  const action = timelineStepAction(matchingStep);
  if (!action) return null;

  const actionDeploymentId =
    typeof action.deployment_id === "string" ? action.deployment_id : null;
  const actionReplayEffectiveDeploymentId =
    typeof action.replay_effective_deployment_id === "string" ? action.replay_effective_deployment_id : null;
  const actionReplayComparedToDeploymentId =
    typeof action.replay_compared_to_deployment_id === "string" ? action.replay_compared_to_deployment_id : null;

  const actionDeployment = actionDeploymentId ? deploymentLookup.get(actionDeploymentId) ?? null : null;
  const actionReplayEffectiveDeployment =
    actionReplayEffectiveDeploymentId ? deploymentLookup.get(actionReplayEffectiveDeploymentId) ?? null : null;
  const actionReplayComparedDeployment =
    actionReplayComparedToDeploymentId ? deploymentLookup.get(actionReplayComparedToDeploymentId) ?? null : null;

  const replayPolicyDiffEntry = deploymentPolicyDiffEntryForNode(
    actionReplayComparedDeployment,
    actionReplayEffectiveDeployment,
    nodeId,
  );
  if (replayPolicyDiffEntry && replayPolicyDiffEntry.changes.length > 0) {
    return {
      source: "replay_policy_delta",
      changes: replayPolicyDiffEntry.changes,
      deploymentId: actionReplayEffectiveDeploymentId,
    };
  }

  const deploymentFieldChanges = deploymentChangeSummaryFieldChangesForNode(actionDeployment, nodeId);
  if (deploymentFieldChanges.length > 0) {
    return {
      source: "deployment_policy_delta",
      changes: deploymentFieldChanges,
      deploymentId: actionDeploymentId,
    };
  }

  return null;
}

export function runEdgePolicyDeltaSummary(
  graph: WorkflowGraphDraft | null,
  run: WorkflowRun | null | undefined,
  deploymentLookup: Map<string, WorkflowDeployment>,
  edgeId: string | null | undefined,
): {
  nodeId: string;
  relation: "from" | "to" | "related";
  source: string;
  changes: NodeDeploymentPolicyChange[];
  deploymentId: string | null;
} | null {
  if (!graph || !run || !edgeId) return null;

  const relatedSteps = runTimelineSliceForEdge(graph, run, edgeId);
  for (const related of relatedSteps) {
    const nodeId = timelineStepNodeId(related.step);
    const delta = runNodePolicyDeltaSummary(run, deploymentLookup, nodeId);
    if (delta) {
      return {
        nodeId: nodeId!,
        relation: related.relation,
        source: delta.source,
        changes: delta.changes,
        deploymentId: delta.deploymentId,
      };
    }
  }

  const edge = graph.edges.find((entry) => entry.id === edgeId);
  if (!edge) return null;
  for (const fallback of [
    { nodeId: edge.source, relation: "from" as const },
    { nodeId: edge.target, relation: "to" as const },
  ]) {
    const delta = runNodePolicyDeltaSummary(run, deploymentLookup, fallback.nodeId);
    if (delta) {
      return {
        nodeId: fallback.nodeId,
        relation: fallback.relation,
        source: delta.source,
        changes: delta.changes,
        deploymentId: delta.deploymentId,
      };
    }
  }
  return null;
}

export function runPolicyDriftSummary(
  graph: WorkflowGraphDraft | null,
  run: WorkflowRun | null | undefined,
  deploymentLookup: Map<string, WorkflowDeployment>,
): {
  nodeEntries: Array<{ nodeId: string; source: string; changes: NodeDeploymentPolicyChange[]; deploymentId: string | null }>;
  edgeEntries: Array<{ edgeId: string; nodeId: string; relation: "from" | "to" | "related"; source: string; changes: NodeDeploymentPolicyChange[]; deploymentId: string | null }>;
  deploymentNodeCount: number;
  replayNodeCount: number;
  deploymentEdgeCount: number;
  replayEdgeCount: number;
} {
  if (!graph || !run) {
    return { nodeEntries: [], edgeEntries: [], deploymentNodeCount: 0, replayNodeCount: 0, deploymentEdgeCount: 0, replayEdgeCount: 0 };
  }

  const nodeEntries = graph.nodes
    .map((node) => {
      const delta = runNodePolicyDeltaSummary(run, deploymentLookup, node.id);
      return delta ? { nodeId: node.id, ...delta } : null;
    })
    .filter(
      (entry): entry is { nodeId: string; source: string; changes: NodeDeploymentPolicyChange[]; deploymentId: string | null } =>
        Boolean(entry),
    );

  const edgeEntries = graph.edges
    .map((edge) => {
      const delta = runEdgePolicyDeltaSummary(graph, run, deploymentLookup, edge.id);
      return delta ? { edgeId: edge.id, ...delta } : null;
    })
    .filter(
      (entry): entry is { edgeId: string; nodeId: string; relation: "from" | "to" | "related"; source: string; changes: NodeDeploymentPolicyChange[]; deploymentId: string | null } =>
        Boolean(entry),
    );

  return {
    deploymentNodeCount: nodeEntries.filter((e) => e.source === "deployment_policy_delta").length,
    replayNodeCount: nodeEntries.filter((e) => e.source === "replay_policy_delta").length,
    deploymentEdgeCount: edgeEntries.filter((e) => e.source === "deployment_policy_delta").length,
    replayEdgeCount: edgeEntries.filter((e) => e.source === "replay_policy_delta").length,
    nodeEntries,
    edgeEntries,
  };
}

// ---------------------------------------------------------------------------
// AFP contract analysis
// ---------------------------------------------------------------------------

export function compiledManifestAfpContract(
  runtimeKind: string | null,
  capabilityId: string | null,
): {
  category: "capability_boundary" | "decision_boundary" | "summary_boundary" | "orchestration_scaffold";
  label: string;
  chipClass: string;
  primarySubtype: string;
  secondarySubtype: string | null;
} {
  if (runtimeKind === "executor" || runtimeKind === "capability_router") {
    return {
      category: "capability_boundary",
      label: capabilityId ? "AFP capability boundary" : "AFP node boundary",
      chipClass: "border-sky-200/70 bg-sky-50/85 text-sky-700",
      primarySubtype: "node_request",
      secondarySubtype: "node_result",
    };
  }
  if (
    runtimeKind === "approval_runtime"
    || runtimeKind === "ambiguity"
    || runtimeKind === "policy_runtime"
  ) {
    return {
      category: "decision_boundary",
      label: "AFP decision boundary",
      chipClass: "border-amber-200/70 bg-amber-50/85 text-amber-700",
      primarySubtype: "decision_request",
      secondarySubtype: runtimeKind === "policy_runtime" ? "policy_block" : "decision_result",
    };
  }
  if (runtimeKind === "termination_runtime") {
    return {
      category: "summary_boundary",
      label: "AFP summary boundary",
      chipClass: "border-emerald-200/70 bg-emerald-50/85 text-emerald-700",
      primarySubtype: "workflow_summary",
      secondarySubtype: null,
    };
  }
  return {
    category: "orchestration_scaffold",
    label: "Derived orchestration scaffold",
    chipClass: "border-slate-200/70 bg-slate-100/85 text-slate-700",
    primarySubtype: "workflow_manifest",
    secondarySubtype: runtimeKind === "reflection" ? "replan_request" : "node_progress",
  };
}

export function compiledManifestAfpGapKinds(
  runtimeKind: string | null,
  capabilityId: string | null,
  memoryScope: string | null,
  traceSource: string | null,
): CompiledAfpGapFilter[] {
  const contract = compiledManifestAfpContract(runtimeKind, capabilityId);
  const gaps: CompiledAfpGapFilter[] = [];
  if (contract.category === "capability_boundary" && !capabilityId) gaps.push("generic_boundary");
  if (!memoryScope) gaps.push("missing_memory_scope");
  if (!traceSource) gaps.push("missing_trace_source");
  if (contract.category === "orchestration_scaffold") gaps.push("orchestration_scaffold");
  return gaps;
}

export function compiledAfpGapLabel(gap: CompiledAfpGapFilter): string {
  switch (gap) {
    case "generic_boundary": return "generic AFP boundaries";
    case "missing_memory_scope": return "missing memory scope";
    case "missing_trace_source": return "missing trace source";
    case "orchestration_scaffold": return "orchestration scaffolds";
  }
}

export function compiledAfpGapDescription(gap: CompiledAfpGapFilter): string {
  switch (gap) {
    case "generic_boundary":
      return "These compiled manifests still behave like AFP node boundaries without a concrete capability binding.";
    case "missing_memory_scope":
      return "These compiled manifests still need an explicit memory scope before their runtime contract is fully bounded.";
    case "missing_trace_source":
      return "These compiled manifests still need a trace source so AFP review can tie runtime activity back to a concrete origin.";
    case "orchestration_scaffold":
      return "These compiled manifests still act as orchestration scaffolds instead of concrete AFP capability, decision, or summary boundaries.";
  }
}

export function compiledManifestOrchestrationRole(
  runtimeKind: string | null,
  capabilityId: string | null,
): {
  role: CompiledOrchestrationRole;
  label: string;
  chipClass: string;
  description: string;
} {
  if (runtimeKind === "executor" || runtimeKind === "capability_router") {
    return {
      role: "delegated_capability",
      label: capabilityId ? "delegated capability unit" : "delegated capability candidate",
      chipClass: "border-sky-200/70 bg-sky-50/85 text-sky-700",
      description: capabilityId
        ? "This compiled manifest looks like a delegated sub-agent capability unit that should execute bounded AFP capability work under the workflow supervisor."
        : "This compiled manifest looks close to a delegated sub-agent capability unit, but it still needs a concrete capability binding before the handoff is fully explicit.",
    };
  }
  if (
    runtimeKind === "approval_runtime"
    || runtimeKind === "ambiguity"
    || runtimeKind === "policy_runtime"
  ) {
    return {
      role: "delegated_decision",
      label: "delegated decision unit",
      chipClass: "border-amber-200/70 bg-amber-50/85 text-amber-700",
      description:
        "This compiled manifest looks like a delegated decision-handling unit where approval, clarification, or policy outcomes can be isolated from the workflow supervisor.",
    };
  }
  if (runtimeKind === "termination_runtime") {
    return {
      role: "workflow_summary",
      label: "workflow summary unit",
      chipClass: "border-emerald-200/70 bg-emerald-50/85 text-emerald-700",
      description:
        "This compiled manifest looks like a workflow-level summary or completion unit that packages outcomes back to the supervisor boundary.",
    };
  }
  return {
    role: "supervisor_orchestration",
    label: "supervisor orchestration unit",
    chipClass: "border-slate-200/70 bg-slate-100/85 text-slate-700",
    description:
      "This compiled manifest still looks like workflow-supervisor orchestration logic rather than a delegated bounded sub-agent unit.",
  };
}
