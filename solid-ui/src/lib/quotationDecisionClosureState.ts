import type {
  DecisionCardModel,
  DecisionCardPattern,
} from "@/lib/decisionCardState";
import type { QuotationClosureStatus } from "@/lib/quotationClosureState";

export type QuotationSourceReference = {
  source_id: string;
  source_version_id: string;
  media_type: string;
  content_hash?: string | null;
};

export type QuotationMaterialChange = {
  kind: string;
  path: string;
  before?: unknown;
  after?: unknown;
};

export type QuotationSelectionReplay = {
  selection_id: string;
  comparison_id: string;
  comparison_revision: string;
  quotation_id: string;
  quotation_version_id: string;
  vendor_id: string;
  occurred_at: string;
};

export type QuotationClosureSnapshotReplay = {
  quotation_id: string;
  quotation_version_id: string;
  state: QuotationClosureStatus;
  last_event_id: string;
  updated_at: string;
  deadline_at?: string | null;
  evidence_sources: QuotationSourceReference[];
  deposit?: {
    amount: { amount_minor: number; currency: string };
    due_at?: string | null;
    paid_at?: string | null;
    refundable?: boolean | null;
    is_fee: boolean;
  } | null;
};

export type QuotationClosureTransitionReplay = {
  event_id: string;
  quotation_id: string;
  quotation_version_id: string;
  expected_state?: QuotationClosureStatus | null;
  target_state: QuotationClosureStatus;
  occurred_at: string;
  evidence_sources: QuotationSourceReference[];
  contract_changes: QuotationMaterialChange[];
  contract_changes_reviewed: boolean;
};

export type QuotationComparisonReplay = {
  comparison_id: string;
  candidates: Array<{
    quotation_id: string;
    version_id: string;
    vendor_id: string;
    disposition: "eligible" | "conditional" | "excluded";
  }>;
};

export type QuotationDecisionClosureReplay = {
  active_version_by_quotation: Record<string, string>;
  active_comparisons: Record<string, QuotationComparisonReplay>;
  comparison_message_ids: Record<string, string>;
  active_selections: Record<string, QuotationSelectionReplay>;
  active_closures: Record<string, QuotationClosureSnapshotReplay>;
  closure_transitions: Record<string, QuotationClosureTransitionReplay>;
};

export type VendorContextProjection = {
  projection_version: string;
  projection_fingerprint: string;
  grant_id: string;
  recipient_vendor_id: string;
  quotation_id: string;
  purpose: "resolve_quote_gaps" | "refine_vendor_package" | "confirm_booking_details";
  fields: Record<string, unknown>;
  fact_ids: string[];
  provenance_refs: string[];
};

export type VendorGrantPreview = {
  revision: string;
  expiresAt?: string | null;
  projection: VendorContextProjection;
};

export type ClosureStatusPresentation = {
  label: string;
  icon: "choice" | "document" | "review" | "calendar" | "receipt" | "booking" | "cancelled" | "refund" | "superseded";
  tone: "progress" | "success" | "warning" | "muted";
};

export const CLOSURE_STATUS_PRESENTATION: Record<QuotationClosureStatus, ClosureStatusPresentation> = {
  selected: { label: "Vendor selected", icon: "choice", tone: "progress" },
  contract_received: { label: "Contract received", icon: "document", tone: "progress" },
  contract_reviewed: { label: "Contract reviewed", icon: "review", tone: "progress" },
  deposit_requested: { label: "Deposit requested", icon: "calendar", tone: "progress" },
  deposit_recorded_paid: { label: "Deposit recorded as paid", icon: "receipt", tone: "progress" },
  booking_confirmed: { label: "Booking confirmed", icon: "booking", tone: "success" },
  cancelled: { label: "Booking cancelled", icon: "cancelled", tone: "warning" },
  refunded: { label: "Refund recorded", icon: "refund", tone: "muted" },
  superseded: { label: "Replaced by a newer quotation", icon: "superseded", tone: "muted" },
};

export type QuotationRevisionBinding = {
  decisionRevision: string;
  quotationId: string;
  quotationVersionId: string;
  comparisonId: string;
  comparisonRevision: string;
  closureRevision: string;
  grantRevision: string;
};

export type QuotationClosureAction = {
  id: string;
  label: string;
  effect: string;
  pattern: DecisionCardPattern;
  kind: "refresh" | "closure_transition";
  targetState?: QuotationClosureStatus;
  binding: QuotationRevisionBinding;
};

