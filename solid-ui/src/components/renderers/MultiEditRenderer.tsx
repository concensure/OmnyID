// @locs-version: 1.0
import { For, Show, createMemo, createSignal } from "solid-js";
import type { AfpMessage, AfpView } from "@/lib/api";
import { applyMultiEdit } from "@/lib/api";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import { isRecord } from "@/lib/eventDetail";
import {
  buildChangeProposalFailureReceipt,
  type ChangeProposalFailureReceipt,
} from "@/lib/changeProposalFailureState";
import { ApprovalDecisionButtons } from "@/components/ApprovalDecisionButtons";
import { ApprovalDecisionNotice } from "@/components/ApprovalDecisionNotice";

interface FileEdit {
  thread_id: string;
  display_path: string;
  before: string;
  after: string;
  change_kind?: string;
}

interface DiffLine {
  kind: "added" | "removed" | "context";
  text: string;
}

type FileDiffPanelState = {
  threadId: string;
  displayPath: string;
  selected: boolean;
  expanded: boolean;
  changeKindLabel: string | null;
  changeKindClass: string;
  showChangeKind: boolean;
  addedCount: number;
  removedCount: number;
  showAddedCount: boolean;
  showRemovedCount: boolean;
  toggleGlyph: string;
  containerClass: string;
  diffLineItems: Array<{ prefix: string; text: string; className: string }>;
};

const KIND_BADGE: Record<string, string> = {
  feat: "bg-emerald-500/15 text-emerald-300",
  fix: "bg-red-500/15 text-red-300",
  test: "bg-blue-500/15 text-blue-300",
  docs: "bg-violet-500/15 text-violet-300",
  refactor: "bg-amber-500/15 text-amber-300",
};

const KIND_LABELS: Record<string, string> = {
  feat: "New feature",
  fix: "Bug fix",
  test: "Tests",
  docs: "Documentation",
  refactor: "Refactor",
};

const MULTI_EDIT_DEFAULT_SUMMARY = "Multi-file change proposal";
const MULTI_EDIT_BADGE = "multi-file edit";
const MULTI_EDIT_PROPOSED_CHANGE = "Proposed change";
const MULTI_EDIT_SUMMARY_LABEL = "Summary";
const MULTI_EDIT_RAW_DIFF_LABEL = "Raw diff";
const MULTI_EDIT_SELECT_ALL = "Select all";
const MULTI_EDIT_DESELECT_ALL = "Deselect all";
const MULTI_EDIT_EXPAND_ALL = "Expand all";
const MULTI_EDIT_COLLAPSE_ALL = "Collapse all";
const MULTI_EDIT_APPLYING_PREFIX = "Applying...";
const MULTI_EDIT_LINE_NOTE = "Showing line-by-line comparison - reordered lines may appear as changes.";
const MULTI_EDIT_SEPARATOR = " Â· ";

