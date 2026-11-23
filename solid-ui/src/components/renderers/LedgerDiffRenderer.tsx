// @locs-version: 1.0
import { For, Show, createMemo, createSignal } from "solid-js";
import type { AfpMessage, AfpView } from "@/lib/api";
import { applyTaskDiff } from "@/lib/api";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import { isRecord } from "@/lib/eventDetail";
import {
  buildChangeProposalFailureReceipt,
  type ChangeProposalFailureReceipt,
} from "@/lib/changeProposalFailureState";
import { ApprovalDecisionButtons } from "@/components/ApprovalDecisionButtons";
import { ApprovalDecisionNotice } from "@/components/ApprovalDecisionNotice";

interface DiffLine {
  kind: "added" | "removed" | "context";
  text: string;
}

interface FieldChange {
  field: string;
  before: string;
  after: string;
}

const LEDGER_PROPOSAL_LABEL = "proposed change";
const LEDGER_AGENT_VIEW_LABEL = "agent view";
const LEDGER_SUMMARY_LABEL = "Summary";
const LEDGER_RAW_DIFF_LABEL = "Raw diff";
const LEDGER_NO_STRUCTURED_FIELDS = "No structured field changes detected.";
const LEDGER_LINE_SEPARATOR = " - ";
const LEDGER_EMPTY_FIELD_VALUE = "-";

function prettyValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function ledgerDiffString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function ledgerDiffBoolean(value: unknown): boolean {
  return typeof value === "boolean" ? value : false;
}

function computeDiff(before: string, after: string): DiffLine[] {
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

function extractChanges(before: unknown, after: unknown): FieldChange[] {
  if (!isRecord(before) || !isRecord(after)) return [];
  const beforeRecord = before;
  const afterRecord = after;
  const fields = new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]);
  const changes: FieldChange[] = [];

  for (const field of fields) {
    const beforeValue = prettyValue(beforeRecord[field] ?? LEDGER_EMPTY_FIELD_VALUE);
    const afterValue = prettyValue(afterRecord[field] ?? LEDGER_EMPTY_FIELD_VALUE);
    if (beforeValue !== afterValue) {
      changes.push({ field, before: beforeValue, after: afterValue });
    }
  }

  return changes;
}

