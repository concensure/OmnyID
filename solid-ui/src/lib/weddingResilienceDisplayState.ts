// @locs-version: 1.0
import {
  buildWeddingResilienceReviewAllAction,
  buildWeddingResilienceSidebarAction,
} from "@/lib/weddingResilienceActionState";
import type {
  WeddingResilienceAttentionItem,
  WeddingResilienceComparisonPreview,
  WeddingResilienceLedgerState,
} from "@/lib/weddingResilienceLedgerState";
import {
  buildWeddingSemanticSurfaceState,
  weddingSemanticObjectFromResilienceCard,
  type WeddingSemanticSurfaceState,
} from "@/lib/weddingSemanticUiState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";

export type WeddingResilienceDisplayTone = "urgent" | "review" | "calm";
export type WeddingResilienceFlowStepTone = "risk" | "options" | "action" | "status";

export type WeddingResilienceFlowStep = {
  label: string;
  tone: WeddingResilienceFlowStepTone;
};

export type WeddingResilienceChainPanelTone = "options" | "action" | "approval";

export type WeddingResilienceChainPanel = {
  label: string;
  title: string;
  detail: string;
  tone: WeddingResilienceChainPanelTone;
};

export type WeddingResilienceCard = {
  id: string;
  title: string;
  eyebrowLabel: string;
  detailLabel: string;
  statusLabel: string;
  evidenceLabel: string;
  tone: WeddingResilienceDisplayTone;
  flowSteps: WeddingResilienceFlowStep[];
  chainPanels: WeddingResilienceChainPanel[];
  comparisonPreview: WeddingResilienceComparisonPreview | null;
  hasInlineAction: boolean;
  primaryAction: WeddingWorkspaceSidebarAction;
  secondaryAction: WeddingWorkspaceSidebarAction;
  lifecycleActions: WeddingWorkspaceSidebarAction[];
};

