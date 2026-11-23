// @locs-version: 1.0
import { queueUiCommand } from "@/lib/api";
import {
  buildCleanWorkflowLinkHref,
  buildWorkflowReviewLinkHref,
  copyWorkflowTextToClipboard,
  promptWorkflowText,
  pushWorkflowHistoryState,
  type WorkflowClipboardWriter,
  type WorkflowHistoryWriter,
  type WorkflowPromptReader,
} from "@/lib/workflowLinkState";
import { workflowExportFilename, workflowExportPayload } from "@/lib/workflowExportState";
import {
  workflowReviewLinkFeedback,
  workflowStoredSharedReviewClearPreflightFeedback,
  workflowStoredSharedReviewClearedFeedback,
  workflowStoredSharedReviewPinFeedback,
  workflowStoredSharedReviewPinPreflightFeedback,
  workflowStoredSharedReviewRefreshedFeedback,
  workflowStoredSharedReviewRefreshPreflightFeedback,
  workflowStoredSharedReviewRenameFeedback,
  workflowStoredSharedReviewRenamePreflightFeedback,
  workflowStoredSharedReviewRenamePromptUnavailableFeedback,
  workflowStoredSharedReviewResumeFeedback,
  workflowStoredSharedReviewResumeTarget,
  type WorkflowStoredSharedReviewRecordStateEntry,
} from "@/lib/workflowReviewLocalState";
import type { StoredSharedReviewLink } from "@/lib/workflowReviewTypes";
import { workflowCleanLinkFeedback } from "@/lib/workflowLinkState";
import type { WorkflowEdgeDraft, WorkflowNodeDraft } from "@/lib/workflowGraphTypes";

export type WorkflowCloneStateResult = {
  clonedId: string;
  shouldRefetch: boolean;
};

export type WorkflowExportStateDependencies = {
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  triggerDownload?: (url: string, filename: string) => void;
};

export type WorkflowCopyLinkStateResult = {
  copied: boolean;
  href: string;
  feedback: string;
};

export type WorkflowResumeStoredReviewStateResult =
  | { kind: "missing"; feedback: string }
  | { kind: "blocked"; feedback: string }
  | {
      kind: "restored";
      feedback: string;
      reviewState: NonNullable<ReturnType<typeof workflowStoredSharedReviewResumeTarget>>["reviewState"];
    };

export type WorkflowStoredReviewMutationStateResult =
  | { kind: "preflight"; feedback: string }
  | { kind: "applied"; feedback: string };

export type WorkflowRenameStoredReviewStateResult =
  | { kind: "preflight"; feedback: string }
  | { kind: "cancelled" }
  | { kind: "unavailable"; feedback: string }
  | { kind: "applied"; feedback: string; title: string | null };

export async function cloneWorkflowState(
  workflowId: string,
  deps: {
    queueUiCommand?: typeof queueUiCommand;
  } = {},
): Promise<WorkflowCloneStateResult> {
  const queue = deps.queueUiCommand ?? queueUiCommand;
  await queue({ intent: "clone_workflow", workflow_id: workflowId });
  return {
    clonedId: workflowId,
    shouldRefetch: true,
  };
}

