// @locs-version: 2.0
import {
  buildWeddingNavigationArrivalState,
  type WeddingNavigationArrivalState,
  type WeddingNavigationArrivalTone,
} from "@/lib/weddingNavigationArrivalState";
import type { WeddingNavigationStoredIntent } from "@/lib/weddingNavigationLocalState";
import type {
  WeddingNavigationIntent,
  WeddingNavigationSurface,
} from "@/lib/weddingNavigationState";
import type { ViewName } from "@/lib/viewNames";

export type WeddingArrivalActionKind =
  | "open_workspace"
  | "continue_chat"
  | "review_calendar"
  | "review_tasks"
  | "open_graph"
  | "open_connected_apps"
  | "review_approval"
  | "review_export"
  | "verify_map"
  | "dismiss";

export type WeddingArrivalAction = {
  kind: WeddingArrivalActionKind;
  label: string;
  description: string;
  disabled: boolean;
};

export type WeddingArrivalChip = {
  label: string;
  value: string;
};

export type WeddingNavigationArrivalBannerState = {
  title: string;
  subtitle: string;
  badge: string;
  tone: WeddingNavigationArrivalTone;
  chips: WeddingArrivalChip[];
  bodyItems: Array<{
    label: string;
    detail: string;
    tone: WeddingNavigationArrivalTone;
  }>;
  warning: string;
  primaryAction: WeddingArrivalAction;
  secondaryActions: WeddingArrivalAction[];
  dismissAction: WeddingArrivalAction;
  source: WeddingNavigationArrivalState;
};

export function weddingArrivalActionDestinationView(action: WeddingArrivalAction): ViewName | null {
  if (action.disabled || action.kind === "dismiss") return null;
  if (action.kind === "open_workspace") return "response_queue";
  if (action.kind === "continue_chat") return "threads";
  if (action.kind === "review_calendar") return "calendar";
  if (action.kind === "review_tasks") return "tasks";
  if (action.kind === "open_graph") return "knowledge_graph";
  if (action.kind === "open_connected_apps") return "connected_apps";
  if (action.kind === "review_approval") return "decision_queue";
  if (action.kind === "review_export") return "files";
  if (action.kind === "verify_map") return "search";
  return null;
}

function hasExpectedBehaviorAudit(
  intent: WeddingNavigationIntent | WeddingNavigationStoredIntent,
): boolean {
  const packet = record(intent.metadata).expected_behavior_audit;
  return Boolean(packet && typeof packet === "object" && !Array.isArray(packet));
}

function actionFor(
  surface: WeddingNavigationSurface,
  intent: WeddingNavigationIntent | WeddingNavigationStoredIntent,
): WeddingArrivalAction {
  if (surface === "planning_files") {
    return {
      kind: "open_workspace",
      label: "Open wedding documents",
      description: "Review the wedding documents OmnyID made for this response.",
      disabled: false,
    };
  }
  if (surface === "continue_chat" || surface === "probe") {
    return {
      kind: "continue_chat",
      label: surface === "probe" ? "Answer question" : "Continue chat",
      description: "Continue from the carried wedding plan context.",
      disabled: false,
    };
  }
  if (surface === "calendar") {
    return {
      kind: "review_calendar",
      label: "Review dates",
      description: "Check tentative and confirmed wedding dates before syncing.",
      disabled: false,
    };
  }
  if (surface === "tasks") {
    if (hasExpectedBehaviorAudit(intent)) {
      return {
        kind: "review_tasks",
        label: "Review gap tasks",
        description: "Review suggested planning gap tasks, then keep only the ones with clear proof, owners, and due dates.",
        disabled: false,
      };
    }
    return {
      kind: "review_tasks",
      label: "Review tasks",
      description: "Confirm owners, due dates, and priority before committing tasks.",
      disabled: false,
    };
  }
  if (surface === "knowledge_graph") {
    return {
      kind: "open_graph",
      label: "Show related details",
      description: "Review connected wedding details, risks, and missing proof.",
      disabled: false,
    };
  }
  if (surface === "connected_apps") {
    return {
      kind: "open_connected_apps",
      label: "Open Connected Apps",
      description: "Connect missing providers for approved wedding sends, syncs, publishes, and follow-ups.",
      disabled: false,
    };
  }
  if (surface === "approval") {
    return {
      kind: "review_approval",
      label: "Review approval",
      description: "Review the exact consequential action before it runs.",
      disabled: false,
    };
  }
  if (surface === "export") {
    return {
      kind: "review_export",
      label: "Review export",
      description: "Choose safe formats and check sensitive artifacts.",
      disabled: false,
    };
  }
  return {
    kind: "verify_map",
    label: "Verify places",
    description: "Check live venue, vendor, travel, and map details.",
    disabled: false,
  };
}

