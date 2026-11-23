// @locs-version: 1.0
export type WeddingSemanticUiKind =
  | "wedding_decision"
  | "wedding_conflict"
  | "wedding_active_loop"
  | "wedding_comparison"
  | "wedding_approval_required"
  | "wedding_budget_impact"
  | "wedding_external_wait";

export type WeddingSemanticUiAction = {
  label: string;
  kind: string;
  enabled: boolean;
  targetMenu?: string | null;
};

export type WeddingSemanticUiComparison = {
  title: string;
  columns: Array<{
    label: string;
    kind: string;
  }>;
  rows: Array<{
    id: string;
    cells: string[];
  }>;
};

export type WeddingSemanticUiObject = {
  id: string;
  kind: WeddingSemanticUiKind;
  title: string;
  stateLabel: string;
  tone: "risk" | "options" | "action" | "status";
  summary: string;
  comparison?: WeddingSemanticUiComparison | null;
  actions: WeddingSemanticUiAction[];
  semanticTags: string[];
};

export type WeddingSemanticSurfacePrimitiveKind =
  | "decision_comparison"
  | "progress_loop"
  | "conflict_resolution"
  | "approval_surface"
  | "budget_delta"
  | "waiting_dependency";

export type WeddingSemanticSurfacePrimitive = {
  id: string;
  objectId: string;
  primitiveKind: WeddingSemanticSurfacePrimitiveKind;
  label: string;
  title: string;
  stateLabel: string;
  tone: WeddingSemanticUiObject["tone"];
  summary: string;
  comparison: WeddingSemanticUiComparison | null;
  primaryAction: WeddingSemanticUiAction | null;
  secondaryActions: WeddingSemanticUiAction[];
  requiresApproval: boolean;
  semanticKind: WeddingSemanticUiKind;
  semanticTags: string[];
};

export type WeddingSemanticSurfaceState = {
  primitives: WeddingSemanticSurfacePrimitive[];
  source: "semantic" | "fallback";
  ignoredRendererFormat: string | null;
  fallbackReason: string | null;
};

type ResilienceCardLike = {
  id: string;
  title: string;
  detailLabel: string;
  statusLabel: string;
  tone: "urgent" | "review" | "calm";
  comparisonPreview: {
    title: string;
    columns: Array<{ label: string; kind: string }>;
    rows: Array<{ id: string; cells: string[] }>;
  } | null;
  primaryAction: {
    label: string;
    kind: string;
    enabled: boolean;
    metadata?: Record<string, unknown> | null;
  };
  secondaryAction: {
    label: string;
    kind: string;
    enabled: boolean;
    metadata?: Record<string, unknown> | null;
  };
};

type PlanningThreadItemLike = {
  id: string;
  title: string;
  detail: string;
  menuId: string;
  actionLabel: string;
  stateLabel: string;
  stateTone: "risk" | "options" | "action" | "status";
};

type DecisionProjectionLike = {
  id: string;
  artifactTitle: string;
  selectedOption: {
    label: string;
    detail: string;
  };
  columnCells: Array<{
    label: string;
    kind: string;
    value: string;
  }>;
  reportScope?: {
    status?: string;
    nextActionLabels?: readonly string[];
  } | null;
  budgetDecision?: boolean;
};

type PreferenceConflictStateLike = {
  conflictObject: {
    id: string;
    title: string;
  } | null;
  decisionArea: string;
  summaryLabel: string;
  compromiseOptions: Array<{
    id: string;
    title: string;
    satisfiesValues: string[];
    tradeoffLabels: string[];
  }>;
  status: string;
};

type RecoveryStateLike = {
  recoveryPlanObject: {
    id: string;
    title: string;
  };
  disruptionObject: {
    title: string;
    severity: string;
  };
  decisionNeededLabel: string;
  shortlist: Array<{
    id: string;
    label: string;
    priceEstimate: number | null;
    fitLabels: string[];
    availableOnDate: boolean;
  }>;
};