export type QuotationClosureTimelineItem = {
  id: string;
  status: QuotationClosureStatus;
  label: string;
  icon: ClosureStatusPresentation["icon"];
  tone: ClosureStatusPresentation["tone"];
  occurredAt: string;
  current: boolean;
  evidence: QuotationSourceReference[];
};

export type VendorGrantFieldPreview = {
  key: string;
  value: unknown;
  factId: string | null;
  provenanceRef: string | null;
};

export type QuotationDecisionClosureProjection = {
  stateId: string;
  stale: boolean;
  staleReason: string | null;
  status: ClosureStatusPresentation | null;
  timeline: QuotationClosureTimelineItem[];
  materialChanges: Array<QuotationMaterialChange & { evidence: QuotationSourceReference[] }>;
  vendorPreview: {
    grantId: string;
    grantRevision: string;
    recipientVendorId: string;
    purpose: VendorContextProjection["purpose"];
    expiresAt: string | null;
    fields: VendorGrantFieldPreview[];
    factIds: string[];
    provenanceRefs: string[];
    exactProjection: VendorContextProjection["fields"];
  } | null;
  action: QuotationClosureAction | null;
  decisionCard: DecisionCardModel;
  a2ui: Record<string, unknown>;
  paymentExecution: false;
};

type ProjectionInput = {
  threadId: string;
  comparisonId: string;
  decisionRevision: string;
  replay: QuotationDecisionClosureReplay;
  grant?: VendorGrantPreview | null;
};

const PROGRESS_ORDER: QuotationClosureStatus[] = [
  "selected",
  "contract_received",
  "contract_reviewed",
  "deposit_requested",
  "deposit_recorded_paid",
  "booking_confirmed",
];

function sourceKey(source: QuotationSourceReference): string {
  return `${source.source_id}:${source.source_version_id}`;
}

function sortedTransitions(
  replay: QuotationDecisionClosureReplay,
  quotationId: string,
): QuotationClosureTransitionReplay[] {
  return Object.values(replay.closure_transitions)
    .filter((transition) => transition.quotation_id === quotationId)
    .sort((left, right) => left.occurred_at.localeCompare(right.occurred_at) || left.event_id.localeCompare(right.event_id));
}

function timelineFromReplay(
  transitions: QuotationClosureTransitionReplay[],
  closure: QuotationClosureSnapshotReplay,
): QuotationClosureTimelineItem[] {
  const items = transitions.map((transition) => {
    const presentation = CLOSURE_STATUS_PRESENTATION[transition.target_state];
    return {
      id: transition.event_id,
      status: transition.target_state,
      label: presentation.label,
      icon: presentation.icon,
      tone: presentation.tone,
      occurredAt: transition.occurred_at,
      current: transition.event_id === closure.last_event_id,
      evidence: transition.evidence_sources,
    };
  });
  if (items.some((item) => item.current)) return items;
  const presentation = CLOSURE_STATUS_PRESENTATION[closure.state];
  return [...items, {
    id: closure.last_event_id,
    status: closure.state,
    label: presentation.label,
    icon: presentation.icon,
    tone: presentation.tone,
    occurredAt: closure.updated_at,
    current: true,
    evidence: closure.evidence_sources,
  }];
}

function nextTransition(status: QuotationClosureStatus): {
  target: QuotationClosureStatus;
  label: string;
  effect: string;
  pattern: "record" | "approve_act";
} | null {
  switch (status) {
    case "selected":
      return { target: "contract_received", label: "Record contract received", effect: "Records the supplied contract as evidence; it does not accept its terms.", pattern: "record" };
    case "contract_received":
      return { target: "contract_reviewed", label: "Review contract", effect: "Records your review of source-linked terms before any booking confirmation.", pattern: "record" };
    case "contract_reviewed":
      return { target: "deposit_requested", label: "Record deposit request", effect: "Records a deposit schedule only; OmnyID will not make a payment.", pattern: "record" };
    case "deposit_requested":
      return { target: "deposit_recorded_paid", label: "Record deposit paid", effect: "Records evidence of a payment made elsewhere; OmnyID will not make a payment.", pattern: "record" };
    case "deposit_recorded_paid":
      return { target: "booking_confirmed", label: "Confirm booking", effect: "Records evidence that the vendor confirmed the booking; it does not execute payment.", pattern: "approve_act" };
    case "cancelled":
      return { target: "refunded", label: "Record refund", effect: "Records refund evidence received elsewhere; OmnyID will not move money.", pattern: "record" };
    default:
      return null;
  }
}

