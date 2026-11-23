// @locs-version: 1.0
import {
  preparedDraftDestinationForItem,
  resolveContinuityNavigationTarget,
  resolveResponseNavigationTarget,
} from "afp-ts/continuity";
import {
  customEventRecordDetail,
  optionalNullableStringProperty,
  optionalStringProperty,
} from "./eventDetail";
import { normalizeViewName, type ViewName } from "./viewNames";
import type {
  DecisionOsActionItem,
  DecisionOsPriorityCard,
  DecisionOsProactiveSuggestion,
  DecisionOsResponseItem,
  DecisionOsStateFieldItem,
} from "./decisionosContinuity";

export const DECISION_OS_FOCUS_EVENT = "omnyid:decision-os-focus";
export const DECISION_OS_NAVIGATE_EVENT = "omnyid:navigate";

export const DECISION_OS_SETTINGS_TABS = ["llm", "mcp", "skills", "runtime"] as const;
export type DecisionOsSettingsTab = (typeof DECISION_OS_SETTINGS_TABS)[number];

export const DECISION_OS_FOCUS_PANELS = ["response_queue"] as const;
export type DecisionOsFocusPanel = (typeof DECISION_OS_FOCUS_PANELS)[number];

type DecisionOsNavigateExtraMap = {
  calendar: {
    eventId?: string;
    date?: string;
  };
  threads: {
    threadId?: string;
    messageId?: string;
  };
  agent_settings: {
    settingsTab?: DecisionOsSettingsTab | null;
  };
};

type DecisionOsNavigateExtrasForView<V extends ViewName> =
  V extends keyof DecisionOsNavigateExtraMap
    ? DecisionOsNavigateExtraMap[V]
    : Record<never, never>;

export type DecisionOsNavigateEventDetail<V extends ViewName = ViewName> = {
  view: V;
  eventId?: string;
  date?: string;
  threadId?: string;
  messageId?: string;
  settingsTab?: DecisionOsSettingsTab | null;
};

export type DecisionOsFocusEventDetail = {
  panel: DecisionOsFocusPanel;
};

function isDecisionOsSettingsTab(value: string): value is DecisionOsSettingsTab {
  return (DECISION_OS_SETTINGS_TABS as readonly string[]).includes(value);
}

function isDecisionOsFocusPanel(value: string): value is DecisionOsFocusPanel {
  return (DECISION_OS_FOCUS_PANELS as readonly string[]).includes(value);
}

function normalizedDecisionOsNavigateDetail(
  detail: Record<string, unknown>,
): DecisionOsNavigateEventDetail | null {
  const view = typeof detail.view === "string" ? normalizeViewName(detail.view) : null;
  if (!view) return null;
  if (view === "calendar") {
    const eventId = optionalStringProperty(detail, "eventId");
    const date = optionalStringProperty(detail, "date");
    return eventId !== null && date !== null
      ? {
          view,
          ...(typeof eventId !== "undefined" ? { eventId } : {}),
          ...(typeof date !== "undefined" ? { date } : {}),
        }
      : null;
  }
  if (view === "threads") {
    const threadId = optionalStringProperty(detail, "threadId");
    const messageId = optionalStringProperty(detail, "messageId");
    return threadId !== null && messageId !== null
      ? {
          view,
          ...(typeof threadId !== "undefined" ? { threadId } : {}),
          ...(typeof messageId !== "undefined" ? { messageId } : {}),
        }
      : null;
  }
  if (view === "agent_settings") {
    const settingsTab = optionalNullableStringProperty(detail, "settingsTab");
    return (
      settingsTab === false
      || (typeof settingsTab === "string" && !isDecisionOsSettingsTab(settingsTab))
    )
      ? null
      : {
          view,
          ...(typeof settingsTab !== "undefined" ? { settingsTab: settingsTab ?? null } : {}),
        };
  }
  return { view };
}