export function LedgerDiffRenderer(props: { message: AfpMessage; view?: AfpView }) {
  const [manualView, setManualView] = createSignal<"summary" | "raw" | null>(null);
  const [status, setStatus] = createSignal<"idle" | "applying" | "applied" | "rejected">("idle");
  const [error, setError] = createSignal<ChangeProposalFailureReceipt | null>(null);

  const rendererState = createMemo(() => {
    const safeMessageContent = decryptedDisplayContent(props.message);
    const content = afpRecord(
      props.message.encryption ? safeMessageContent : props.view?.content ?? safeMessageContent,
    );
    const taskId = ledgerDiffString(content.task_id);
    const reason = ledgerDiffString(content.reason);
    const agentMade = ledgerDiffBoolean(content.agent_authored);
    const beforeValue = content.before ?? {};
    const afterValue = content.after ?? {};
    const beforeText = prettyValue(beforeValue);
    const afterText = prettyValue(afterValue);
    const fieldChanges = extractChanges(beforeValue, afterValue);
    const diffLines = computeDiff(beforeText, afterText);
    const hasMeaningfulDiff = diffLines.some((line) => line.kind !== "context");
    const activeView =
      manualView() ?? (fieldChanges.length === 0 && hasMeaningfulDiff ? "raw" : "summary");
    const diffOverflows = diffLines.length > 20;
    const fieldChangeItems = fieldChanges.map((change) => ({
      fieldLabel: titleCase(change.field),
      beforeText: change.before,
      afterText: change.after,
    }));
    const diffLineItems = diffLines.map((line) => ({
      prefix: line.kind === "added" ? "+ " : line.kind === "removed" ? "- " : "  ",
      text: line.text,
      className:
        line.kind === "added"
          ? "bg-emerald-400/8 text-emerald-300"
          : line.kind === "removed"
            ? "bg-red-400/8 text-red-300"
            : "text-on-surface/60",
    }));

    return {
      taskId,
      reason,
      agentMade,
      activeView,
      fieldChangeItems,
      showFieldChanges: fieldChangeItems.length > 0,
      diffLineItems,
      diffLineCount: diffLineItems.length,
      diffCountText: diffOverflows
        ? `${diffLineItems.length} lines - scroll to see all`
        : `${diffLineItems.length} line${diffLineItems.length !== 1 ? "s" : ""}`,
      applySummary:
        status() === "applied"
          ? taskId
            ? `Changes applied to task ${taskId}.`
            : null
          : taskId
            ? `Task ${taskId} was left unchanged.`
            : null,
      showActionBar: status() === "idle" || status() === "applying",
      applying: status() === "applying",
      errorValue: error(),
      showError: Boolean(error()),
    };
  });

  async function applyDiff() {
    const safeMessageContent = decryptedDisplayContent(props.message);
    const content = afpRecord(
      props.message.encryption ? safeMessageContent : props.view?.content ?? safeMessageContent,
    );
    setStatus("applying");
    setError(null);
    try {
      await applyTaskDiff({
        task_id: rendererState().taskId || undefined,
        after: isRecord(content.after) ? content.after : {},
        source_message_id: props.message.id,
      });
      setStatus("applied");
    } catch (requestError) {
      setError(
        buildChangeProposalFailureReceipt(
          "Apply proposed change",
          requestError instanceof Error ? requestError.message : "Failed to apply change proposal.",
        ),
      );
      setStatus("idle");
    }
  }

  function rejectDiff() {
    setStatus("rejected");
  }

  return (
    <div class="space-y-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="space-y-0.5">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <span
              class="max-w-full rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-amber-300 break-words"
              title={rendererState().taskId ? `Task ID: ${rendererState().taskId}` : undefined}
            >
              {LEDGER_PROPOSAL_LABEL}
            </span>
            <Show when={rendererState().agentMade}>
              <span class="max-w-full rounded-full bg-primary/10 px-2 py-1 font-mono text-[10px] text-primary break-words">
                {LEDGER_AGENT_VIEW_LABEL}
              </span>
            </Show>
          </div>
          <Show when={rendererState().reason}>
            <p class="mt-1 break-words text-sm text-on-surface-variant">{rendererState().reason}</p>
          </Show>
        </div>

        <div class="flex min-w-0 flex-wrap overflow-hidden rounded-full border border-white/20 text-xs">
          <button
            type="button"
            class={`px-3 py-1 transition ${
              rendererState().activeView === "summary"
                ? "bg-white/20 text-on-surface"
                : "text-on-surface-variant hover:bg-white/10"
            }`}
            onClick={() => setManualView("summary")}
          >
            {LEDGER_SUMMARY_LABEL}
          </button>
          <button
            type="button"
            class={`px-3 py-1 transition ${
              rendererState().activeView === "raw"
                ? "bg-white/20 text-on-surface"
                : "text-on-surface-variant hover:bg-white/10"
            }`}
            onClick={() => setManualView("raw")}
          >
            {LEDGER_RAW_DIFF_LABEL}
          </button>
        </div>
      </div>

      <Show when={rendererState().activeView === "summary"}>
        <Show
          when={rendererState().showFieldChanges}
          fallback={<p class="text-xs italic text-on-surface-variant/60">{LEDGER_NO_STRUCTURED_FIELDS}</p>}
        >
          <div class="overflow-x-auto rounded-xl border border-white/15">
            <table class="min-w-full text-left text-xs">
              <thead>
                <tr class="border-b border-white/10 bg-white/5">
                  <th class="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/70">
                    Field
                  </th>
                  <th class="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-red-400/70">
                    Before
                  </th>
                  <th class="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-400/70">
                    After
                  </th>
                </tr>
              </thead>
              <tbody>
                <For each={rendererState().fieldChangeItems}>
                  {(change) => (
                    <tr class="border-t border-white/8">
                      <td class="px-3 py-2 font-mono text-[11px] text-on-surface-variant break-words">
                        {change.fieldLabel}
                      </td>
                      <td class="px-3 py-2 align-top">
                        <span class="inline-block max-w-full rounded bg-red-400/10 px-1.5 py-1 text-[11px] text-red-300 line-through break-words">
                          {change.beforeText}
                        </span>
                      </td>
                      <td class="px-3 py-2 align-top">
                        <span class="inline-block max-w-full rounded bg-emerald-400/10 px-1.5 py-1 text-[11px] text-emerald-300 break-words">
                          {change.afterText}
                        </span>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>

      <Show when={rendererState().activeView === "raw"}>
        <div>
          <pre class="max-h-72 overflow-auto rounded-xl border border-white/15 bg-black/30 px-4 py-3 font-mono text-[11px] leading-5">
            <For each={rendererState().diffLineItems}>
              {(line) => <div class={line.className}>{line.prefix}{line.text}</div>}
            </For>
          </pre>
          <p class="mt-1 font-mono text-[9px] text-on-surface-variant/40">{rendererState().diffCountText}</p>
        </div>
      </Show>

      <Show
        when={rendererState().showActionBar}
        fallback={
          <ApprovalDecisionNotice
            decision={status() === "applied" ? "approved" : "rejected"}
            context="change_proposal"
            detail={rendererState().applySummary}
            class="border-white/10 bg-white/5 text-on-surface"
            detailClass="text-on-surface-variant/70"
          />
        }
      >
        <div class="flex items-center gap-2">
          <ApprovalDecisionButtons
            class="flex gap-2"
            busy={rendererState().applying}
            busyLabel="Applying..."
            approveContext="change_proposal"
            approveClass="rounded-full bg-emerald-500 px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            rejectClass="rounded-full border border-white/20 px-5 py-2 text-sm text-on-surface-variant hover:bg-white/10 disabled:opacity-50"
            onApprove={() => void applyDiff()}
            onReject={rejectDiff}
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
