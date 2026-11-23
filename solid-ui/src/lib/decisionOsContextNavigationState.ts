// @locs-version: 1.0
import { resolveContextItemNavigationTarget } from "afp-ts/continuity";

export type DecisionOsContextNavItem = {
  sourceRefs?: string[];
  sourceUrl?: string;
};

export type DecisionOsContextFooterDecision = {
  id: string;
  title: string;
};

export type DecisionOsSearchActionChip = {
  id: string;
  label: string;
};

export type DecisionOsContextItemNavPlan =
  | { kind: "calendar" }
  | { kind: "threads"; threadId?: string; messageId?: string }
  | { kind: "external"; href: string }
  | { kind: "none" };

export type DecisionOsContextFooterActions = {
  draftsActionChip: {
    id: string;
    label: string;
  };
  draftsButtonLabel: string;
  draftsButtonTitle: string;
  threadsView: "threads";
  threadsButtonLabel: string;
  threadsButtonTitle: string;
  searchTerm: string;
  searchActionChip: DecisionOsSearchActionChip;
  searchButtonLabel: string;
  searchButtonTitle: string;
  searchMagic: {
    action: "search";
    icon: string;
    label: string;
    id: string;
  };
};

export function decisionOsContextItemOpenLabel(item: DecisionOsContextNavItem): string {
  return `Open ${decisionOsContextItemTargetLabelFromRefs(item.sourceRefs) ?? "source"} ->`;
}

export function decisionOsContextItemTargetLabelFromRefs(sourceRefs?: string[]): string | null {
  for (const rawRef of sourceRefs ?? []) {
    const ref = rawRef.trim();
    if (!ref) continue;
    if (ref.startsWith("calendar:")) return "Calendar";
    for (const prefix of ["thread:", "conversation:"]) {
      if (ref.startsWith(prefix)) {
        const value = normalizeRefValue(ref.slice(prefix.length));
        return value ? `Thread: ${value}` : "Thread";
      }
    }
    for (const prefix of ["message:", "msg:", "email:", "note:"]) {
      if (ref.startsWith(prefix)) {
        const value = normalizeRefValue(ref.slice(prefix.length));
        return value ? `Object: ${value}` : "Object";
      }
    }
    const value = normalizeRefValue(ref);
    if (value) return `Object: ${value}`;
  }
  return null;
}

export function decisionOsSearchActionChip(term: string): DecisionOsSearchActionChip {
  return { id: `search:${term}`, label: `Search: ${term}` };
}

export function decisionOsContextFooterActions(
  decision: DecisionOsContextFooterDecision,
): DecisionOsContextFooterActions {
  return {
    draftsActionChip: {
      id: "open-drafts",
      label: "Open Prepared Drafts",
    },
    draftsButtonLabel: "Draft reply",
    draftsButtonTitle: "Open prepared drafts related to this decision",
    threadsView: "threads",
    threadsButtonLabel: "Threads",
    threadsButtonTitle: "Open threads surface to see full conversation context",
    searchTerm: decision.title,
    searchActionChip: decisionOsSearchActionChip(decision.title),
    searchButtonLabel: "Search",
    searchButtonTitle: "Search across all surfaces for this decision",
    searchMagic: {
      action: "search",
      icon: "🔍",
      label: `Search: ${decision.title}`,
      id: `ctx-search-${decision.id}`,
    },
  };
}

export function decisionOsContextItemNavPlan(item: DecisionOsContextNavItem): DecisionOsContextItemNavPlan {
  const target = resolveContextItemNavigationTarget({ sourceRefs: item.sourceRefs });
  switch (target?.view) {
    case "calendar":
      return { kind: "calendar" };
    case "threads":
      return { kind: "threads", threadId: target.threadId, messageId: target.messageId };
    default:
      return item.sourceUrl?.trim() ? { kind: "external", href: item.sourceUrl } : { kind: "none" };
  }
}

export function decisionOsContextEmptyStateLabel(): string {
  return "No context surfaced yet";
}

export function decisionOsContextSelectionPromptLabel(): string {
  return "Select a decision card to see auto-surfaced context and reasoning.";
}

export function decisionOsContextShortcutHintLabel(): string {
  return "Press ? for keyboard shortcuts";
}

export function decisionOsContextPanelTitle(): string {
  return "Context";
}

export function decisionOsContextCalendarActionLabel(): string {
  return "Open in Calendar View";
}

export function decisionOsContextExternalViewLabel(): string {
  return "View ->";
}

export function decisionOsContextWorkspaceActionLabel(): string {
  return "Open workspace";
}

export function decisionOsContextAnnotationPlaceholder(): string {
  return "Private note for this context";
}

export function decisionOsContextPinAriaLabel(isPinned: boolean): string {
  return isPinned ? "Unpin context panel" : "Pin context panel to this decision";
}

export function decisionOsContextPinTitle(isPinned: boolean): string {
  return isPinned
    ? "Pinned panel stays on this decision while you navigate"
    : "Pin to keep this context visible while browsing other cards";
}

export function decisionOsContextCloseAriaLabel(): string {
  return "Close context panel";
}

export function decisionOsContextWhyMattersTitle(): string {
  return "TL;DR";
}

export function decisionOsContextAddNoteLabel(): string {
  return "+ note";
}

export function decisionOsContextSaveNoteLabel(): string {
  return "Save";
}

function normalizeRefValue(value: string): string {
  return value.replaceAll(/[-_]+/g, " ").replaceAll(/\s+/g, " ").trim();
}