export function exportWorkflowJsonState(args: {
  workflowId: string;
  nodes: WorkflowNodeDraft[];
  edges: WorkflowEdgeDraft[];
  exportedAt?: string;
}, deps: WorkflowExportStateDependencies = {}): { filename: string } {
  const createObjectUrl = deps.createObjectUrl ?? ((blob) => URL.createObjectURL(blob));
  const revokeObjectUrl = deps.revokeObjectUrl ?? ((url) => URL.revokeObjectURL(url));
  const triggerDownload = deps.triggerDownload ?? ((url, filename) => {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  });

  let url: string | null = null;
  try {
    const data = workflowExportPayload({
      workflowId: args.workflowId,
      exportedAt: args.exportedAt ?? new Date().toISOString(),
      nodes: args.nodes,
      edges: args.edges,
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    url = createObjectUrl(blob);
    const filename = workflowExportFilename(args.workflowId);
    triggerDownload(url, filename);
    return { filename };
  } finally {
    if (url) revokeObjectUrl(url);
  }
}

export async function copyWorkflowCleanLinkState(args: {
  clipboard: WorkflowClipboardWriter | null | undefined;
  origin: string;
  pathname: string;
  hash: string;
  workflowId: string | null | undefined;
}): Promise<WorkflowCopyLinkStateResult> {
  const href = buildCleanWorkflowLinkHref({
    origin: args.origin,
    pathname: args.pathname,
    hash: args.hash,
    workflowId: args.workflowId,
  });
  const copied = await copyWorkflowTextToClipboard(args.clipboard, href);
  return {
    copied,
    href,
    feedback: workflowCleanLinkFeedback({ copied, href }),
  };
}

export async function copyWorkflowReviewLinkState(args: {
  clipboard: WorkflowClipboardWriter | null | undefined;
  currentHref: string;
  includeSavedReviewWorkspace: boolean;
  savedReviewWorkspaceActive: boolean;
}): Promise<WorkflowCopyLinkStateResult> {
  const href = buildWorkflowReviewLinkHref(args.currentHref, args.includeSavedReviewWorkspace);
  const copied = await copyWorkflowTextToClipboard(args.clipboard, href);
  return {
    copied,
    href,
    feedback: workflowReviewLinkFeedback({
      copied,
      href,
      includeSavedReviewWorkspace: args.includeSavedReviewWorkspace,
      savedReviewWorkspaceActive: args.savedReviewWorkspaceActive,
    }),
  };
}

export function resumeStoredSharedReviewState(args: {
  entry: WorkflowStoredSharedReviewRecordStateEntry | null | undefined;
  historyWriter: WorkflowHistoryWriter | null | undefined;
}): WorkflowResumeStoredReviewStateResult {
  const target = workflowStoredSharedReviewResumeTarget(args.entry);
  if (!target) {
    return {
      kind: "missing",
      feedback: "No shared investigation context is stored for this workflow yet.",
    };
  }
  const pushed = pushWorkflowHistoryState(args.historyWriter, target.nextUrl);
  if (!pushed) {
    return {
      kind: "blocked",
      feedback: "Could not restore the stored shared investigation link.",
    };
  }
  return {
    kind: "restored",
    feedback: workflowStoredSharedReviewResumeFeedback(target.shareMode),
    reviewState: target.reviewState,
  };
}

export function clearStoredSharedReviewState(args: {
  workflowId: string | null | undefined;
  record: StoredSharedReviewLink | null | undefined;
}): WorkflowStoredReviewMutationStateResult {
  const preflightFeedback = workflowStoredSharedReviewClearPreflightFeedback(args.workflowId, args.record);
  if (preflightFeedback) {
    return { kind: "preflight", feedback: preflightFeedback };
  }
  return { kind: "applied", feedback: workflowStoredSharedReviewClearedFeedback() };
}

export function refreshStoredSharedReviewState(args: {
  workflowId: string | null | undefined;
  href: string;
  shareMode: "workspace" | "core";
}): WorkflowStoredReviewMutationStateResult & {
  href?: string;
  shareMode?: "workspace" | "core";
} {
  const preflightFeedback = workflowStoredSharedReviewRefreshPreflightFeedback(args.workflowId);
  if (preflightFeedback) {
    return { kind: "preflight", feedback: preflightFeedback };
  }
  return {
    kind: "applied",
    href: args.href,
    shareMode: args.shareMode,
    feedback: workflowStoredSharedReviewRefreshedFeedback(),
  };
}

export function renameStoredSharedReviewState(args: {
  workflowId: string | null | undefined;
  record: StoredSharedReviewLink | null | undefined;
  promptReader: WorkflowPromptReader | null | undefined;
}): WorkflowRenameStoredReviewStateResult {
  const preflightFeedback = workflowStoredSharedReviewRenamePreflightFeedback(args.workflowId, args.record);
  if (preflightFeedback) {
    return { kind: "preflight", feedback: preflightFeedback };
  }
  const promptResult = promptWorkflowText(
    args.promptReader,
    "Name this saved investigation",
    args.record?.title ?? "",
  );
  if (promptResult.kind === "cancelled") return { kind: "cancelled" };
  if (promptResult.kind === "unavailable") {
    return { kind: "unavailable", feedback: workflowStoredSharedReviewRenamePromptUnavailableFeedback() };
  }
  const title = promptResult.value.trim() || null;
  return {
    kind: "applied",
    title,
    feedback: workflowStoredSharedReviewRenameFeedback(promptResult.value),
  };
}

export function togglePinStoredSharedReviewState(args: {
  workflowId: string | null | undefined;
  record: StoredSharedReviewLink | null | undefined;
}): WorkflowStoredReviewMutationStateResult & { nextPinned?: boolean } {
  const preflightFeedback = workflowStoredSharedReviewPinPreflightFeedback(args.workflowId, args.record);
  if (preflightFeedback) {
    return { kind: "preflight", feedback: preflightFeedback };
  }
  const nextPinned = !Boolean(args.record?.pinned);
  return {
    kind: "applied",
    nextPinned,
    feedback: workflowStoredSharedReviewPinFeedback(Boolean(args.record?.pinned)),
  };
}
