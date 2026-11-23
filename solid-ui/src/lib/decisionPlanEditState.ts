import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";

export type DecisionPlanScope = {
  kind: "personal" | "wedding";
  key: string;
  accountId?: string | null;
  weddingPlanId?: string | null;
  responseWorkspaceId?: string | null;
};

export type DecisionApplicability = {
  decisionId: string;
  title: string;
  state: "not_applicable" | "restored";
  affectedDecisionIds: string[];
  affectedDecisionTitles: string[];
  changedAt: string;
};

export type CustomPlanDecision = {
  id: string;
  title: string;
  choices: string[];
  dueAt: string | null;
  note: string | null;
  parentDecisionId: string | null;
  parentDecisionTitle: string | null;
  status: "open" | "completed";
  createdAt: string;
  changedAt: string;
};

export type DecisionPlanEditState = {
  applicability: DecisionApplicability[];
  customDecisions: CustomPlanDecision[];
};

type CausalItem = {
  id: string;
  title: string;
  parentDecisionId?: string | null;
  actionMetadata?: Record<string, unknown> | null;
};

const EMPTY_STATE: DecisionPlanEditState = { applicability: [], customDecisions: [] };

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function strings(value: unknown, limit = 40): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(clean).filter(Boolean))].slice(0, limit);
}

function safePart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "default";
}

function storageKey(scope: DecisionPlanScope): string {
  return `omnyid.decision-plan.v1.${safePart(scope.kind)}.${safePart(scope.key)}`;
}

function latest<T extends { changedAt: string }>(values: readonly T[], key: (value: T) => string): T[] {
  const map = new Map<string, T>();
  for (const value of values) {
    const existing = map.get(key(value));
    if (!existing || Date.parse(value.changedAt) >= Date.parse(existing.changedAt)) map.set(key(value), value);
  }
  return [...map.values()];
}

function applicabilityFrom(value: unknown): DecisionApplicability | null {
  const data = record(value);
  const decisionId = clean(data.decision_id ?? data.decisionId);
  const title = clean(data.title);
  const state = clean(data.requested_state ?? data.state);
  const changedAt = clean(data.changed_at ?? data.changedAt);
  if (!decisionId || !title || !changedAt || (state !== "not_applicable" && state !== "restored")) return null;
  return {
    decisionId,
    title,
    state,
    affectedDecisionIds: strings(data.affected_decision_ids ?? data.affectedDecisionIds),
    affectedDecisionTitles: strings(data.affected_decision_titles ?? data.affectedDecisionTitles),
    changedAt,
  };
}

function customFrom(value: unknown): CustomPlanDecision | null {
  const data = record(value);
  const id = clean(data.decision_id ?? data.id);
  const title = clean(data.title);
  const createdAt = clean(data.created_at ?? data.createdAt);
  const changedAt = clean(data.changed_at ?? data.changedAt);
  const status = clean(data.status);
  if (!id || !title || !createdAt || !changedAt || (status !== "open" && status !== "completed")) return null;
  return {
    id,
    title,
    choices: strings(data.choices, 8),
    dueAt: clean(data.due_at ?? data.dueAt) || null,
    note: clean(data.note) || null,
    parentDecisionId: clean(data.parent_decision_id ?? data.parentDecisionId) || null,
    parentDecisionTitle: clean(data.parent_decision_title ?? data.parentDecisionTitle) || null,
    status,
    createdAt,
    changedAt,
  };
}

export function decisionPlanEditStateFromMessages(
  messages: readonly Pick<AfpMessage, "kind" | "subtype" | "content">[],
  scope: DecisionPlanScope,
): DecisionPlanEditState {
  const applicability: DecisionApplicability[] = [];
  const customDecisions: CustomPlanDecision[] = [];
  for (const message of messages) {
    const content = record(message.content);
    if (clean(content.scope_kind) !== scope.kind || clean(content.scope_key) !== scope.key) continue;
    const kind = clean(message.kind) || clean(message.subtype) || clean(content.kind);
    if (kind === "decision_plan_applicability") {
      const parsed = applicabilityFrom(content);
      if (parsed) applicability.push(parsed);
    }
    if (kind === "decision_plan_custom_decision") {
      const parsed = customFrom(content);
      if (parsed) customDecisions.push(parsed);
    }
  }
  return {
    applicability: latest(applicability, (item) => item.decisionId),
    customDecisions: latest(customDecisions, (item) => item.id),
  };
}

export function loadDecisionPlanEditState(scope: DecisionPlanScope): DecisionPlanEditState {
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    const value = record(JSON.parse(window.localStorage.getItem(storageKey(scope)) ?? "null"));
    return {
      applicability: latest((Array.isArray(value.applicability) ? value.applicability : []).map(applicabilityFrom).filter((item): item is DecisionApplicability => Boolean(item)), (item) => item.decisionId),
      customDecisions: latest((Array.isArray(value.customDecisions) ? value.customDecisions : []).map(customFrom).filter((item): item is CustomPlanDecision => Boolean(item)), (item) => item.id),
    };
  } catch {
    return EMPTY_STATE;
  }
}

export function mergeDecisionPlanEditState(...states: readonly DecisionPlanEditState[]): DecisionPlanEditState {
  return {
    applicability: latest(states.flatMap((state) => state.applicability), (item) => item.decisionId),
    customDecisions: latest(states.flatMap((state) => state.customDecisions), (item) => item.id),
  };
}

export function saveDecisionPlanEditState(scope: DecisionPlanScope, state: DecisionPlanEditState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(scope), JSON.stringify(state));
  } catch { /* AFP remains the durable authority when local storage is unavailable. */ }
}