function vendorPreview(grant: VendorGrantPreview | null | undefined) {
  if (!grant) return null;
  const entries = Object.entries(grant.projection.fields).sort(([left], [right]) => left.localeCompare(right));
  return {
    grantId: grant.projection.grant_id,
    grantRevision: grant.revision,
    recipientVendorId: grant.projection.recipient_vendor_id,
    purpose: grant.projection.purpose,
    expiresAt: grant.expiresAt ?? null,
    fields: entries.map(([key, value]) => ({
      key,
      value,
      factId: null,
      provenanceRef: null,
    })),
    factIds: [...grant.projection.fact_ids].sort(),
    provenanceRefs: [...grant.projection.provenance_refs].sort(),
    exactProjection: grant.projection.fields,
  };
}

function bindingFor(input: ProjectionInput, selection: QuotationSelectionReplay, closure: QuotationClosureSnapshotReplay): QuotationRevisionBinding {
  return {
    decisionRevision: input.decisionRevision,
    quotationId: selection.quotation_id,
    quotationVersionId: selection.quotation_version_id,
    comparisonId: selection.comparison_id,
    comparisonRevision: selection.comparison_revision,
    closureRevision: closure.last_event_id,
    grantRevision: input.grant?.revision ?? "none",
  };
}

function decisionCard(
  input: ProjectionInput,
  selection: QuotationSelectionReplay | null,
  closure: QuotationClosureSnapshotReplay | null,
  action: QuotationClosureAction | null,
  sources: QuotationSourceReference[],
  staleReason: string | null,
): DecisionCardModel {
  const pattern: DecisionCardPattern = action?.pattern ?? (selection ? "review" : "choose");
  const title = closure ? CLOSURE_STATUS_PRESENTATION[closure.state].label : selection ? "Selection recorded" : "Choose a quotation";
  const evidence = sources.slice(0, 4).map((source) => ({
    label: `${source.media_type} evidence`,
    ref: sourceKey(source),
    sourceKind: source.media_type,
    freshness: "current" as const,
  }));
  return {
    schema: "content.decision_card",
    pattern,
    patternVersion: "1.0",
    id: `quotation-closure:${input.comparisonId}:${input.decisionRevision}:${closure?.last_event_id ?? "unselected"}`,
    title,
    domain: "general",
    pressure: staleReason ? "medium" : "low",
    whyItMatters: staleReason ?? "Keep selection, contract, deposit, and booking confirmation as separate evidence-backed records.",
    recommendation: null,
    actions: action ? [{
      id: action.id,
      label: action.label,
      role: "primary",
      effect: action.effect,
      intent: action.kind === "refresh" ? "quotation.refresh" : "quotation.closure.transition",
    }] : [{
      id: `review:${input.decisionRevision}`,
      label: "Review record",
      role: "primary",
      effect: "Opens the current evidence-backed record without changing it.",
      intent: "quotation.review",
    }],
    evidence,
    confidence: evidence.length ? { label: "Source linked", reason: `${evidence.length} active evidence reference${evidence.length === 1 ? "" : "s"}.` } : null,
    timeSensitivity: closure?.deadline_at ? { label: "Recorded deadline", at: closure.deadline_at } : null,
    visual: { kind: "none" },
    unknowns: staleReason ? [staleReason] : [],
    patternSlots: { recordSummary: closure ? CLOSURE_STATUS_PRESENTATION[closure.state].label : null },
    verification: evidence.length
      ? { status: "partial", label: `${evidence.length} source reference${evidence.length === 1 ? "" : "s"}` }
      : { status: "unverified", label: "Evidence required for the next transition" },
  };
}