type NeedToKnowContextLike = {
  id: string;
  readyForFirstRecommendations: boolean;
  answeredLabels: string[];
  nextQuestionLabel: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => clean(value)).filter(Boolean)));
}

export function isWeddingSemanticUiKind(value: unknown): value is WeddingSemanticUiKind {
  return value === "wedding_decision"
    || value === "wedding_conflict"
    || value === "wedding_active_loop"
    || value === "wedding_comparison"
    || value === "wedding_approval_required"
    || value === "wedding_budget_impact"
    || value === "wedding_external_wait";
}

function semanticComparisonFromUnknown(value: unknown): WeddingSemanticUiComparison | null {
  const source = record(value);
  const title = clean(source.title);
  const columns = Array.isArray(source.columns)
    ? source.columns.map((column) => {
      const item = record(column);
      return {
        label: clean(item.label),
        kind: clean(item.kind) || "text",
      };
    }).filter((column) => column.label)
    : [];
  const rows = Array.isArray(source.rows)
    ? source.rows.map((row, index) => {
      const item = record(row);
      return {
        id: clean(item.id) || `row:${index + 1}`,
        cells: Array.isArray(item.cells) ? item.cells.map((cell) => clean(cell)) : [],
      };
    }).filter((row) => row.cells.length > 0)
    : [];
  return title && columns.length > 0 && rows.length > 0
    ? { title, columns, rows }
    : null;
}

export function weddingSemanticUiObjectFromUnknown(value: unknown): WeddingSemanticUiObject | null {
  const candidate = record(value);
  if (!isWeddingSemanticUiKind(candidate.kind) || !clean(candidate.id) || !clean(candidate.title)) return null;
  return {
    id: clean(candidate.id),
    kind: candidate.kind,
    title: clean(candidate.title),
    stateLabel: clean(candidate.stateLabel) || clean(candidate.state_label) || "Needs review",
    tone: candidate.tone === "risk" || candidate.tone === "options" || candidate.tone === "action" || candidate.tone === "status"
      ? candidate.tone
      : "status",
    summary: clean(candidate.summary),
    comparison: semanticComparisonFromUnknown(candidate.comparison),
    actions: Array.isArray(candidate.actions)
      ? candidate.actions.map((action) => {
        const item = record(action);
        return {
          label: clean(item.label) || "Open",
          kind: clean(item.kind) || "open_wedding_item",
          enabled: item.enabled !== false,
          targetMenu: clean(item.targetMenu) || clean(item.target_menu) || null,
        };
      })
      : [],
    semanticTags: uniqueStrings([
      candidate.kind,
      ...stringArray(candidate.semanticTags),
      ...stringArray(candidate.semantic_tags),
    ]),
  };
}

export function weddingSemanticUiObjectsFromAfpLikeMessage(message: unknown): WeddingSemanticUiObject[] {
  const source = record(message);
  const content = record(source.content);
  const metadata = record(source.metadata);
  const views = Array.isArray(source.views) ? source.views : [];
  const objects = [
    weddingSemanticUiObjectFromUnknown(content.semantic_object),
    weddingSemanticUiObjectFromUnknown(metadata.semantic_object),
    ...views.flatMap((view) => {
      const viewContent = record(record(view).content);
      const direct = weddingSemanticUiObjectFromUnknown(viewContent.semantic_object);
      const many = Array.isArray(viewContent.semantic_objects)
        ? viewContent.semantic_objects.map(weddingSemanticUiObjectFromUnknown)
        : [];
      return [direct, ...many];
    }),
  ].filter((object): object is WeddingSemanticUiObject => object !== null);
  const seen = new Set<string>();
  return objects.filter((object) => {
    if (seen.has(object.id)) return false;
    seen.add(object.id);
    return true;
  });
}

