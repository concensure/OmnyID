// @locs-version: 1.0
export type OperatorRuntimeRemediationShortcutIntent =
  | "issue_cleanup_receipt"
  | "complete_featured_receipt_from_draft"
  | "focus_featured_receipt_queue"
  | "copy_featured_receipt_command"
  | "filter_open"
  | "filter_completed"
  | "filter_all"
  | "filter_drafts"
  | "clear_featured_receipt"
  | "clear_all_local_drafts";

export type OperatorRuntimeRemediationShortcutCatalogEntry = {
  intent: OperatorRuntimeRemediationShortcutIntent;
  id: string;
  label: string;
  shortcut: string;
  key: string;
};

export const OPERATOR_RUNTIME_REMEDIATION_SHORTCUTS: readonly OperatorRuntimeRemediationShortcutCatalogEntry[] = [
  {
    intent: "issue_cleanup_receipt",
    id: "operator_issue_cleanup_receipt",
    label: "Operator: issue cleanup receipt",
    shortcut: "Alt+R",
    key: "r",
  },
  {
    intent: "complete_featured_receipt_from_draft",
    id: "operator_complete_featured_receipt_from_draft",
    label: "Operator: complete featured receipt from draft",
    shortcut: "Alt+X",
    key: "x",
  },
  {
    intent: "focus_featured_receipt_queue",
    id: "operator_focus_featured_receipt_queue",
    label: "Operator: show featured receipt in its queue",
    shortcut: "Alt+J",
    key: "j",
  },
  {
    intent: "copy_featured_receipt_command",
    id: "operator_copy_featured_receipt_command",
    label: "Operator: copy featured cleanup command",
    shortcut: "Alt+Y",
    key: "y",
  },
  {
    intent: "filter_open",
    id: "operator_filter_open",
    label: "Operator: open remediation receipts",
    shortcut: "Alt+O",
    key: "o",
  },
  {
    intent: "filter_completed",
    id: "operator_filter_completed",
    label: "Operator: completed remediation receipts",
    shortcut: "Alt+C",
    key: "c",
  },
  {
    intent: "filter_all",
    id: "operator_filter_all",
    label: "Operator: all remediation receipts",
    shortcut: "Alt+A",
    key: "a",
  },
  {
    intent: "filter_drafts",
    id: "operator_filter_drafts",
    label: "Operator: drafted remediation receipts",
    shortcut: "Alt+T",
    key: "t",
  },
  {
    intent: "clear_featured_receipt",
    id: "operator_clear_featured_receipt",
    label: "Operator: clear summary pin",
    shortcut: "Alt+U",
    key: "u",
  },
  {
    intent: "clear_all_local_drafts",
    id: "operator_clear_all_local_drafts",
    label: "Operator: clear all local drafts",
    shortcut: "Alt+D",
    key: "d",
  },
];

const OPERATOR_RUNTIME_REMEDIATION_SHORTCUTS_BY_KEY = new Map(
  OPERATOR_RUNTIME_REMEDIATION_SHORTCUTS.map((entry) => [entry.key, entry.intent] as const),
);

const OPERATOR_RUNTIME_REMEDIATION_SHORTCUTS_BY_INTENT = new Map(
  OPERATOR_RUNTIME_REMEDIATION_SHORTCUTS.map((entry) => [entry.intent, entry] as const),
);

export function targetIsTypingSurface(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  const tag = element?.tagName ?? "";
  return ["INPUT", "TEXTAREA", "SELECT"].includes(tag) || Boolean(element?.isContentEditable);
}

export function readOperatorRuntimeRemediationShortcutCatalogEntry(
  intent: OperatorRuntimeRemediationShortcutIntent,
): OperatorRuntimeRemediationShortcutCatalogEntry {
  return OPERATOR_RUNTIME_REMEDIATION_SHORTCUTS_BY_INTENT.get(intent)
    ?? OPERATOR_RUNTIME_REMEDIATION_SHORTCUTS[0]!;
}

export function readOperatorRuntimeRemediationShortcutsHint(): string {
  return OPERATOR_RUNTIME_REMEDIATION_SHORTCUTS.map((entry) => {
    const normalizedLabel = entry.label.replace(/^Operator:\s*/i, "");
    return `${entry.shortcut} ${normalizedLabel}`;
  }).join(", ");
}

export function readOperatorRuntimeRemediationShortcutIntent(args: {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  key: string;
  target: EventTarget | null;
}): OperatorRuntimeRemediationShortcutIntent | null {
  if (targetIsTypingSurface(args.target)) return null;
  if (!args.altKey || args.ctrlKey || args.metaKey || args.shiftKey) return null;
  return OPERATOR_RUNTIME_REMEDIATION_SHORTCUTS_BY_KEY.get(args.key.toLowerCase()) ?? null;
}