export function readDecisionOsNavigateEventDetail(
  event: Event,
): DecisionOsNavigateEventDetail | null {
  const detail = customEventRecordDetail(event);
  return detail ? normalizedDecisionOsNavigateDetail(detail) : null;
}

export function subscribeDecisionOsNavigateEvent(
  callback: (detail: DecisionOsNavigateEventDetail) => void,
  target: Window = window,
): () => void {
  const handler = (event: Event) => {
    const detail = readDecisionOsNavigateEventDetail(event);
    if (!detail) return;
    callback(detail);
  };
  target.addEventListener(DECISION_OS_NAVIGATE_EVENT, handler);
  return () => target.removeEventListener(DECISION_OS_NAVIGATE_EVENT, handler);
}

export function navigateToView<V extends ViewName>(
  view: V,
  extra?: DecisionOsNavigateExtrasForView<V>,
) {
  let detail: DecisionOsNavigateEventDetail<V>;
  switch (view) {
    case "calendar": {
      const eventId = extra && "eventId" in extra ? extra.eventId : undefined;
      const date = extra && "date" in extra ? extra.date : undefined;
      detail = { view: "calendar", eventId, date } as DecisionOsNavigateEventDetail<V>;
      break;
    }
    case "threads": {
      const threadId = extra && "threadId" in extra ? extra.threadId : undefined;
      const messageId = extra && "messageId" in extra ? extra.messageId : undefined;
      detail = {
        view: "threads",
        ...(threadId ? { threadId } : {}),
        ...(messageId ? { messageId } : {}),
      } as DecisionOsNavigateEventDetail<V>;
      break;
    }
    case "agent_settings":
      detail = {
        view: "agent_settings",
        settingsTab: extra && "settingsTab" in extra ? extra.settingsTab : undefined,
      } as DecisionOsNavigateEventDetail<V>;
      break;
    default:
      detail = { view } as DecisionOsNavigateEventDetail<V>;
      break;
  }
  window.dispatchEvent(
    new CustomEvent(DECISION_OS_NAVIGATE_EVENT, {
      detail,
    }),
  );
}

function decisionOsViewNameOrNull(
  value: string | null | undefined,
): ViewName | null {
  return normalizeViewName(value);
}

function continuityDestinationOrNull(
  value: string | null | undefined,
): ViewName | "context_panel" | null {
  if (value === "context_panel") return "context_panel";
  return decisionOsViewNameOrNull(value);
}

function leadingContinuityActionSurfaceHint(
  actionItems: DecisionOsActionItem[],
): ViewName | "context_panel" | null {
  const firstItem = actionItems[0];
  return continuityDestinationOrNull(firstItem?.surface_hint);
}

export function decisionOsDestinationLabel(
  value: string | null | undefined,
): string {
  switch (value) {
    case "context_panel":
      return "context panel";
    case "decision_queue":
      return "decision queue";
    case "response_queue":
      return "response queue";
    case "agent_settings":
      return "agent settings";
    case "cost_dashboard":
      return "cost dashboard";
    case "knowledge_graph":
      return "knowledge graph";
    case "public_feed":
      return "public feed";
    case "space_feed":
      return "space feed";
    case "cofounder_studio":
      return "cofounder studio";
    case "connected_apps":
      return "connected apps";
    case "sovereignty_audit":
      return "sovereignty audit";
    default:
      return value ? value.replaceAll("_", " ") : "home";
  }
}

export function readDecisionOsFocusEventDetail(
  event: Event,
): DecisionOsFocusEventDetail | null {
  const detail = customEventRecordDetail(event);
  if (!detail || typeof detail.panel !== "string" || !isDecisionOsFocusPanel(detail.panel)) return null;
  return { panel: detail.panel };
}

export function subscribeDecisionOsFocusEvent(
  callback: (detail: DecisionOsFocusEventDetail) => void,
  target: Window = window,
): () => void {
  const handler = (event: Event) => {
    const detail = readDecisionOsFocusEventDetail(event);
    if (detail === null) return;
    callback(detail);
  };
  target.addEventListener(DECISION_OS_FOCUS_EVENT, handler);
  return () => target.removeEventListener(DECISION_OS_FOCUS_EVENT, handler);
}