function actionTargetMenu(action: { metadata?: Record<string, unknown> | null }): string | null {
  const menu = action.metadata?.wedding_workspace_menu;
  return clean(menu) || null;
}

function semanticAction(action: ResilienceCardLike["primaryAction"]): WeddingSemanticUiAction {
  return {
    label: action.label,
    kind: action.kind,
    enabled: action.enabled,
    targetMenu: actionTargetMenu(action),
  };
}

function resilienceKind(card: ResilienceCardLike): WeddingSemanticUiKind {
  if (/without averaging|different preferences|values/i.test(`${card.statusLabel} ${card.detailLabel}`)) {
    return "wedding_conflict";
  }
  if (card.comparisonPreview) return "wedding_active_loop";
  return card.tone === "urgent" ? "wedding_external_wait" : "wedding_active_loop";
}

function resilienceTone(card: ResilienceCardLike): WeddingSemanticUiObject["tone"] {
  if (card.tone === "urgent") return "risk";
  if (card.primaryAction.enabled) return "action";
  return "status";
}

export function weddingSemanticObjectFromResilienceCard(card: ResilienceCardLike): WeddingSemanticUiObject {
  const kind = resilienceKind(card);
  return {
    id: card.id,
    kind,
    title: card.title,
    stateLabel: card.statusLabel,
    tone: resilienceTone(card),
    summary: card.detailLabel,
    comparison: card.comparisonPreview
      ? {
        title: card.comparisonPreview.title,
        columns: card.comparisonPreview.columns.map((column) => ({
          label: column.label,
          kind: column.kind,
        })),
        rows: card.comparisonPreview.rows,
      }
      : null,
    actions: [semanticAction(card.primaryAction), semanticAction(card.secondaryAction)],
    semanticTags: [
      kind,
      card.comparisonPreview ? "wedding_comparison" : null,
      card.primaryAction.enabled ? "wedding_approval_required" : null,
    ].filter((tag): tag is string => Boolean(tag)),
  };
}

function threadKind(item: PlanningThreadItemLike): WeddingSemanticUiKind {
  if (item.id.includes("budget")) return "wedding_budget_impact";
  if (/\bdecision|choice|choose|yes\/no\b/i.test(`${item.title} ${item.detail} ${item.actionLabel}`)) {
    return "wedding_decision";
  }
  if (/\b(no response|waiting|reply|follow-up)\b/i.test(`${item.stateLabel} ${item.title} ${item.detail}`)) {
    return "wedding_external_wait";
  }
  return "wedding_active_loop";
}

export function weddingSemanticObjectFromPlanningThreadItem(
  item: PlanningThreadItemLike,
): WeddingSemanticUiObject {
  const kind = threadKind(item);
  return {
    id: item.id,
    kind,
    title: item.title,
    stateLabel: item.stateLabel,
    tone: item.stateTone,
    summary: item.detail,
    actions: [{
      label: item.actionLabel,
      kind: "open_wedding_menu",
      enabled: true,
      targetMenu: item.menuId,
    }],
    semanticTags: [kind],
  };
}

export function weddingSemanticObjectFromDecisionProjection(
  input: DecisionProjectionLike,
): WeddingSemanticUiObject {
  const comparison = input.columnCells.length > 0
    ? {
      title: "Selected option",
      columns: input.columnCells.map((cell) => ({
        label: cell.label,
        kind: cell.kind,
      })),
      rows: [{
        id: input.id,
        cells: input.columnCells.map((cell) => cell.value),
      }],
    }
    : null;
  const nextActions = input.reportScope?.nextActionLabels ?? [];
  return {
    id: input.id,
    kind: input.budgetDecision ? "wedding_budget_impact" : "wedding_decision",
    title: `Decision: ${input.selectedOption.label}`,
    stateLabel: input.reportScope?.status === "scoped_ready" ? "Ready for follow-up" : "Saved decision",
    tone: "action",
    summary: input.selectedOption.detail || `Selected from ${input.artifactTitle}.`,
    comparison,
    actions: [{
      label: nextActions[0] ?? "Use this decision",
      kind: "use_wedding_decision",
      enabled: true,
      targetMenu: "home",
    }],
    semanticTags: [
      input.budgetDecision ? "wedding_budget_impact" : "wedding_decision",
      comparison ? "wedding_comparison" : null,
      "wedding_approval_required",
    ].filter((tag): tag is string => Boolean(tag)),
  };
}