export type WeddingResilienceDisplayState = {
  title: string;
  summaryLabel: string;
  emptyLabel: string | null;
  cards: WeddingResilienceCard[];
  reviewAllAction: WeddingWorkspaceSidebarAction;
  hasUrgentItem: boolean;
  shouldShow: boolean;
  semanticSurface: WeddingSemanticSurfaceState;
  a2ui: Record<string, unknown>;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function compactSentence(value: unknown, fallback: string, limit = 180): string {
  const text = clean(value).replace(/\s+/g, " ");
  if (!text) return fallback;
  return text.length > limit ? `${text.slice(0, limit - 3).trim()}...` : text;
}

function toneFor(item: WeddingResilienceAttentionItem): WeddingResilienceDisplayTone {
  if (item.priority === "urgent") return "urgent";
  if (item.priority === "high") return "review";
  return "calm";
}

function eyebrowFor(item: WeddingResilienceAttentionItem): string {
  if (item.kind === "recovery_plan") return item.priority === "urgent" ? "Change to handle now" : "Plan changed";
  return "Preference to align";
}

function statusFor(item: WeddingResilienceAttentionItem): string {
  if (item.kind === "recovery_plan") {
    return item.priority === "urgent"
      ? "OmnyID found a disruption and prepared next steps."
      : "OmnyID found a planning change worth reviewing.";
  }
  return "OmnyID found different preferences without averaging them.";
}

function evidenceFor(item: WeddingResilienceAttentionItem): string {
  const labels = item.metadataLabels.map(clean).filter(Boolean).slice(0, 4);
  if (labels.length === 0) return "Evidence will appear here once more details are saved.";
  return `Based on ${labels.join(", ")}.`;
}

function flowStepsFor(item: WeddingResilienceAttentionItem): WeddingResilienceFlowStep[] {
  if (item.kind === "recovery_plan") {
    return [
      { label: "Change found", tone: item.priority === "urgent" ? "risk" : "status" },
      { label: "Compare options", tone: "options" },
      { label: item.actionLabel || "Choose next step", tone: "action" },
      { label: "Approve before sending", tone: "action" },
    ];
  }
  return [
    { label: "Values differ", tone: "risk" },
    { label: "Compare compromises", tone: "options" },
    { label: item.actionLabel || "Choose together", tone: "action" },
    { label: "Save decision", tone: "status" },
  ];
}

function a2uiSectionItems(item: WeddingResilienceAttentionItem, titlePattern: RegExp): string[] {
  const sections = Array.isArray(item.a2ui.sections) ? item.a2ui.sections : [];
  for (const section of sections) {
    if (!section || typeof section !== "object") continue;
    const title = clean((section as { title?: unknown }).title);
    if (!titlePattern.test(title)) continue;
    const items = (section as { items?: unknown }).items;
    return Array.isArray(items) ? items.map(clean).filter(Boolean) : [];
  }
  return [];
}

function chainPanelsFor(item: WeddingResilienceAttentionItem): WeddingResilienceChainPanel[] {
  if (item.kind === "recovery_plan") {
    const replacementOptions = a2uiSectionItems(item, /replacement|option/i);
    const checkedItems = a2uiSectionItems(item, /checked/i);
    const decisionItems = a2uiSectionItems(item, /decision/i);
    return [
      {
        label: "Compare",
        title: replacementOptions.length ? "Replacement options ready" : "Comparison needs more details",
        detail: replacementOptions.slice(0, 2).join(" | ") || checkedItems.slice(-1)[0] || "Add date, location, category, and fit notes to compare realistic options.",
        tone: "options",
      },
      {
        label: "Decide",
        title: item.actionLabel || "Choose next step",
        detail: decisionItems[0] || item.detail,
        tone: "action",
      },
      {
        label: "Approve",
        title: "Nothing goes out without approval",
        detail: "Review the message, hold, or refund request before OmnyID sends it.",
        tone: "approval",
      },
    ];
  }
  const wants = a2uiSectionItems(item, /wants/i);
  const reasons = a2uiSectionItems(item, /why/i);
  const options = a2uiSectionItems(item, /possible|way/i);
  return [
    {
      label: "Compare",
      title: "Compare the reasons",
      detail: reasons.slice(0, 2).join(" | ") || wants.slice(0, 2).join(" | ") || "Keep each person's reason visible before choosing.",
      tone: "options",
    },
    {
      label: "Decide",
      title: item.actionLabel || "Choose together",
      detail: options[0] || item.detail,
      tone: "action",
    },
    {
      label: "Approve",
      title: "Save only when both are comfortable",
      detail: "Once approved, this becomes the planning rule for future suggestions.",
      tone: "approval",
    },
  ];
}

export function buildWeddingResilienceCard(item: WeddingResilienceAttentionItem): WeddingResilienceCard {
  return {
    id: item.id,
    title: item.title,
    eyebrowLabel: eyebrowFor(item),
    detailLabel: compactSentence(item.detail, "Review this before the plan narrows the next step."),
    statusLabel: statusFor(item),
    evidenceLabel: evidenceFor(item),
    tone: toneFor(item),
    flowSteps: flowStepsFor(item),
    chainPanels: chainPanelsFor(item),
    comparisonPreview: item.comparisonPreview,
    hasInlineAction: item.comparisonPreview?.columns.some((column) => column.kind === "action") ?? false,
    primaryAction: buildWeddingResilienceSidebarAction(item),
    secondaryAction: buildWeddingResilienceSidebarAction(item, "defer_item"),
    lifecycleActions: item.preferenceConflictLifecycle ? [
      buildWeddingResilienceSidebarAction(item, "resolve_item"),
      buildWeddingResilienceSidebarAction(item, "dismiss_item"),
    ] : [],
  };
}

function cardA2ui(card: WeddingResilienceCard): Record<string, unknown> {
  return {
    id: card.id,
    title: card.title,
    status: card.statusLabel,
    tone: card.tone,
    flow_steps: card.flowSteps,
    comparison_preview: card.comparisonPreview,
    has_inline_action: card.hasInlineAction,
    semantic_object: weddingSemanticObjectFromResilienceCard(card),
    next_steps: card.chainPanels,
    actions: [
      {
        label: card.primaryAction.label,
        enabled: card.primaryAction.enabled,
        kind: card.primaryAction.kind,
      },
      {
        label: card.secondaryAction.label,
        enabled: card.secondaryAction.enabled,
        kind: card.secondaryAction.kind,
      },
      ...card.lifecycleActions.map((action) => ({
        label: action.label,
        enabled: action.enabled,
        kind: action.kind,
      })),
    ],
  };
}

export function buildWeddingResilienceDisplayState(
  state: Pick<WeddingResilienceLedgerState, "summaryLabel" | "attentionItems" | "unresolvedCount" | "urgentCount">,
): WeddingResilienceDisplayState {
  const cards = state.attentionItems.map(buildWeddingResilienceCard);
  const hasItems = cards.length > 0;
  const semanticObjects = cards.map(weddingSemanticObjectFromResilienceCard);
  return {
    title: "Changes and disagreements",
    summaryLabel: hasItems
      ? state.summaryLabel
      : "No wedding changes or partner disagreements need review right now.",
    emptyLabel: hasItems
      ? null
      : "When preferences pull in different directions or reality changes, OmnyID will show one clear next step here.",
    cards,
    reviewAllAction: buildWeddingResilienceReviewAllAction(state),
    hasUrgentItem: state.urgentCount > 0,
    shouldShow: hasItems,
    semanticSurface: buildWeddingSemanticSurfaceState({
      semanticObjects,
      rendererFormatHint: "a2ui.v1",
    }),
    a2ui: {
      schema_version: "a2ui.v1",
      kind: "wedding_resilience_chain",
      title: "Changes and disagreements",
      summary: hasItems ? state.summaryLabel : "No wedding changes or partner disagreements need review right now.",
      cards: cards.map(cardA2ui),
      semantic_objects: semanticObjects,
    },
  };
}
