// @locs-version: 1.0
import type { RunTimelineFilterMode } from "@/lib/workflowGraphTypes";
import type { RunHistoryDriftFilter, RunHistorySortMode } from "@/lib/workflowReviewTypes";

const SAVED_REVIEW_SEARCH_KEYS = ["srid", "sra", "srf", "srsm", "srmf", "srpo"];

export type WorkflowReviewStateUrlArgs = {
  currentSearch: string;
  driftFilter: RunHistoryDriftFilter;
  focusedNodeId: string | null | undefined;
  hash: string;
  pathname: string;
  runHistorySortMode: RunHistorySortMode;
  runId: string | null | undefined;
  savedReviewFilter: string;
  savedReviewPinnedOnly: boolean;
  savedReviewShareModeFilter: "all" | "workspace" | "core";
  savedReviewSortMode: "priority" | "recent";
  selectedDeploymentId: string | null | undefined;
  selectedEdgeId: string | null | undefined;
  selectedNodeId: string | null | undefined;
  selectedReviewId: string | null | undefined;
  showAllSavedReviews: boolean;
  timelineFilter: RunTimelineFilterMode;
  workflowId: string | null | undefined;
};

export type WorkflowHistoryWriter = {
  pushState(data: unknown, unused: string, url?: string | URL | null): void;
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
};

export type WorkflowClipboardWriter = {
  writeText(text: string): Promise<void> | void;
};

export type WorkflowPromptReader = {
  prompt(message?: string, defaultValue?: string): string | null;
};

export type WorkflowPromptResult =
  | { kind: "answered"; value: string }
  | { kind: "cancelled" }
  | { kind: "unavailable" };

export function buildWorkflowReviewLinkHref(
  currentHref: string,
  includeSavedReviewWorkspace: boolean,
): string {
  const url = new URL(currentHref);
  if (!includeSavedReviewWorkspace) {
    for (const key of SAVED_REVIEW_SEARCH_KEYS) {
      url.searchParams.delete(key);
    }
  }
  return `${url.origin}${url.pathname}${url.search}${url.hash}`;
}

export function buildCleanWorkflowLinkHref(args: {
  origin: string;
  pathname: string;
  hash: string;
  workflowId: string | null | undefined;
}): string {
  const params = new URLSearchParams();
  if (args.workflowId) params.set("wf", args.workflowId);
  return `${args.origin}${args.pathname}${params.toString() ? `?${params.toString()}` : ""}${args.hash}`;
}

export function workflowCleanLinkFeedback(args: {
  copied: boolean;
  href: string;
}): string {
  return args.copied
    ? "Copied clean workflow link to clipboard without run or investigation state."
    : `Copy this workflow link manually. It opens the workflow without run review context: ${args.href}`;
}

export function buildWorkflowReviewStateUrl(args: WorkflowReviewStateUrlArgs): string {
  const params = new URLSearchParams(args.currentSearch);
  const setOrDelete = (key: string, value: string | null | undefined, defaultValue?: string) => {
    if (!value || (defaultValue !== undefined && value === defaultValue)) params.delete(key);
    else params.set(key, value);
  };

  setOrDelete("wf", args.workflowId ?? null);
  setOrDelete("run", args.runId ?? null);
  setOrDelete("edge", args.selectedEdgeId ?? null);
  setOrDelete("tf", args.timelineFilter, "all");
  setOrDelete("focus", args.focusedNodeId ?? null);
  setOrDelete("dep", args.selectedDeploymentId ?? null);
  setOrDelete("node", args.selectedNodeId ?? null);
  setOrDelete("rdf", args.driftFilter, "all");
  setOrDelete("rds", args.runHistorySortMode, "recent");
  setOrDelete("srid", args.selectedReviewId ?? null);
  setOrDelete("sra", args.showAllSavedReviews ? "1" : null);
  setOrDelete("srf", args.savedReviewFilter);
  setOrDelete("srsm", args.savedReviewSortMode, "priority");
  setOrDelete("srmf", args.savedReviewShareModeFilter, "all");
  setOrDelete("srpo", args.savedReviewPinnedOnly ? "1" : null);

  const nextSearch = params.toString();
  return `${args.pathname}${nextSearch ? `?${nextSearch}` : ""}${args.hash}`;
}

export function workflowUrlsMatchView(
  storedUrl: URL | null | undefined,
  currentHref: string,
): boolean {
  if (!storedUrl) return false;
  try {
    const currentUrl = new URL(currentHref);
    return `${storedUrl.pathname}${storedUrl.search}${storedUrl.hash}`
      === `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
  } catch {
    return false;
  }
}

export function replaceWorkflowHistoryState(
  historyWriter: WorkflowHistoryWriter | null | undefined,
  nextUrl: string,
): boolean {
  if (!historyWriter) return false;
  try {
    historyWriter.replaceState({}, "", nextUrl);
    return true;
  } catch {
    return false;
  }
}

export function pushWorkflowHistoryState(
  historyWriter: WorkflowHistoryWriter | null | undefined,
  nextUrl: string,
): boolean {
  if (!historyWriter) return false;
  try {
    historyWriter.pushState({}, "", nextUrl);
    return true;
  } catch {
    return false;
  }
}

export async function copyWorkflowTextToClipboard(
  clipboardWriter: WorkflowClipboardWriter | null | undefined,
  text: string,
): Promise<boolean> {
  if (!clipboardWriter) return false;
  try {
    await clipboardWriter.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function promptWorkflowText(
  promptReader: WorkflowPromptReader | null | undefined,
  message: string,
  defaultValue = "",
): WorkflowPromptResult {
  if (!promptReader) return { kind: "unavailable" };
  try {
    const value = promptReader.prompt(message, defaultValue);
    return value === null ? { kind: "cancelled" } : { kind: "answered", value };
  } catch {
    return { kind: "unavailable" };
  }
}