export function weddingSemanticObjectFromPreferenceConflictState(
  state: PreferenceConflictStateLike,
): WeddingSemanticUiObject {
  const comparison = state.compromiseOptions.length > 0
    ? {
      title: "Ways through",
      columns: [
        { label: "Option", kind: "option" },
        { label: "Protects", kind: "text" },
        { label: "Trade-off", kind: "text" },
        { label: "Next step", kind: "action" },
      ],
      rows: state.compromiseOptions.slice(0, 3).map((option) => ({
        id: option.id,
        cells: [
          option.title,
          option.satisfiesValues.join(", ") || "Both reasons",
          option.tradeoffLabels[0] ?? "Needs couple review",
          "Review together",
        ],
      })),
    }
    : null;
  return {
    id: state.conflictObject?.id ?? `wedding_conflict:${state.decisionArea}`,
    kind: "wedding_conflict",
    title: state.conflictObject?.title ?? `${state.decisionArea}: values to balance`,
    stateLabel: state.status === "conflict" ? "Needs both partners" : "Needs preference details",
    tone: state.status === "conflict" ? "action" : "status",
    summary: state.summaryLabel,
    comparison,
    actions: [{
      label: "Review values",
      kind: "review_wedding_conflict",
      enabled: state.status === "conflict",
      targetMenu: "home",
    }],
    semanticTags: [
      "wedding_conflict",
      comparison ? "wedding_comparison" : null,
      state.status === "conflict" ? "wedding_approval_required" : null,
    ].filter((tag): tag is string => Boolean(tag)),
  };
}

function semanticMoneyLabel(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Confirm";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function weddingSemanticObjectFromRecoveryState(
  state: RecoveryStateLike,
): WeddingSemanticUiObject {
  const comparison = state.shortlist.length > 0
    ? {
      title: "Replacement shortlist",
      columns: [
        { label: "Option", kind: "option" },
        { label: "Price", kind: "price" },
        { label: "Style match", kind: "style_match" },
        { label: "Availability", kind: "availability" },
        { label: "Next step", kind: "action" },
      ],
      rows: state.shortlist.slice(0, 3).map((item) => ({
        id: item.id,
        cells: [
          item.label,
          semanticMoneyLabel(item.priceEstimate),
          item.fitLabels.slice(0, 2).join(", ") || "Check style",
          item.availableOnDate ? "Available" : "Check",
          "Compare portfolio",
        ],
      })),
    }
    : null;
  return {
    id: state.recoveryPlanObject.id,
    kind: comparison ? "wedding_active_loop" : "wedding_external_wait",
    title: state.disruptionObject.title || state.recoveryPlanObject.title,
    stateLabel: state.disruptionObject.severity === "urgent" ? "Change to handle now" : "Plan changed",
    tone: state.disruptionObject.severity === "urgent" ? "risk" : "action",
    summary: state.decisionNeededLabel,
    comparison,
    actions: [{
      label: comparison ? "Compare replacements" : "Complete recovery details",
      kind: "review_wedding_recovery",
      enabled: true,
      targetMenu: "response_queue",
    }],
    semanticTags: [
      comparison ? "wedding_active_loop" : "wedding_external_wait",
      comparison ? "wedding_comparison" : null,
      "wedding_approval_required",
    ].filter((tag): tag is string => Boolean(tag)),
  };
}