function multiEditString(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function computeLineDiff(before: string, after: string): DiffLine[] {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const lines: DiffLine[] = [];
  const maxLength = Math.max(beforeLines.length, afterLines.length);

  for (let index = 0; index < maxLength; index++) {
    const beforeLine = beforeLines[index];
    const afterLine = afterLines[index];

    if (beforeLine === afterLine) {
      if (beforeLine !== undefined) lines.push({ kind: "context", text: beforeLine });
      continue;
    }

    if (beforeLine !== undefined) lines.push({ kind: "removed", text: beforeLine });
    if (afterLine !== undefined) lines.push({ kind: "added", text: afterLine });
  }

  return lines;
}

function addedCount(lines: DiffLine[]) {
  return lines.filter((line) => line.kind === "added").length;
}

function removedCount(lines: DiffLine[]) {
  return lines.filter((line) => line.kind === "removed").length;
}

function fileDiffPanelState(props: {
  edit: FileEdit;
  selected: boolean;
  expanded: boolean;
}): FileDiffPanelState {
  const diffLines = computeLineDiff(props.edit.before, props.edit.after);
  const added = addedCount(diffLines);
  const removed = removedCount(diffLines);
  const changeKind = props.edit.change_kind ?? null;

  return {
    threadId: props.edit.thread_id,
    displayPath: props.edit.display_path,
    selected: props.selected,
    expanded: props.expanded,
    changeKindLabel: changeKind ? KIND_LABELS[changeKind] ?? changeKind : null,
    changeKindClass: changeKind
      ? KIND_BADGE[changeKind] ?? "bg-white/10 text-on-surface-variant"
      : "bg-white/10 text-on-surface-variant",
    showChangeKind: Boolean(changeKind),
    addedCount: added,
    removedCount: removed,
    showAddedCount: added > 0,
    showRemovedCount: removed > 0,
    toggleGlyph: props.expanded ? "â–²" : "â–¼",
    containerClass: props.selected
      ? "rounded-xl border border-primary/30 bg-primary/5 transition"
      : "rounded-xl border border-white/10 bg-white/4 opacity-60 transition",
    diffLineItems: diffLines.map((line) => ({
      prefix: line.kind === "added" ? "+ " : line.kind === "removed" ? "- " : "  ",
      text: line.text,
      className:
        line.kind === "added"
          ? "bg-emerald-400/8 text-emerald-300"
          : line.kind === "removed"
            ? "bg-red-400/8 text-red-300"
            : "text-on-surface/50",
    })),
  };
}

function FileDiffPanel(props: {
  state: FileDiffPanelState;
  onToggle: () => void;
  onToggleExpanded: () => void;
}) {
  return (
    <div class={props.state.containerClass}>
      <div class="flex cursor-pointer items-center gap-3 px-4 py-3" onClick={props.onToggleExpanded}>
        <button
          type="button"
          class={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-[10px] transition ${
            props.state.selected
              ? "border-primary bg-primary text-white"
              : "border-white/30 bg-transparent text-transparent"
          }`}
          onClick={(event) => {
            event.stopPropagation();
            props.onToggle();
          }}
          aria-label={props.state.selected ? "Deselect file" : "Select file"}
        >
          âœ“
        </button>

        <span class="min-w-0 flex-1 break-all font-mono text-xs text-on-surface">{props.state.displayPath}</span>

        <Show when={props.state.showChangeKind}>
          <span
            class={`max-w-full break-words rounded-full px-2 py-1 font-mono text-[9px] uppercase ${props.state.changeKindClass}`}
            title={props.state.changeKindLabel ?? undefined}
          >
            {props.state.changeKindLabel}
          </span>
        </Show>

        <div class="flex items-center gap-1.5 text-[10px]">
          <Show when={props.state.showAddedCount}>
            <span class="text-emerald-400">+{props.state.addedCount}</span>
          </Show>
          <Show when={props.state.showRemovedCount}>
            <span class="text-red-400">-{props.state.removedCount}</span>
          </Show>
        </div>

        <span class="text-[10px] text-on-surface-variant/50">{props.state.toggleGlyph}</span>
      </div>

      <Show when={props.state.expanded}>
        <div class="border-t border-white/10">
          <pre class="max-h-64 overflow-auto bg-black/20 px-4 py-3 font-mono text-[11px] leading-5">
            <For each={props.state.diffLineItems}>
              {(line) => <div class={line.className}>{line.prefix}{line.text}</div>}
            </For>
          </pre>
          <p class="px-4 pb-2 font-mono text-[9px] text-on-surface-variant/40">{MULTI_EDIT_LINE_NOTE}</p>
        </div>
      </Show>
    </div>
  );
}

function parseFileEdit(value: unknown): FileEdit | null {
  if (!isRecord(value)) return null;
  const threadId = typeof value.thread_id === "string" ? value.thread_id : "";
  const displayPath = typeof value.display_path === "string" ? value.display_path : "";
  if (!threadId && !displayPath) return null;
  return {
    thread_id: threadId,
    display_path: displayPath,
    before: typeof value.before === "string" ? value.before : "",
    after: typeof value.after === "string" ? value.after : "",
    change_kind: typeof value.change_kind === "string" ? value.change_kind : undefined,
  };
}

export function MultiEditRenderer(props: { message: AfpMessage; view?: AfpView }) {
  const content = createMemo(() => afpRecord(decryptedDisplayContent(props.message)));
  const rawEdits = createMemo<FileEdit[]>(() => {
    const edits = content().edits;
    return Array.isArray(edits)
      ? edits.map(parseFileEdit).filter((edit): edit is FileEdit => Boolean(edit))
      : [];
  });

  const [selected, setSelected] = createSignal<Set<string>>(
    new Set(rawEdits().map((edit) => edit.thread_id)),
  );
  const [expandedFiles, setExpandedFiles] = createSignal<Set<string>>(
    new Set(rawEdits().length > 0 ? [rawEdits()[0].thread_id] : []),
  );
  const [status, setStatus] = createSignal<"idle" | "applying" | "applied" | "rejected">("idle");
  const [error, setError] = createSignal<ChangeProposalFailureReceipt | null>(null);
  const [applyProgress, setApplyProgress] = createSignal(0);
  const [applyTotal, setApplyTotal] = createSignal(0);

  const rendererState = createMemo(() => {
    const summary = multiEditString(content().summary, MULTI_EDIT_DEFAULT_SUMMARY);
    const correlationId = multiEditString(content().correlation_id);
    const selectedIds = selected();
    const expandedIds = expandedFiles();
    const editItems = rawEdits().map((edit) =>
      fileDiffPanelState({
        edit,
        selected: selectedIds.has(edit.thread_id),
        expanded: expandedIds.has(edit.thread_id),
      }),
    );
    const selectedCount = editItems.filter((item) => item.selected).length;
    const totalAdded = editItems
      .filter((item) => item.selected)
      .reduce((sum, item) => sum + item.addedCount, 0);
    const totalRemoved = editItems
      .filter((item) => item.selected)
      .reduce((sum, item) => sum + item.removedCount, 0);

    return {
      summary,
      correlationId,
      editItems,
      editCount: editItems.length,
      selectedCount,
      totalAdded,
      totalRemoved,
      showAddedSummary: totalAdded > 0,
      showRemovedSummary: totalRemoved > 0,
      selectionText: `${selectedCount} of ${editItems.length} files selected`,
      applying: status() === "applying",
      showActionBar: status() === "idle" || status() === "applying",
      applyButtonText:
        status() === "applying"
          ? `${MULTI_EDIT_APPLYING_PREFIX} (${applyProgress()} of ${applyTotal()})`
          : `Apply ${selectedCount > 0 ? `${selectedCount} ` : ""}edit${selectedCount !== 1 ? "s" : ""}`,
      canApply: selectedCount > 0 && status() !== "applying",
      showError: Boolean(error()),
      errorValue: error(),
      completionDetail:
        status() === "applied"
          ? `Applied ${selectedCount} file edit${selectedCount !== 1 ? "s" : ""}. Check the affected files to verify.`
          : null,
    };
  });

  function toggleFile(threadId: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  }

  function toggleExpanded(threadId: string) {
    setExpandedFiles((previous) => {
      const next = new Set(previous);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  }

  function selectAllFiles() {
    setSelected(new Set<string>(rawEdits().map((edit) => edit.thread_id)));
  }

  function deselectAllFiles() {
    setSelected(new Set<string>());
  }

  function expandAllFiles() {
    setExpandedFiles(new Set<string>(rawEdits().map((edit) => edit.thread_id)));
  }

  function collapseAllFiles() {
    setExpandedFiles(new Set<string>());
  }

  async function applyEdits() {
    const editsToApply = rawEdits().filter((edit) => selected().has(edit.thread_id));
    setApplyTotal(editsToApply.length);
    setApplyProgress(0);
    setStatus("applying");
    setError(null);

    try {
      for (let index = 0; index < editsToApply.length; index++) {
        setApplyProgress(index + 1);
        await applyMultiEdit<FileEdit>({
          correlation_id: rendererState().correlationId || undefined,
          edits: [editsToApply[index]],
          source_message_id: props.message.id,
        });
      }
      setStatus("applied");
    } catch (requestError) {
      setError(
        buildChangeProposalFailureReceipt(
          "Apply change set",
          requestError instanceof Error ? requestError.message : "Failed to apply coordinated edits.",
        ),
      );
      setStatus("idle");
    }
  }

  function rejectEdits() {
    setStatus("rejected");
  }

  return (
    <div class="space-y-4">
      <div class="space-y-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded-full border border-violet-400/30 bg-violet-400/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-violet-300">
            {MULTI_EDIT_BADGE}
          </span>
          <span class="text-[10px] text-on-surface-variant/50">
            {rendererState().editCount} file{rendererState().editCount !== 1 ? "s" : ""}
          </span>
          <div class="ml-1 flex items-center gap-1.5 text-[10px]">
            <Show when={rendererState().showAddedSummary}>
              <span class="text-emerald-400">+{rendererState().totalAdded}</span>
            </Show>
            <Show when={rendererState().showRemovedSummary}>
              <span class="text-red-400">-{rendererState().totalRemoved}</span>
            </Show>
          </div>
        </div>
        <p class="font-mono text-[9px] uppercase tracking-[0.18em] text-outline">
          {MULTI_EDIT_PROPOSED_CHANGE}
        </p>
        <p class="text-sm font-medium text-on-surface">{rendererState().summary}</p>
      </div>

      <div class="space-y-2">
        <div class="flex items-center justify-between text-xs text-on-surface-variant">
          <span>{rendererState().selectionText}</span>
          <div class="flex gap-3">
            <button type="button" class="hover:text-on-surface" onClick={selectAllFiles}>
              {MULTI_EDIT_SELECT_ALL}
            </button>
            <button type="button" class="hover:text-on-surface" onClick={deselectAllFiles}>
              {MULTI_EDIT_DESELECT_ALL}
            </button>
            <span class="text-on-surface-variant/30">{MULTI_EDIT_SEPARATOR}</span>
            <button type="button" class="hover:text-on-surface" onClick={expandAllFiles}>
              {MULTI_EDIT_EXPAND_ALL}
            </button>
            <button type="button" class="hover:text-on-surface" onClick={collapseAllFiles}>
              {MULTI_EDIT_COLLAPSE_ALL}
            </button>
          </div>
        </div>

        <For each={rendererState().editItems}>
          {(item) => (
            <FileDiffPanel
              state={item}
              onToggle={() => toggleFile(item.threadId)}
              onToggleExpanded={() => toggleExpanded(item.threadId)}
            />
          )}
        </For>
      </div>

      <Show
        when={rendererState().showActionBar}
        fallback={
          <ApprovalDecisionNotice
            decision={status() === "applied" ? "approved" : "rejected"}
            context="change_set"
            detail={rendererState().completionDetail}
            class="border-white/10 bg-white/5 text-on-surface"
            detailClass="text-on-surface-variant/70"
          />
        }
      >
        <div class="flex items-center gap-2">
          <ApprovalDecisionButtons
            class="flex gap-2"
            busy={rendererState().applying}
            approveDisabled={!rendererState().canApply}
            busyLabel={rendererState().applyButtonText}
            approveContext="change_set"
            approveClass="rounded-full bg-primary px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
            rejectClass="rounded-full border border-white/20 px-5 py-2 text-sm text-on-surface-variant hover:bg-white/10 disabled:opacity-50"
            onApprove={() => void applyEdits()}
            onReject={rejectEdits}
          />

          <Show when={rendererState().showError}>
            <div class="rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3">
              <p class="text-xs font-semibold text-red-200">{rendererState().errorValue?.title}</p>
              <p class="mt-1 text-xs text-red-100/85">{rendererState().errorValue?.summary}</p>
              <p class="mt-2 text-[11px] text-red-100/70">{rendererState().errorValue?.nextStep}</p>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
