// Pure utility functions for deployment override drafts and policy field diffs.

import type {
  WorkflowConnectorOverrideFields,
  WorkflowConnectorOverrides,
} from "@/lib/api";
import type {
  DeploymentOverrideDraft,
  NodeDeploymentPolicyChange,
  TargetedDeploymentOverrideDraft,
} from "./workflowGraphTypes";
import { DEFAULT_DEPLOYMENT_OVERRIDE_DRAFT } from "./workflowGraphTypes";

// ---------------------------------------------------------------------------
// Deployment override drafts
// ---------------------------------------------------------------------------

export function deploymentOverrideDraftForEnvironment(environment: string): DeploymentOverrideDraft {
  if (environment === "prod") {
    return {
      delivery_tier: "production",
      auth_mode: "tenant_credentials",
      side_effects: "executed",
      provider_route: "primary",
    };
  }
  return { ...DEFAULT_DEPLOYMENT_OVERRIDE_DRAFT };
}

export function workflowDeploymentOverrideDraftAfterEnvironmentChange(
  current: DeploymentOverrideDraft,
  environment: string,
): DeploymentOverrideDraft {
  const currentMatchesProd =
    current.delivery_tier === "production"
    || current.auth_mode === "tenant_credentials"
    || current.side_effects === "executed"
    || current.provider_route === "primary";
  if ((environment === "prod" && currentMatchesProd) || (environment !== "prod" && !currentMatchesProd)) {
    return current;
  }
  return deploymentOverrideDraftForEnvironment(environment);
}

export function compactOverrideDraft(
  draft: TargetedDeploymentOverrideDraft,
): WorkflowConnectorOverrideFields | null {
  const next: WorkflowConnectorOverrideFields = {};
  if (draft.delivery_tier) next.delivery_tier = draft.delivery_tier;
  if (draft.auth_mode) next.auth_mode = draft.auth_mode;
  if (draft.side_effects) next.side_effects = draft.side_effects;
  if (draft.provider_route) next.provider_route = draft.provider_route;
  return Object.keys(next).length > 0 ? next : null;
}

export function deploymentOverridePayload(args: {
  draft: DeploymentOverrideDraft;
  familyOverrides: Record<string, TargetedDeploymentOverrideDraft>;
  nodeOverrides: Record<string, TargetedDeploymentOverrideDraft>;
}): WorkflowConnectorOverrides {
  const familyOverrides = Object.fromEntries(
    Object.entries(args.familyOverrides)
      .map(([key, value]) => [key, compactOverrideDraft(value)])
      .filter((entry): entry is [string, WorkflowConnectorOverrideFields] => Boolean(entry[1])),
  );
  const nodeOverrides = Object.fromEntries(
    Object.entries(args.nodeOverrides)
      .map(([key, value]) => [key, compactOverrideDraft(value)])
      .filter((entry): entry is [string, WorkflowConnectorOverrideFields] => Boolean(entry[1])),
  );
  return {
    ...args.draft,
    ...(Object.keys(familyOverrides).length > 0 ? { family_overrides: familyOverrides } : {}),
    ...(Object.keys(nodeOverrides).length > 0 ? { node_overrides: nodeOverrides } : {}),
  };
}

export function mergeOverrideFields(
  base: WorkflowConnectorOverrideFields,
  override: WorkflowConnectorOverrideFields | null | undefined,
): WorkflowConnectorOverrideFields {
  if (!override) return { ...base };
  return {
    delivery_tier: override.delivery_tier ?? base.delivery_tier,
    auth_mode: override.auth_mode ?? base.auth_mode,
    side_effects: override.side_effects ?? base.side_effects,
    provider_route: override.provider_route ?? base.provider_route,
  };
}

export function deploymentPolicyChanges(
  current: WorkflowConnectorOverrideFields | null | undefined,
  next: WorkflowConnectorOverrideFields | null | undefined,
): NodeDeploymentPolicyChange[] {
  const changes: NodeDeploymentPolicyChange[] = [];
  for (const field of ["delivery_tier", "auth_mode", "side_effects", "provider_route"] as const) {
    const currentValue = current?.[field] ?? null;
    const nextValue = next?.[field] ?? null;
    if (currentValue !== nextValue) {
      changes.push({ field, current: currentValue, next: nextValue });
    }
  }
  return changes;
}
