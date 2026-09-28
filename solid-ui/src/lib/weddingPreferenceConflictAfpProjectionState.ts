// @locs-version: 1.0
import type { AfpMessage, AfpReference, SendAfpMessageInput } from "@/lib/api";
import {
  type WeddingPreferenceConflictLedgerObject,
  type WeddingPreferenceConflictState,
  type WeddingPreferenceCompromiseOption,
  type WeddingPreferenceLedgerObject,
} from "@/lib/weddingPreferenceConflictState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
} from "@/lib/weddingPlanningTemplateState";
import { weddingSemanticObjectFromPreferenceConflictState } from "@/lib/weddingSemanticUiState";

export const WEDDING_PREFERENCE_CONFLICT_AFP_PROJECTIONS_KEY =
  "omnyid.wedding-preference-conflict-afp-projections";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: readonly unknown[], limit = 80): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function messageToSendInput(message: AfpMessage): SendAfpMessageInput {
  return {
    thread_id: message.thread_id,
    from: message.from,
    to: message.to ?? [],
    timestamp: message.timestamp,
    type: message.type,
    kind: message.kind,
    subtype: message.subtype ?? undefined,
    content: message.content,
    views: message.views,
    attachments: message.attachments,
    references: message.references,
    supertags: message.supertags ?? [],
    metadata: message.metadata,
    store_in_relational: true,
  };
}