function secondaryActionsFor(surface: WeddingNavigationSurface): WeddingArrivalAction[] {
  const actions = baseSecondaryActionsFor(surface);
  if (surface !== "approval") {
    actions.push({
      kind: "review_approval",
      label: "Approvals",
      description: "Review blocked sends, shares, calendar syncs, and publish actions.",
      disabled: false,
    });
  }
  return actions;
}

function baseSecondaryActionsFor(surface: WeddingNavigationSurface): WeddingArrivalAction[] {
  const actions: WeddingArrivalAction[] = [
    {
      kind: "open_workspace",
      label: "Wedding documents",
      description: "Open the documents for this wedding response.",
      disabled: surface === "planning_files",
    },
    {
      kind: "continue_chat",
      label: "Continue chat",
      description: "Ask for edits, alternatives, or the next planning artifact.",
      disabled: surface === "continue_chat" || surface === "probe",
    },
    {
      kind: "open_graph",
      label: "Related details",
      description: "Review connected details and missing proof.",
      disabled: surface === "knowledge_graph",
    },
    {
      kind: "open_connected_apps",
      label: "Connected Apps",
      description: "Connect providers required by approved wedding actions.",
      disabled: surface === "connected_apps",
    },
  ];
  return actions;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function countFrom(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function handoffPacketFrom(
  intent: WeddingNavigationIntent | WeddingNavigationStoredIntent,
): Record<string, unknown> {
  return record(record(intent.metadata).handoff_context);
}

function decisionScopeCountFrom(
  intent: WeddingNavigationIntent | WeddingNavigationStoredIntent,
): number {
  const metadata = record(intent.metadata);
  const directScopes = Array.isArray(metadata.decision_scopes) ? metadata.decision_scopes.length : 0;
  const continueContext = record(metadata.continue_context);
  const continueScopes = Array.isArray(continueContext.decisionScopeLabels) ? continueContext.decisionScopeLabels.length : 0;
  const handoffCount = countFrom(handoffPacketFrom(intent).decisionScopeCount);
  return Math.max(directScopes, continueScopes, handoffCount);
}

function expectedBehaviorGapCountFrom(
  intent: WeddingNavigationIntent | WeddingNavigationStoredIntent,
): number {
  const packet = record(record(intent.metadata).expected_behavior_audit);
  const blockedCount = countFrom(packet.blocked_count);
  const suggestedTaskCount = countFrom(packet.suggested_task_count);
  return Math.max(blockedCount, suggestedTaskCount);
}

function decisionFocusCountFrom(
  intent: WeddingNavigationIntent | WeddingNavigationStoredIntent,
): number {
  const metadata = record(intent.metadata);
  const focusPacket = record(metadata.decision_focus);
  const focusItems = Array.isArray(focusPacket.focus_items) ? focusPacket.focus_items.length : 0;
  const handoffCount = countFrom(handoffPacketFrom(intent).decisionFocusCount);
  return Math.max(focusItems, handoffCount);
}

function handoffSecondaryActionsFor(
  surface: WeddingNavigationSurface,
  intent: WeddingNavigationIntent | WeddingNavigationStoredIntent,
): WeddingArrivalAction[] {
  const packet = handoffPacketFrom(intent);
  const linkedDateCount = countFrom(packet.linkedCalendarCount);
  const linkedTaskCount = countFrom(packet.linkedTaskCount);
  const exportIncludedCount = countFrom(packet.exportIncludedCount);
  const exportExcludedSensitiveCount = countFrom(packet.exportExcludedSensitiveCount);
  const actions: WeddingArrivalAction[] = [];
  if (linkedDateCount > 0 && surface !== "calendar") {
    actions.push({
      kind: "review_calendar",
      label: `Calendar (${linkedDateCount})`,
      description: "Review linked wedding dates carried from this response.",
      disabled: false,
    });
  }
  if (linkedTaskCount > 0 && surface !== "tasks") {
    actions.push({
      kind: "review_tasks",
      label: `Tasks (${linkedTaskCount})`,
      description: "Review linked wedding tasks carried from this response.",
      disabled: false,
    });
  }
  if ((exportIncludedCount > 0 || exportExcludedSensitiveCount > 0) && surface !== "export") {
    actions.push({
      kind: "review_export",
      label: exportExcludedSensitiveCount > 0 ? "Download safely" : "Download plan",
      description: "Review what will be included before downloading wedding documents.",
      disabled: false,
    });
  }
  return actions;
}

function toneFor(surface: WeddingNavigationSurface): WeddingNavigationArrivalTone {
  if (surface === "connected_apps") return "amber";
  if (surface === "approval" || surface === "export") return "amber";
  if (surface === "calendar" || surface === "tasks") return "emerald";
  if (surface === "knowledge_graph") return "violet";
  if (surface === "map") return "sky";
  return "sky";
}

function chipsFor(
  state: WeddingNavigationArrivalState,
  intent: WeddingNavigationIntent | WeddingNavigationStoredIntent,
): WeddingArrivalChip[] {
  const decisionScopeCount = decisionScopeCountFrom(intent);
  const decisionFocusCount = decisionFocusCountFrom(intent);
  const expectedBehaviorGapCount = expectedBehaviorGapCountFrom(intent);
  return [
    decisionScopeCount > 0 ? { label: "Selected", value: `${decisionScopeCount} choice${decisionScopeCount === 1 ? "" : "s"}` } : null,
    decisionFocusCount > 0 ? { label: "Focus", value: `${decisionFocusCount} decision${decisionFocusCount === 1 ? "" : "s"}` } : null,
    expectedBehaviorGapCount > 0 ? { label: "Gaps", value: `${expectedBehaviorGapCount} planning gap${expectedBehaviorGapCount === 1 ? "" : "s"}` } : null,
    state.savedAt ? { label: "Loaded", value: state.savedAt } : null,
  ].filter((chip): chip is WeddingArrivalChip => chip !== null);
}

export function buildWeddingNavigationArrivalBannerState(
  intent: WeddingNavigationIntent | WeddingNavigationStoredIntent | null | undefined,
): WeddingNavigationArrivalBannerState | null {
  const source = buildWeddingNavigationArrivalState(intent);
  if (!source || !intent) return null;
  return {
    title: source.headline,
    subtitle: `${source.detail} ${source.nextStep}`,
    badge: source.badge,
    tone: toneFor(source.surface),
    chips: chipsFor(source, intent),
    bodyItems: source.cards,
    warning: "Treat this as carried planning context, not proof that external messages, bookings, calendar invites, or registry changes have happened.",
    primaryAction: actionFor(source.surface, intent),
    secondaryActions: [
      ...handoffSecondaryActionsFor(source.surface, intent),
      ...secondaryActionsFor(source.surface),
    ],
    dismissAction: {
      kind: "dismiss",
      label: "Dismiss",
      description: "Hide this wedding planning arrival notice for the current destination.",
      disabled: false,
    },
    source,
  };
}
