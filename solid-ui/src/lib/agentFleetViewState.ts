// @locs-version: 1.0
import type { AgentFleetResponse } from "./agentFleetResponseState";
import {
  buildAgentFleetFailureReceipt,
  buildAgentFleetRunFailureNotice,
  type AgentFleetFailureReceipt,
  type AgentFleetRunNotice,
} from "./agentFleetFailureState";

export type AgentFleetLoadResult = {
  data: AgentFleetResponse;
  error: AgentFleetFailureReceipt | null;
};

export type AgentFleetActionResult = AgentFleetLoadResult;

export type AgentFleetRunDelegationResult = AgentFleetLoadResult & {
  notice: AgentFleetRunNotice;
  openView: string | null;
};

export type AgentFleetDelegationDraft<Mask extends string = string> = {
  active: boolean;
  scope: string;
  mask: Mask;
  expiresAt: string;
  task: string;
};

export type AgentFleetRunDelegationViewResult = AgentFleetRunDelegationResult & {
  startNotice: AgentFleetRunNotice;
  clearNoticeAfterMs: number | null;
  navigateAfterMs: number | null;
};

export function createAgentFleetDelegationDraft<Mask extends string>(
  defaultMask: Mask,
): AgentFleetDelegationDraft<Mask> {
  return {
    active: false,
    scope: "",
    mask: defaultMask,
    expiresAt: "",
    task: "",
  };
}

export function agentFleetDelegationDraftCanRun(
  draft: Pick<AgentFleetDelegationDraft, "scope" | "expiresAt">,
): boolean {
  return draft.scope.trim() !== "" && draft.expiresAt.trim() !== "";
}

export function activateAgentFleetDelegationDraft<Mask extends string>(
  draft: AgentFleetDelegationDraft<Mask>,
): AgentFleetDelegationDraft<Mask> {
  return {
    ...draft,
    active: true,
  };
}

export function resetAgentFleetDelegationDraft<Mask extends string>(
  defaultMask: Mask,
): AgentFleetDelegationDraft<Mask> {
  return createAgentFleetDelegationDraft(defaultMask);
}

export function agentFleetDelegationExpiryIso(expiresAt: string): string | null {
  const value = expiresAt.trim();
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export async function loadAgentFleetViewState(
  loadFleet: () => Promise<AgentFleetResponse>,
): Promise<AgentFleetLoadResult> {
  try {
    return {
      data: await loadFleet(),
      error: null,
    };
  } catch (error) {
    return {
      data: {},
      error: buildAgentFleetFailureReceipt(
        "Fleet status",
        error instanceof Error ? error.message : "Failed to load fleet status.",
      ),
    };
  }
}

export async function revokeAgentFleetDelegationAndReload(
  delegationId: string,
  deps: {
    revokeDelegation: (id: string) => Promise<unknown>;
    loadFleet: () => Promise<AgentFleetResponse>;
  },
): Promise<AgentFleetActionResult> {
  try {
    await deps.revokeDelegation(delegationId);
    return {
      data: await deps.loadFleet(),
      error: null,
    };
  } catch (error) {
    return {
      data: {},
      error: buildAgentFleetFailureReceipt(
        "Delegation revoke",
        error instanceof Error ? error.message : "Failed to revoke delegation.",
      ),
    };
  }
}

export async function cancelAgentFleetTaskAndReload(
  taskId: string,
  deps: {
    cancelTask: (id: string) => Promise<unknown>;
    loadFleet: () => Promise<AgentFleetResponse>;
  },
): Promise<AgentFleetActionResult> {
  try {
    await deps.cancelTask(taskId);
    return {
      data: await deps.loadFleet(),
      error: null,
    };
  } catch (error) {
    return {
      data: {},
      error: buildAgentFleetFailureReceipt(
        "Task cancel",
        error instanceof Error ? error.message : "Failed to cancel task.",
      ),
    };
  }
}

export async function runAgentFleetDelegationAndReload(
  input: {
    scope: string;
    mask: string;
    expiresAt: string;
    task: string;
  },
  deps: {
    createDelegation: (payload: {
      scope: string;
      mask: string;
      expires_at: string;
      task?: string;
    }) => Promise<unknown>;
    loadFleet: () => Promise<AgentFleetResponse>;
  },
): Promise<AgentFleetRunDelegationResult> {
  const expiresIso = agentFleetDelegationExpiryIso(input.expiresAt);
  if (!expiresIso) {
    return {
      data: {},
      error: null,
      notice: buildAgentFleetRunFailureNotice("Invalid delegation expiry."),
      openView: null,
    };
  }

  try {
    await deps.createDelegation({
      scope: input.scope,
      mask: input.mask,
      expires_at: expiresIso,
      task: input.task.trim() ? input.task.trim() : undefined,
    });
    return {
      data: await deps.loadFleet(),
      error: null,
      notice: {
        message: "Delegation created. Opening Workflows...",
        tone: "success",
      },
      openView: "workflows",
    };
  } catch (error) {
    return {
      data: {},
      error: null,
      notice: buildAgentFleetRunFailureNotice(
        error instanceof Error ? error.message : "Failed to start delegation.",
      ),
      openView: null,
    };
  }
}

export async function runAgentFleetDelegationViewState(
  input: {
    scope: string;
    mask: string;
    expiresAt: string;
    task: string;
  },
  deps: {
    createDelegation: (payload: {
      scope: string;
      mask: string;
      expires_at: string;
      task?: string;
    }) => Promise<unknown>;
    loadFleet: () => Promise<AgentFleetResponse>;
  },
): Promise<AgentFleetRunDelegationViewResult> {
  const result = await runAgentFleetDelegationAndReload(input, deps);
  return {
    ...result,
    startNotice: {
      message: `Starting delegation: ${input.scope} / ${input.mask}...`,
      tone: "info",
    },
    clearNoticeAfterMs: result.openView ? null : 3000,
    navigateAfterMs: result.openView ? 1200 : null,
  };
}
