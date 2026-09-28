// @locs-version: 1.0
import type { AfpMessage, AfpReference, SendAfpMessageInput } from "@/lib/api";
import type {
  WeddingContractEntitlement,
  WeddingDisruptionLedgerObject,
  WeddingRealityChangeRecoveryState,
  WeddingRealityChangeSubtype,
  WeddingRecoveryPlanLedgerObject,
  WeddingRecoveryShortlistItem,
  WeddingRecoveryStep,
} from "@/lib/weddingRealityChangeRecoveryState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
} from "@/lib/weddingPlanningTemplateState";
import { weddingSemanticObjectFromRecoveryState } from "@/lib/weddingSemanticUiState";

export const WEDDING_RECOVERY_AFP_PROJECTIONS_KEY = "omnyid.wedding-recovery-afp-projections";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: readonly unknown[], limit = 90): string[] {
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

function subtypeFrom(value: unknown): WeddingRealityChangeSubtype {
  if (
    value === "vendor_cancelled"
    || value === "vendor_unavailable"
    || value === "weather_risk"
    || value === "guest_count_changed"
    || value === "unknown"
  ) return value;
  return "unknown";
}

function stepFrom(value: unknown): WeddingRecoveryStep | null {
  const item = record(value);
  const id = clean(item?.id);
  const label = clean(item?.label);
  const detail = clean(item?.detail);
  if (!id || !label || !detail) return null;
  const status = item?.status === "ready" || item?.status === "blocked" || item?.status === "needs_review"
    ? item.status
    : "needs_review";
  return { id, label, status, detail };
}

function shortlistItemFrom(value: unknown): WeddingRecoveryShortlistItem | null {
  const item = record(value);
  const id = clean(item?.id);
  const label = clean(item?.label);
  if (!id || !label) return null;
  const price = typeof item?.priceEstimate === "number" && Number.isFinite(item.priceEstimate)
    ? Math.round(item.priceEstimate)
    : null;
  return {
    id,
    label,
    sourceLabel: clean(item?.sourceLabel) || null,
    fitLabels: strings(item?.fitLabels),
    priceEstimate: price,
    budgetLabel: clean(item?.budgetLabel) || "Price needs confirmation",
    availableOnDate: item?.availableOnDate === true,
  };
}

function disruptionFrom(value: unknown): WeddingDisruptionLedgerObject | null {
  const item = record(value);
  const id = clean(item?.id);
  const title = clean(item?.title);
  if (!id || !title) return null;
  const severity = item?.severity === "urgent" || item?.severity === "warning" || item?.severity === "info"
    ? item.severity
    : "warning";
  return {
    id,
    kind: "wedding_disruption_event",
    subtype: subtypeFrom(item?.subtype),
    title,
    severity,
    status: "open",
    metadata: record(item?.metadata) ?? {},
    references: Array.isArray(item?.references) ? item.references as WeddingDisruptionLedgerObject["references"] : [],
    supertags: strings(item?.supertags),
  };
}

function recoveryPlanFrom(value: unknown): WeddingRecoveryPlanLedgerObject | null {
  const item = record(value);
  const id = clean(item?.id);
  const title = clean(item?.title);
  const disruptionId = clean(item?.disruptionId);
  const decisionNeededLabel = clean(item?.decisionNeededLabel);
  if (!id || !title || !disruptionId || !decisionNeededLabel) return null;
  return {
    id,
    kind: "wedding_recovery_plan",
    title,
    disruptionId,
    stepIds: strings(item?.stepIds),
    decisionNeededLabel,
    metadata: record(item?.metadata) ?? {},
    references: Array.isArray(item?.references) ? item.references as WeddingRecoveryPlanLedgerObject["references"] : [],
    supertags: strings(item?.supertags),
  };
}

function entitlementFrom(value: unknown): WeddingContractEntitlement {
  const item = record(value);
  const amount = typeof item?.depositAmount === "number" && Number.isFinite(item.depositAmount)
    ? Math.max(0, Math.round(item.depositAmount))
    : null;
  return {
    refundLabel: clean(item?.refundLabel) || null,
    depositAmount: amount,
    cancellationTermsLabel: clean(item?.cancellationTermsLabel) || null,
    actionLabel: clean(item?.actionLabel) || "Review contract before taking action.",
    evidenceLabels: strings(item?.evidenceLabels),
  };
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

function markdownFor(state: WeddingRealityChangeRecoveryState): string {
  return [
    "# Wedding recovery plan",
    "",
    state.summaryLabel,
    "",
    "## What changed",
    "",
    `- ${state.disruptionObject.title}`,
    `- Type: ${state.subtype.replace(/_/g, " ")}`,
    `- Severity: ${state.disruptionObject.severity}`,
    "",
    "## Contract and money check",
    "",
    state.contractEntitlement.refundLabel ? `- ${state.contractEntitlement.refundLabel}` : "- Upload or paste contract terms before making refund claims.",
    state.contractEntitlement.depositAmount !== null
      ? `- Deposit detected: $${state.contractEntitlement.depositAmount.toLocaleString()}`
      : "- Deposit amount not detected.",
    state.contractEntitlement.cancellationTermsLabel
      ? `- Terms clue: ${state.contractEntitlement.cancellationTermsLabel}`
      : "- Cancellation/refund clause not detected yet.",
    "",
    "## Recovery steps",
    "",
    ...state.recoverySteps.map((step) => `- ${step.label}: ${step.status} - ${step.detail}`),
    "",
    "## Replacement shortlist",
    "",
    ...(state.shortlist.length
      ? state.shortlist.map((item) => `- ${item.label}: ${item.budgetLabel}${item.fitLabels.length ? `; ${item.fitLabels.join(", ")}` : ""}`)
      : ["- No replacement shortlist yet. Search needs date, location, category, and fit requirements."]),
    "",
    "## One decision needed",
    "",
    state.decisionNeededLabel,
    "",
    "## Guardrail",
    "",
    state.approvalGateLabel,
  ].join("\n");
}

function referencesFor(state: WeddingRealityChangeRecoveryState): AfpReference[] {
  const metadata = normalizeWeddingPlanningMetadata(state.metadata);
  return [
    { type: "wedding_plan", target: metadata.weddingPlanId, label: "Wedding plan" },
    { type: "workspace", target: metadata.responseWorkspaceId, label: "Wedding workspace" },
    { type: "disruption_event", target: state.disruptionObject.id, label: state.disruptionObject.title },
    { type: "recovery_plan", target: state.recoveryPlanObject.id, label: state.recoveryPlanObject.title },
    ...state.shortlist.map((item) => ({
      type: "replacement_candidate",
      target: item.id,
      label: item.label,
    })),
  ];
}

export function weddingRealityChangeRecoveryToAfpMessage(
  state: WeddingRealityChangeRecoveryState,
  nowIso = new Date().toISOString(),
): AfpMessage {
  const metadata = normalizeWeddingPlanningMetadata(state.metadata);
  const markdown = markdownFor(state);
  const id = state.recoveryPlanObject.id;
  const vendorName = clean(state.recoveryPlanObject.metadata.vendor_name);
  const vendorCategory = clean(state.recoveryPlanObject.metadata.vendor_category);
  const semanticObject = weddingSemanticObjectFromRecoveryState(state);
  const searchableTerms = uniqueStrings([
    id,
    "wedding recovery plan",
    "vendor cancellation",
    "reality changed",
    state.subtype,
    state.summaryLabel,
    state.disruptionObject.title,
    vendorName,
    vendorCategory,
    state.contractEntitlement.refundLabel,
    state.contractEntitlement.cancellationTermsLabel,
    state.contractEntitlement.depositAmount !== null ? String(state.contractEntitlement.depositAmount) : null,
    ...state.recoverySteps.flatMap((step) => [step.label, step.status, step.detail]),
    ...state.shortlist.flatMap((item) => [item.label, item.budgetLabel, item.sourceLabel, ...item.fitLabels]),
    state.decisionNeededLabel,
    metadata.weddingPlanId,
    metadata.responseWorkspaceId,
  ]);

  return {
    id: `afp-${id}`,
    thread_id: `wedding_recovery:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    from: "system://wedding-planning",
    to: ["agent://wedding-planning", "agent://decision-queue", "agent://knowledge-graph", "agent://search"],
    timestamp: nowIso,
    type: "decision",
    kind: "ledger",
    subtype: "wedding_recovery_plan",
    supertags: uniqueStrings([
      ...metadata.supertags,
      "wedding",
      "wedding_recovery",
      "decisionos:wedding",
      "couple_approval_required",
      `disruption:${safeWeddingLabel(state.subtype)}`,
      vendorCategory ? `vendor_category:${safeWeddingLabel(vendorCategory)}` : null,
    ]),
    content: {
      kind: "wedding_recovery_plan",
      recovery_plan: state.recoveryPlanObject,
      disruption_event: state.disruptionObject,
      contract_entitlement: state.contractEntitlement,
      recovery_steps: state.recoverySteps,
      replacement_shortlist: state.shortlist,
      decision_needed_label: state.decisionNeededLabel,
      approval_gate_label: state.approvalGateLabel,
      semantic_object: semanticObject,
      markdown,
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      privacy_scope: metadata.privacyScope,
    },
    metadata: {
      origin: "wedding_planning",
      projection: "wedding_reality_change_recovery_to_afp",
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      subtype: state.subtype,
      vendor_name: vendorName,
      vendor_category: vendorCategory,
      shortlisted_count: state.shortlist.length,
      requires_user_approval: true,
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
        title: "Wedding recovery plan",
        markdown,
        semantic_object: semanticObject,
      },
    }],
    attachments: [],
    references: referencesFor(state),
  };
}

export function weddingRealityChangeRecoveryToAfpSendInput(
  state: WeddingRealityChangeRecoveryState,
  nowIso = new Date().toISOString(),
): SendAfpMessageInput {
  return messageToSendInput(weddingRealityChangeRecoveryToAfpMessage(state, nowIso));
}

export function loadWeddingRecoveryAfpProjectionIds(storage: Storage = localStorage): string[] {
  const raw = storage.getItem(WEDDING_RECOVERY_AFP_PROJECTIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
  } catch {
    storage.removeItem(WEDDING_RECOVERY_AFP_PROJECTIONS_KEY);
    return [];
  }
}

export function hasSentWeddingRecoveryAfpProjection(id: string, storage: Storage = localStorage): boolean {
  const cleanId = clean(id);
  return cleanId ? loadWeddingRecoveryAfpProjectionIds(storage).includes(cleanId) : false;
}

export function markWeddingRecoveryAfpProjectionSent(id: string, storage: Storage = localStorage): void {
  const cleanId = clean(id);
  if (!cleanId) return;
  const next = [...new Set([cleanId, ...loadWeddingRecoveryAfpProjectionIds(storage)])].slice(0, 300);
  storage.setItem(WEDDING_RECOVERY_AFP_PROJECTIONS_KEY, JSON.stringify(next));
}

export function weddingRealityChangeRecoveryFromAfpMessage(message: AfpMessage): WeddingRealityChangeRecoveryState | null {
  if (message.subtype !== "wedding_recovery_plan" || workspaceIdFrom(message) === null) return null;
  const content = record(message.content);
  if (!content) return null;
  const disruptionObject = disruptionFrom(content.disruption_event);
  const recoveryPlanObject = recoveryPlanFrom(content.recovery_plan);
  if (!disruptionObject || !recoveryPlanObject) return null;
  const metadata = normalizeWeddingPlanningMetadata({
    ...(message.metadata ?? {}),
    weddingPlanId: clean(content.wedding_plan_id) || message.metadata?.wedding_plan_id,
    responseWorkspaceId: clean(content.response_workspace_id) || message.metadata?.response_workspace_id,
    privacyScope: content.privacy_scope ?? message.metadata?.privacy_scope,
    supertags: message.supertags ?? [],
  });
  const recoverySteps = Array.isArray(content.recovery_steps)
    ? content.recovery_steps.flatMap((item) => {
      const step = stepFrom(item);
      return step ? [step] : [];
    })
    : [];
  const shortlist = Array.isArray(content.replacement_shortlist)
    ? content.replacement_shortlist.flatMap((item) => {
      const candidate = shortlistItemFrom(item);
      return candidate ? [candidate] : [];
    })
    : [];
  return {
    metadata,
    subtype: subtypeFrom(message.metadata?.subtype ?? disruptionObject.subtype),
    summaryLabel: clean(message.metadata?.searchable_summary) || clean(content.markdown)?.split(/\r?\n/).find(Boolean) || "Wedding recovery plan saved.",
    disruptionObject,
    recoveryPlanObject,
    contractEntitlement: entitlementFrom(content.contract_entitlement),
    recoverySteps,
    shortlist,
    decisionNeededLabel: clean(content.decision_needed_label) || recoveryPlanObject.decisionNeededLabel,
    approvalGateLabel: clean(content.approval_gate_label) || "User approval is required before external action.",
    a2ui: record(message.views?.find((view) => view.format === "a2ui")?.content) ?? {
      schema_version: "a2ui.v1",
      kind: "wedding_recovery_plan",
      title: recoveryPlanObject.title,
    },
  };
}
