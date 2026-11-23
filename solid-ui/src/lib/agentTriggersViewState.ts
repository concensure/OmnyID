// @locs-version: 1.0
import { buildAgentTriggerConfig } from "./agentTriggerConfig";
import { inferAgentTriggerObjectiveSuggestion } from "./agentTriggerObjectiveInference";
import type { AgentTriggerKind } from "./agentTriggerKindPresentation";
import { agentTriggerIsEnabled } from "./agentTriggerResponseState";
import type { AgentTriggerRecord } from "./agentTriggerResponseState";
import type { AgentTriggerStarterTemplate } from "./agentTriggerTemplates";
import {
  buildAgentTriggersFailureReceipt,
  type AgentTriggersFailureReceipt,
} from "./agentTriggersFailureState";

export type AgentTriggerDraft = {
  kind: AgentTriggerKind;
  cron: string;
  intervalMinutes: string;
  webhookPath: string;
  objective: string;
};

export type AgentTriggersLoadResult = {
  triggers: AgentTriggerRecord[];
  error: AgentTriggersFailureReceipt | null;
};

export type AgentTriggersCreateResult = AgentTriggersLoadResult & {
  formError: string | null;
  nextDraft: AgentTriggerDraft;
  shouldCloseForm: boolean;
};

export const DEFAULT_AGENT_TRIGGER_DRAFT: AgentTriggerDraft = {
  kind: "scheduled",
  cron: "0 8 * * 1-5",
  intervalMinutes: "60",
  webhookPath: "",
  objective: "",
};

export function agentTriggerCreateValidationError(objective: string): string | null {
  return objective.trim() ? null : "Objective is required.";
}

export function cloneAgentTriggerDraft(
  draft: Partial<AgentTriggerDraft> = {},
): AgentTriggerDraft {
  return {
    kind: draft.kind ?? DEFAULT_AGENT_TRIGGER_DRAFT.kind,
    cron: draft.cron ?? DEFAULT_AGENT_TRIGGER_DRAFT.cron,
    intervalMinutes: draft.intervalMinutes ?? DEFAULT_AGENT_TRIGGER_DRAFT.intervalMinutes,
    webhookPath: draft.webhookPath ?? DEFAULT_AGENT_TRIGGER_DRAFT.webhookPath,
    objective: draft.objective ?? DEFAULT_AGENT_TRIGGER_DRAFT.objective,
  };
}

export function agentTriggerDraftWithObjectiveSuggestion(
  draft: AgentTriggerDraft,
  objective: string,
): AgentTriggerDraft {
  const suggestion = inferAgentTriggerObjectiveSuggestion(objective);
  return {
    ...draft,
    objective,
    cron: suggestion.cron ?? draft.cron,
    intervalMinutes: suggestion.intervalMinutes ?? draft.intervalMinutes,
    kind: suggestion.kind ?? draft.kind,
  };
}

export function agentTriggerDraftFromTemplate(
  template: AgentTriggerStarterTemplate,
  currentDraft: Partial<AgentTriggerDraft> = {},
): AgentTriggerDraft {
  const draft = cloneAgentTriggerDraft(currentDraft);
  return {
    ...draft,
    kind: template.kind,
    cron: template.cron ?? draft.cron,
    objective: template.objective,
  };
}

export function toggleExpandedAgentTriggerIds(
  currentIds: ReadonlySet<string>,
  triggerId: string,
): Set<string> {
  const next = new Set(currentIds);
  if (next.has(triggerId)) next.delete(triggerId);
  else next.add(triggerId);
  return next;
}

export async function loadAgentTriggersViewState(
  loadTriggers: () => Promise<AgentTriggerRecord[]>,
): Promise<AgentTriggersLoadResult> {
  try {
    return {
      triggers: await loadTriggers(),
      error: null,
    };
  } catch (error) {
    return {
      triggers: [],
      error: buildAgentTriggersFailureReceipt(
        "Trigger load",
        error instanceof Error ? error.message : "Failed to load triggers",
      ),
    };
  }
}

export async function createAgentTriggerAndReload(
  body: { trigger_type: string; config: Record<string, unknown> },
  deps: {
    createTrigger: (body: { trigger_type: string; config: Record<string, unknown> }) => Promise<unknown>;
    loadTriggers: () => Promise<AgentTriggerRecord[]>;
  },
): Promise<AgentTriggersLoadResult> {
  try {
    await deps.createTrigger(body);
    return {
      triggers: await deps.loadTriggers(),
      error: null,
    };
  } catch (error) {
    return {
      triggers: [],
      error: buildAgentTriggersFailureReceipt(
        "Trigger create",
        error instanceof Error ? error.message : "Failed to create trigger",
      ),
    };
  }
}

export async function createAgentTriggerViewState(
  draft: AgentTriggerDraft,
  deps: {
    createTrigger: (body: { trigger_type: string; config: Record<string, unknown> }) => Promise<unknown>;
    loadTriggers: () => Promise<AgentTriggerRecord[]>;
  },
): Promise<AgentTriggersCreateResult> {
  const objective = draft.objective.trim();
  const validationError = agentTriggerCreateValidationError(objective);
  if (validationError) {
    return {
      triggers: [],
      error: null,
      formError: validationError,
      nextDraft: {
        ...draft,
        objective,
      },
      shouldCloseForm: false,
    };
  }

  const result = await createAgentTriggerAndReload(
    {
      trigger_type: draft.kind,
      config: buildAgentTriggerConfig({
        kind: draft.kind,
        objective,
        cron: draft.cron,
        intervalMinutes: draft.intervalMinutes,
        webhookPath: draft.webhookPath,
      }),
    },
    deps,
  );

  return {
    ...result,
    formError: null,
    nextDraft: result.error ? { ...draft, objective } : cloneAgentTriggerDraft(),
    shouldCloseForm: !result.error,
  };
}

export async function deleteAgentTriggerAndReload(
  triggerId: string,
  deps: {
    deleteTrigger: (id: string) => Promise<unknown>;
    loadTriggers: () => Promise<AgentTriggerRecord[]>;
  },
): Promise<AgentTriggersLoadResult> {
  try {
    await deps.deleteTrigger(triggerId);
    return {
      triggers: await deps.loadTriggers(),
      error: null,
    };
  } catch (error) {
    return {
      triggers: [],
      error: buildAgentTriggersFailureReceipt(
        "Trigger delete",
        error instanceof Error ? error.message : "Failed to delete trigger",
      ),
    };
  }
}

export async function toggleAgentTriggerAndReload(
  trigger: AgentTriggerRecord,
  deps: {
    updateTrigger: (id: string, patch: { enabled?: boolean }) => Promise<unknown>;
    loadTriggers: () => Promise<AgentTriggerRecord[]>;
  },
): Promise<AgentTriggersLoadResult> {
  try {
    await deps.updateTrigger(trigger.id, { enabled: !agentTriggerIsEnabled(trigger) });
    return {
      triggers: await deps.loadTriggers(),
      error: null,
    };
  } catch (error) {
    return {
      triggers: [],
      error: buildAgentTriggersFailureReceipt(
        "Trigger update",
        error instanceof Error ? error.message : "Failed to update trigger",
      ),
    };
  }
}