export function weddingSemanticObjectFromNeedToKnowContext(
  context: NeedToKnowContextLike,
): WeddingSemanticUiObject {
  return {
    id: context.id,
    kind: "wedding_active_loop",
    title: "Wedding basics",
    stateLabel: context.readyForFirstRecommendations ? "Ready for first recommendations" : "Needs one answer",
    tone: context.readyForFirstRecommendations ? "options" : "action",
    summary: context.readyForFirstRecommendations
      ? "The core date, place, guest, budget, and priority details are ready enough for first recommendations."
      : context.nextQuestionLabel,
    actions: [{
      label: context.readyForFirstRecommendations ? "Generate first recommendations" : "Answer next question",
      kind: context.readyForFirstRecommendations ? "generate_wedding_recommendations" : "answer_wedding_context",
      enabled: true,
      targetMenu: "home",
    }],
    semanticTags: [
      "wedding_active_loop",
      "wedding_context",
      context.readyForFirstRecommendations ? "wedding_recommendations_ready" : "wedding_context_needed",
      `${context.answeredLabels.length}_answers_captured`,
    ],
  };
}

export function weddingSemanticSurfacePrimitiveKind(
  object: WeddingSemanticUiObject,
): WeddingSemanticSurfacePrimitiveKind {
  if (object.kind === "wedding_approval_required") return "approval_surface";
  if (object.kind === "wedding_conflict") return "conflict_resolution";
  if (object.kind === "wedding_budget_impact") return "budget_delta";
  if (object.kind === "wedding_external_wait") return "waiting_dependency";
  if (object.kind === "wedding_decision" || object.comparison) return "decision_comparison";
  return "progress_loop";
}

export function weddingSemanticSurfacePrimitiveLabel(
  kind: WeddingSemanticSurfacePrimitiveKind,
): string {
  if (kind === "decision_comparison") return "Decision to review";
  if (kind === "progress_loop") return "Planning step";
  if (kind === "conflict_resolution") return "Values to balance";
  if (kind === "approval_surface") return "Needs approval";
  if (kind === "budget_delta") return "Budget impact";
  return "Waiting on someone";
}

export function weddingSemanticSurfacePrimitiveFromObject(
  object: WeddingSemanticUiObject,
): WeddingSemanticSurfacePrimitive {
  const [primaryAction, ...secondaryActions] = object.actions;
  const semanticTags = uniqueStrings([object.kind, ...object.semanticTags]);
  const primitiveKind = weddingSemanticSurfacePrimitiveKind(object);
  return {
    id: `wedding_surface:${object.id}`,
    objectId: object.id,
    primitiveKind,
    label: weddingSemanticSurfacePrimitiveLabel(primitiveKind),
    title: object.title,
    stateLabel: object.stateLabel,
    tone: object.tone,
    summary: object.summary,
    comparison: object.comparison ?? null,
    primaryAction: primaryAction ?? null,
    secondaryActions,
    requiresApproval: semanticTags.includes("wedding_approval_required") || object.kind === "wedding_approval_required",
    semanticKind: object.kind,
    semanticTags,
  };
}

export function buildWeddingSemanticSurfaceState(input: {
  semanticObjects?: readonly WeddingSemanticUiObject[] | null;
  rendererFormatHint?: string | null;
}): WeddingSemanticSurfaceState {
  const primitives = (input.semanticObjects ?? []).map(weddingSemanticSurfacePrimitiveFromObject);
  if (primitives.length > 0) {
    return {
      primitives,
      source: "semantic",
      ignoredRendererFormat: clean(input.rendererFormatHint) || null,
      fallbackReason: null,
    };
  }
  return {
    primitives: [],
    source: "fallback",
    ignoredRendererFormat: null,
    fallbackReason: clean(input.rendererFormatHint)
      ? `No wedding semantic object was available; ${clean(input.rendererFormatHint)} may be used as a fallback.`
      : "No wedding semantic object was available.",
  };
}