function projectionId(state: WeddingPreferenceConflictState): string {
  const metadata = normalizeWeddingPlanningMetadata(state.metadata);
  return state.conflictObject?.id
    ?? `wedding_preference_context:${safeWeddingLabel(metadata.responseWorkspaceId)}:${safeWeddingLabel(state.decisionArea)}`;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function contentValue(message: AfpMessage, key: string): unknown {
  return record(message.content)?.[key] ?? message.metadata?.[key];
}

function workspaceIdFrom(message: AfpMessage): string | null {
  return clean(contentValue(message, "response_workspace_id")) || clean(message.metadata?.response_workspace_id) || null;
}

function signalFrom(value: unknown): WeddingPreferenceLedgerObject | null {
  const item = record(value);
  if (!item || item.kind !== "wedding_preference_signal") return null;
  const id = clean(item.id);
  const personLabel = clean(item.personLabel);
  const preferenceLabel = clean(item.preferenceLabel);
  if (!id || !personLabel || !preferenceLabel) return null;
  return {
    id,
    kind: "wedding_preference_signal",
    title: clean(item.title) || `${personLabel}: ${preferenceLabel}`,
    personId: clean(item.personId) || `wedding_person:${safeWeddingLabel(personLabel)}`,
    personLabel,
    decisionArea: clean(item.decisionArea) || "wedding decision",
    preferenceLabel,
    preferenceDetail: clean(item.preferenceDetail) || null,
    strength: typeof item.strength === "number" && Number.isFinite(item.strength) ? item.strength : 0.6,
    underlyingValue: clean(item.underlyingValue) || null,
    visibility: "couple_only",
    privateRationaleCiphertext: clean(item.privateRationaleCiphertext) || null,
    metadata: record(item.metadata) ?? {},
    references: Array.isArray(item.references) ? item.references as WeddingPreferenceLedgerObject["references"] : [],
    supertags: strings(item.supertags),
  };
}

function conflictObjectFrom(value: unknown): WeddingPreferenceConflictLedgerObject | null {
  const item = record(value);
  if (!item || item.kind !== "wedding_preference_conflict") return null;
  const id = clean(item.id);
  const decisionArea = clean(item.decisionArea);
  const conflictAxis = clean(item.conflictAxis);
  if (!id || !decisionArea || !conflictAxis) return null;
  return {
    id,
    kind: "wedding_preference_conflict",
    title: clean(item.title) || `${decisionArea}: values to balance`,
    decisionArea,
    conflictAxis,
    status: item.status === "ready_for_review" ? "ready_for_review" : "open",
    surfaceTensionLabel: clean(item.surfaceTensionLabel) || "Preferences pull in different directions.",
    underlyingValueLabels: strings(item.underlyingValueLabels),
    preferenceIds: strings(item.preferenceIds),
    requiresCoupleApproval: true,
    metadata: record(item.metadata) ?? {},
    references: Array.isArray(item.references) ? item.references as WeddingPreferenceConflictLedgerObject["references"] : [],
    supertags: strings(item.supertags),
  };
}

function compromiseOptionFrom(value: unknown): WeddingPreferenceCompromiseOption | null {
  const item = record(value);
  const id = clean(item?.id);
  const title = clean(item?.title);
  const plainLanguage = clean(item?.plainLanguage);
  if (!id || !title || !plainLanguage) return null;
  return {
    id,
    title,
    plainLanguage,
    satisfiesValues: strings(item?.satisfiesValues),
    tradeoffLabels: strings(item?.tradeoffLabels),
    requiresCoupleApproval: true,
  };
}

function preferenceLine(signal: WeddingPreferenceLedgerObject): string {
  const strength = Math.round(signal.strength * 100);
  const reason = signal.underlyingValue ? ` Reason: ${signal.underlyingValue}.` : "";
  return `- ${signal.personLabel}: ${signal.preferenceLabel} (${strength}% strength).${reason}`;
}

function markdownFor(state: WeddingPreferenceConflictState): string {
  return [
    "# Wedding partner preference balance",
    "",
    state.summaryLabel,
    "",
    "## Decision area",
    "",
    `- ${state.decisionArea}`,
    state.conflictAxis ? `- Conflict axis: ${state.conflictAxis.replace(/_/g, " ")}` : "- Conflict axis: not established yet",
    "",
    "## Each person's preference",
    "",
    ...(state.preferenceSignals.length ? state.preferenceSignals.map(preferenceLine) : ["- Ask each partner what they want and why."]),
    "",
    "## Underlying values",
    "",
    ...(state.conflictObject?.underlyingValueLabels.length
      ? state.conflictObject.underlyingValueLabels.map((label) => `- ${label}`)
      : ["- Values not captured yet. Ask why each preference matters before proposing a solution."]),
    "",
    "## Possible way through",
    "",
    ...(state.compromiseOptions.length
      ? state.compromiseOptions.map((option) => `- ${option.title}: ${option.plainLanguage}`)
      : ["- No compromise option yet. Capture each partner's reason first."]),
    "",
    "## Guardrails",
    "",
    "- Do not average numeric preferences when the underlying values differ.",
    "- Keep private rationales couple-only unless the couple explicitly shares them.",
    "- Require both partners to approve a compromise before it becomes a planning rule.",
  ].join("\n");
}

function referencesFor(state: WeddingPreferenceConflictState): AfpReference[] {
  const metadata = normalizeWeddingPlanningMetadata(state.metadata);
  return [
    { type: "wedding_plan", target: metadata.weddingPlanId, label: "Wedding plan" },
    { type: "workspace", target: metadata.responseWorkspaceId, label: "Wedding workspace" },
    ...state.preferenceSignals.map((signal) => ({
      type: "preference_signal",
      target: signal.id,
      label: signal.title,
    })),
    ...(state.conflictObject ? [{
      type: "preference_conflict",
      target: state.conflictObject.id,
      label: state.conflictObject.title,
    }] : []),
  ];
}

export function weddingPreferenceConflictToAfpMessage(
  state: WeddingPreferenceConflictState,
  nowIso = new Date().toISOString(),
): AfpMessage {
  const metadata = normalizeWeddingPlanningMetadata(state.metadata);
  const id = projectionId(state);
  const markdown = markdownFor(state);
  const semanticObject = weddingSemanticObjectFromPreferenceConflictState(state);
  const searchableTerms = uniqueStrings([
    id,
    "wedding preference conflict",
    "partner disagreement",
    "couple mediation",
    state.decisionArea,
    state.conflictAxis,
    state.summaryLabel,
    ...state.preferenceSignals.flatMap((signal) => [
      signal.personLabel,
      signal.preferenceLabel,
      signal.preferenceDetail,
      signal.underlyingValue,
    ]),
    ...(state.conflictObject?.underlyingValueLabels ?? []),
    ...state.compromiseOptions.flatMap((option) => [option.title, option.plainLanguage, ...option.satisfiesValues]),
    metadata.weddingPlanId,
    metadata.responseWorkspaceId,
  ]);

  return {
    id: `afp-${id}`,
    thread_id: `wedding_preference:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    from: "system://wedding-planning",
    to: ["agent://wedding-planning", "agent://decision-queue", "agent://knowledge-graph", "agent://search"],
    timestamp: nowIso,
    type: "decision",
    kind: "ledger",
    subtype: "wedding_preference_conflict",
    supertags: uniqueStrings([
      ...metadata.supertags,
      "wedding",
      "wedding_preference",
      "wedding_conflict",
      "decisionos:wedding",
      state.status === "conflict" ? "couple_approval_required" : null,
      state.conflictAxis ? `conflict_axis:${safeWeddingLabel(state.conflictAxis)}` : null,
      `decision_area:${safeWeddingLabel(state.decisionArea)}`,
    ]),
    content: {
      kind: "wedding_preference_conflict",
      projection_id: id,
      status: state.status,
      decision_area: state.decisionArea,
      conflict_axis: state.conflictAxis,
      markdown,
      preference_signals: state.preferenceSignals,
      conflict_object: state.conflictObject,
      compromise_options: state.compromiseOptions,
      next_question_label: state.nextQuestionLabel,
      approval_gate_label: state.approvalGateLabel,
      semantic_object: semanticObject,
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      privacy_scope: "couple_only",
    },
    metadata: {
      origin: "wedding_planning",
      projection: "wedding_preference_conflict_to_afp",
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      decision_area: state.decisionArea,
      conflict_axis: state.conflictAxis,
      status: state.status,
      requires_couple_approval: state.status === "conflict",
      semantic_kind: semanticObject.kind,
      semantic_tags: semanticObject.semanticTags,
      semantic_object: semanticObject,
      searchable_terms: searchableTerms,
    },
    views: [{
      format: "a2ui",
      priority: 1,
      content: {
        ...state.a2ui,
        semantic_object: semanticObject,
      },
    }, {
      format: "document",
      priority: 2,
      content: {
        title: "Wedding partner preference balance",
        markdown,
        semantic_object: semanticObject,
      },
    }],
    attachments: [],
    references: referencesFor(state),
  };
}

export function weddingPreferenceConflictToAfpSendInput(
  state: WeddingPreferenceConflictState,
  nowIso = new Date().toISOString(),
): SendAfpMessageInput {
  return messageToSendInput(weddingPreferenceConflictToAfpMessage(state, nowIso));
}

export function loadWeddingPreferenceConflictAfpProjectionIds(storage: Storage = localStorage): string[] {
  const raw = storage.getItem(WEDDING_PREFERENCE_CONFLICT_AFP_PROJECTIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
  } catch {
    storage.removeItem(WEDDING_PREFERENCE_CONFLICT_AFP_PROJECTIONS_KEY);
    return [];
  }
}

export function hasSentWeddingPreferenceConflictAfpProjection(id: string, storage: Storage = localStorage): boolean {
  const cleanId = clean(id);
  return cleanId ? loadWeddingPreferenceConflictAfpProjectionIds(storage).includes(cleanId) : false;
}

export function markWeddingPreferenceConflictAfpProjectionSent(id: string, storage: Storage = localStorage): void {
  const cleanId = clean(id);
  if (!cleanId) return;
  const next = [...new Set([cleanId, ...loadWeddingPreferenceConflictAfpProjectionIds(storage)])].slice(0, 300);
  storage.setItem(WEDDING_PREFERENCE_CONFLICT_AFP_PROJECTIONS_KEY, JSON.stringify(next));
}

export function weddingPreferenceConflictFromAfpMessage(message: AfpMessage): WeddingPreferenceConflictState | null {
  if (message.subtype !== "wedding_preference_conflict" || workspaceIdFrom(message) === null) return null;
  const content = record(message.content);
  if (!content) return null;
  const metadata = normalizeWeddingPlanningMetadata({
    ...(message.metadata ?? {}),
    weddingPlanId: clean(content.wedding_plan_id) || message.metadata?.wedding_plan_id,
    responseWorkspaceId: clean(content.response_workspace_id) || message.metadata?.response_workspace_id,
    privacyScope: "private",
    supertags: message.supertags ?? [],
  });
  const status = content.status === "conflict" || content.status === "aligned" || content.status === "insufficient"
    ? content.status
    : "insufficient";
  const preferenceSignals = Array.isArray(content.preference_signals)
    ? content.preference_signals.flatMap((item) => {
      const signal = signalFrom(item);
      return signal ? [signal] : [];
    })
    : [];
  const conflictObject = conflictObjectFrom(content.conflict_object);
  const compromiseOptions = Array.isArray(content.compromise_options)
    ? content.compromise_options.flatMap((item) => {
      const option = compromiseOptionFrom(item);
      return option ? [option] : [];
    })
    : [];
  return {
    metadata,
    status,
    decisionArea: clean(content.decision_area) || conflictObject?.decisionArea || "wedding decision",
    conflictAxis: clean(content.conflict_axis) || conflictObject?.conflictAxis || null,
    summaryLabel: clean(message.metadata?.searchable_summary) || clean(content.markdown)?.split(/\r?\n/).find(Boolean) || "Partner preference balance saved.",
    preferenceSignals,
    conflictObject,
    compromiseOptions,
    nextQuestionLabel: clean(content.next_question_label) || null,
    approvalGateLabel: clean(content.approval_gate_label) || null,
    a2ui: record(message.views?.find((view) => view.format === "a2ui")?.content) ?? {
      schema_version: "a2ui.v1",
      kind: "wedding_preference_conflict",
      title: conflictObject?.title ?? "Partner preferences",
      status,
    },
  };
}