export function decisionOsContinuityDecisionThreadLabel(
  priorityCard?: Pick<DecisionOsPriorityCard, "panel_kind" | "surface_hint" | "source_refs"> | null,
  actionItems: DecisionOsActionItem[] = [],
): string {
  const target = resolveContinuityNavigationTarget(priorityCard, actionItems);
  const destination =
    continuityDestinationOrNull(priorityCard?.panel_kind)
    ?? continuityDestinationOrNull(priorityCard?.surface_hint)
    ?? leadingContinuityActionSurfaceHint(actionItems)
    ?? continuityDestinationOrNull(target?.view)
    ?? "threads";
  if (destination === "home" || destination === "context_panel") {
    return "workspace";
  }
  return decisionOsDestinationLabel(destination);
}

export function openContinuityDecisionThreadTarget(
  priorityCard?: DecisionOsPriorityCard | null,
  actionItems: DecisionOsActionItem[] = [],
) {
  const target = resolveContinuityNavigationTarget(priorityCard, actionItems);
  const destination =
    continuityDestinationOrNull(priorityCard?.panel_kind)
    ?? continuityDestinationOrNull(priorityCard?.surface_hint)
    ?? leadingContinuityActionSurfaceHint(actionItems)
    ?? continuityDestinationOrNull(target?.view)
    ?? "threads";
  if (destination === "calendar") {
    navigateToView("calendar");
    return;
  }
  if (destination === "home") {
    navigateToView("home");
    return;
  }
  if (destination === "decision_queue") {
    navigateToView("decision_queue");
    return;
  }
  if (destination === "response_queue") {
    navigateToView("response_queue");
    return;
  }
  if (destination === "context_panel") {
    navigateToView("home");
    return;
  }
  if (destination === "threads") {
    const threadTarget = target?.view === "threads" ? target : null;
    navigateToView("threads", {
      threadId: threadTarget?.threadId,
      messageId: threadTarget?.messageId,
    });
    return;
  }
  navigateToView(destination);
}

export function decisionOsProactiveSuggestionDestination(
  item: DecisionOsProactiveSuggestion,
) : ViewName {
  if (item.destination_view) {
    const destinationView = decisionOsViewNameOrNull(item.destination_view);
    if (destinationView) return destinationView;
  }
  if (item.kind === "prepared_draft" && item.draft_class) {
    return (
      decisionOsViewNameOrNull(
        preparedDraftDestinationForItem({ draft_class: item.draft_class }),
      ) ?? "home"
    );
  }
  if (item.kind === "context_pack") return "home";
  if (item.kind === "continuity_priority") {
    return (
      decisionOsViewNameOrNull(item.panel_kind)
      ?? decisionOsViewNameOrNull(item.surface_hint)
      ?? "home"
    );
  }
  return decisionOsViewNameOrNull(item.surface_hint) ?? "home";
}

export function openDecisionOsResponseTarget(
  items: DecisionOsResponseItem[],
) {
  const target = resolveResponseNavigationTarget(items);
  switch (target?.view) {
    case "calendar":
      navigateToView("calendar");
      return;
    case "threads":
      navigateToView("threads", {
        threadId: target.threadId,
        messageId: target.messageId,
      });
      return;
    default:
      window.dispatchEvent(
        new CustomEvent(DECISION_OS_FOCUS_EVENT, {
          detail: { panel: "response_queue" },
        }),
      );
      return;
  }
}

export function openDecisionOsStateFieldTarget(
  field: Pick<DecisionOsStateFieldItem, "surface_hint">,
) {
  const destination =
    field.surface_hint === "decision_queue"
      || field.surface_hint === "response_queue"
      || field.surface_hint === "context_panel"
      ? field.surface_hint
      : "home";
  if (destination === "context_panel") {
    navigateToView("home");
    return;
  }
  navigateToView(destination);
}