export function applyDecisionApplicability(
  state: DecisionPlanEditState,
  change: DecisionApplicability,
): DecisionPlanEditState {
  return { ...state, applicability: latest([...state.applicability, change], (item) => item.decisionId) };
}

export function applyCustomPlanDecision(
  state: DecisionPlanEditState,
  decision: CustomPlanDecision,
): DecisionPlanEditState {
  return { ...state, customDecisions: latest([...state.customDecisions, decision], (item) => item.id) };
}

export function notApplicableDecisionIds(state: DecisionPlanEditState, currentItems?: readonly CausalItem[]): Set<string> {
  const result = new Set<string>();
  for (const item of state.applicability) {
    if (item.state !== "not_applicable") continue;
    result.add(item.decisionId);
    const causalIds = currentItems
      ? directCausalDecisionFollowUps(currentItems, item.decisionId).map((candidate) => candidate.id)
      : item.affectedDecisionIds;
    causalIds.forEach((id) => result.add(id));
  }
  return result;
}

export function notApplicableDecisions(state: DecisionPlanEditState): DecisionApplicability[] {
  return state.applicability.filter((item) => item.state === "not_applicable");
}

export function directCausalDecisionFollowUps(items: readonly CausalItem[], sourceId: string): Array<{ id: string; title: string }> {
  const parentKeys = ["parent_decision_id", "causal_parent_id", "source_decision_id", "depends_on_decision_id"];
  return items.filter((item) => {
    if (clean(item.parentDecisionId) === sourceId) return true;
    const metadata = record(item.actionMetadata);
    return parentKeys.some((key) => clean(metadata[key]) === sourceId)
      || strings(metadata.depends_on_decision_ids).includes(sourceId);
  }).map((item) => ({ id: item.id, title: item.title }));
}

export function isOptionalServiceDecision(title: string): boolean {
  return /\b(hair(?:styling|dresser| stylist)?|make-?up|beauty service|photo booth|favou?rs?|wedding cake|first dance)\b/i.test(title);
}

export function newCustomPlanDecision(input: {
  title: string;
  choices?: readonly string[];
  dueAt?: string | null;
  note?: string | null;
  parentDecisionId?: string | null;
  parentDecisionTitle?: string | null;
  nowIso?: string;
}): CustomPlanDecision {
  const now = input.nowIso ?? new Date().toISOString();
  const title = input.title.trim();
  const suffix = `${Date.parse(now).toString(36)}-${safePart(title).slice(0, 32)}`;
  return {
    id: `custom-decision-${suffix}`,
    title,
    choices: [...new Set((input.choices ?? []).map((item) => item.trim()).filter(Boolean))].slice(0, 8),
    dueAt: clean(input.dueAt) || null,
    note: clean(input.note) || null,
    parentDecisionId: clean(input.parentDecisionId) || null,
    parentDecisionTitle: clean(input.parentDecisionTitle) || null,
    status: "open",
    createdAt: now,
    changedAt: now,
  };
}

function baseSendInput(scope: DecisionPlanScope, content: Record<string, unknown>, nowIso: string): SendAfpMessageInput {
  return {
    thread_id: scope.kind === "wedding" ? `wedding_decision:${scope.key}` : `decision_plan:${scope.key}`,
    from: scope.accountId ? `user://${safePart(scope.accountId)}` : "user://current",
    to: scope.kind === "wedding"
      ? ["agent://wedding-planning", "agent://decision-queue", "agent://topology"]
      : ["agent://personal", "agent://decision-queue", "agent://topology"],
    timestamp: nowIso,
    type: "ledger",
    kind: clean(content.kind),
    subtype: clean(content.kind),
    content,
    supertags: ["decisionos", "decision_plan", `scope:${scope.kind}`],
    metadata: {
      origin: "decision_plan_edit",
      scope_kind: scope.kind,
      scope_key: scope.key,
      wedding_plan_id: scope.weddingPlanId ?? null,
      response_workspace_id: scope.responseWorkspaceId ?? null,
    },
    store_in_relational: true,
  };
}

export function decisionApplicabilityToAfpSendInput(
  scope: DecisionPlanScope,
  change: DecisionApplicability,
): SendAfpMessageInput {
  return baseSendInput(scope, {
    kind: "decision_plan_applicability",
    scope_kind: scope.kind,
    scope_key: scope.key,
    decision_id: change.decisionId,
    title: change.title,
    requested_state: change.state,
    affected_decision_ids: change.affectedDecisionIds,
    affected_decision_titles: change.affectedDecisionTitles,
    changed_at: change.changedAt,
    preserves_existing_artifacts: true,
    resurface_policy: "restore_only",
    wedding_plan_id: scope.weddingPlanId ?? null,
    response_workspace_id: scope.responseWorkspaceId ?? null,
  }, change.changedAt);
}

export function customPlanDecisionToAfpSendInput(
  scope: DecisionPlanScope,
  decision: CustomPlanDecision,
): SendAfpMessageInput {
  return baseSendInput(scope, {
    kind: "decision_plan_custom_decision",
    scope_kind: scope.kind,
    scope_key: scope.key,
    decision_id: decision.id,
    title: decision.title,
    choices: decision.choices,
    due_at: decision.dueAt,
    note: decision.note,
    parent_decision_id: decision.parentDecisionId,
    parent_decision_title: decision.parentDecisionTitle,
    status: decision.status,
    created_at: decision.createdAt,
    changed_at: decision.changedAt,
    suggested_next_task_requires_approval: true,
    wedding_plan_id: scope.weddingPlanId ?? null,
    response_workspace_id: scope.responseWorkspaceId ?? null,
  }, decision.changedAt);
}