function a2uiProjection(
  stateId: string,
  closure: QuotationClosureSnapshotReplay | null,
  action: QuotationClosureAction | null,
  changes: Array<QuotationMaterialChange & { evidence: QuotationSourceReference[] }>,
  preview: ReturnType<typeof vendorPreview>,
): Record<string, unknown> {
  return {
    schema_version: "a2ui.v1",
    kind: "panel",
    title: "Booking progress",
    state_id: stateId,
    components: [
      {
        id: "closure-status",
        type: "stat_row",
        props: {
          label: "Status",
          value: closure ? CLOSURE_STATUS_PRESENTATION[closure.state].label : "No vendor selected",
          helper: closure?.deadline_at ?? "No deadline recorded",
        },
      },
      {
        id: "closure-constraints",
        type: "constraint_badges",
        props: { items: changes.map((change) => ({ label: change.path, status: "review_required" })) },
      },
      {
        id: "closure-insight",
        type: "insight_line",
        props: { text: "Selection, contract review, payment records, and booking confirmation remain separate facts.", evidence_required: true },
      },
      {
        id: "closure-payment-boundary",
        type: "callout",
        props: { tone: "info", title: "Records only", body: "OmnyID will not make a payment." },
      },
      ...(preview ? [{
        id: "vendor-context-preview",
        type: "comparison_table",
        props: {
          title: "What the vendor will see",
          columns: ["Field", "Value"],
          rows: preview.fields.map((field) => ({ label: field.key, values: [field.key, field.value] })),
        },
      }] : []),
      {
        id: "closure-actions",
        type: "action_chips",
        props: { actions: action ? { [action.id]: action } : {} },
      },
    ],
  };
}

export function projectQuotationDecisionClosure(input: ProjectionInput): QuotationDecisionClosureProjection {
  const comparison = input.replay.active_comparisons[input.comparisonId] ?? null;
  const comparisonRevision = input.replay.comparison_message_ids[input.comparisonId] ?? "";
  const selection = input.replay.active_selections[input.comparisonId] ?? null;
  const closure = selection ? input.replay.active_closures[selection.quotation_id] ?? null : null;
  let staleReason: string | null = null;
  if (!comparison || !comparisonRevision) staleReason = "This comparison has been replaced. Refresh to review the current quotation evidence.";
  else if (selection && selection.comparison_revision !== comparisonRevision) staleReason = "The selected comparison revision is stale. Refresh before continuing.";
  else if (selection && input.replay.active_version_by_quotation[selection.quotation_id] !== selection.quotation_version_id) staleReason = "A newer quotation version is available. Refresh and review its material changes.";
  else if (selection && (!closure || closure.quotation_version_id !== selection.quotation_version_id)) staleReason = "Booking progress changed. Refresh before continuing.";

  const transitions = selection ? sortedTransitions(input.replay, selection.quotation_id) : [];
  const timeline = closure ? timelineFromReplay(transitions, closure) : [];
  const latestChangeTransition = [...transitions].reverse().find((transition) => transition.contract_changes.length > 0);
  const materialChanges = (latestChangeTransition?.contract_changes ?? []).map((change) => ({
    ...change,
    evidence: latestChangeTransition?.evidence_sources ?? [],
  }));
  const preview = vendorPreview(input.grant);
  let action: QuotationClosureAction | null = null;
  if (selection && closure) {
    const binding = bindingFor(input, selection, closure);
    if (staleReason) {
      action = {
        id: `refresh:${input.comparisonId}:${input.decisionRevision}`,
        label: "Refresh quotation state",
        effect: "Reloads the current server replay; no external action is taken.",
        pattern: "review",
        kind: "refresh",
        binding,
      };
    } else {
      const next = nextTransition(closure.state);
      if (next) {
        action = {
          id: `closure:${closure.last_event_id}:${next.target}`,
          label: next.label,
          effect: next.effect,
          pattern: next.pattern,
          kind: "closure_transition",
          targetState: next.target,
          binding,
        };
      }
    }
  }
  const sources = closure?.evidence_sources ?? [];
  const stateId = `quotation-closure:${input.threadId}:${input.comparisonId}:${comparisonRevision || "missing"}:${closure?.last_event_id ?? "unselected"}:${input.grant?.revision ?? "no-grant"}`;
  return {
    stateId,
    stale: Boolean(staleReason),
    staleReason,
    status: closure ? CLOSURE_STATUS_PRESENTATION[closure.state] : null,
    timeline,
    materialChanges,
    vendorPreview: preview,
    action,
    decisionCard: decisionCard(input, selection, closure, action, sources, staleReason),
    a2ui: a2uiProjection(stateId, closure, action, materialChanges, preview),
    paymentExecution: false,
  };
}

export function closureProgressIndex(status: QuotationClosureStatus): number | null {
  const index = PROGRESS_ORDER.indexOf(status);
  return index >= 0 ? index : null;
}
