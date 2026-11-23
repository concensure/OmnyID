// @locs-version: 1.0
import { Show, createMemo, createSignal } from "solid-js";
import { type ApprovalReviewLike, approvalRequestTitle } from "afp-ts/continuity";
import type { AfpMessage, AfpView } from "@/lib/api";
import { submitShellDecision } from "@/lib/api";
import { approvalReviewFromUnknown } from "@/lib/approvalReviewState";
import {
  buildApprovalCardFailureReceipt,
  type ApprovalCardFailureReceipt,
} from "@/lib/approvalCardFailureState";
import { ApprovalDecisionButtons } from "@/components/ApprovalDecisionButtons";
import { ApprovalDecisionNotice } from "@/components/ApprovalDecisionNotice";
import { ApprovalReviewSummary } from "@/components/ApprovalReviewSummary";
import { isRecord } from "@/lib/eventDetail";
import {
  SHELL_APPROVAL_CONTEXT,
  SHELL_BUSY_LABEL,
  SHELL_COMMAND_LABEL,
  SHELL_FULL_COMMAND_HIDE,
  SHELL_FULL_COMMAND_SHOW,
  SHELL_HEADER_TITLE,
  SHELL_NO_OUTPUT_LABEL,
  SHELL_REQUEST_ICON,
  SHELL_SAFE_BADGE,
  SHELL_SAFE_MODE_LABEL,
  SHELL_STDERR_LABEL,
  SHELL_STDOUT_LABEL,
  shellExitCodeNote,
} from "@/lib/shellCommandPresentation";
import { shellResultRendererState } from "@/lib/shellResultRendererState";

const SHELL_HEADER_CHIP_CLASS =
  "rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-on-surface-variant";
const SHELL_SAFE_MODE_CHIP_CLASS =
  "rounded-full bg-amber-500/15 px-2 py-0.5 font-mono text-[9px] text-amber-300";
const SHELL_REQUEST_WARNING_CLASS =
  "flex items-start gap-2.5 rounded-xl border border-amber-400/30 bg-amber-400/8 px-4 py-3";
const SHELL_REQUEST_TITLE_CLASS = "text-sm font-semibold text-amber-200";
const SHELL_REQUEST_REASON_CLASS = "text-xs text-on-surface-variant";
const SHELL_ERROR_CARD_CLASS = "rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3";
const SHELL_ERROR_TITLE_CLASS = "text-xs font-semibold text-red-200";
const SHELL_ERROR_SUMMARY_CLASS = "mt-1 text-xs text-red-100/85";
const SHELL_ERROR_NEXT_STEP_CLASS = "mt-2 text-[11px] text-red-100/70";
const SHELL_COMMAND_CARD_CLASS = "rounded-xl border border-white/15 bg-black/40 px-4 py-3 font-mono";
const SHELL_COMMAND_META_ROW_CLASS = "mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-on-surface-variant/70";
const SHELL_RESULT_CARD_CLASS = "space-y-2 overflow-hidden rounded-xl border border-white/15 bg-black/40";
const SHELL_TAB_BUTTON_BASE_CLASS = "border-b-2 pb-2 transition";

type ShellDecisionState = "pending" | "approving" | "approved" | "rejected";
type ShellOutputTab = "stdout" | "stderr";

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function formatDurationMs(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`;
  const minutes = Math.floor(durationMs / 60000);
  const seconds = ((durationMs % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

function shellRequestState(props: {
  command: string;
  workingDir?: string;
  timeout: number;
  safeMode: boolean;
  reason: string;
  approvalReview?: ApprovalReviewLike;
  decision: ShellDecisionState;
  error: ApprovalCardFailureReceipt | null;
}) {
  const review = props.approvalReview;
  const decisionValue: "approved" | "rejected" =
    props.decision === "approved" ? "approved" : "rejected";
  return {
    title: approvalRequestTitle(SHELL_APPROVAL_CONTEXT),
    reasonText: review?.reason ?? props.reason,
    showApprovalReview: Boolean(review),
    approvalReview: review,
    showWorkingDir: Boolean(props.workingDir),
    workingDir: props.workingDir ?? null,
    timeoutText: `${props.timeout}s`,
    safeModeLabel: props.safeMode ? "on" : "off",
    safeModeTitle: props.safeMode
      ? "Safe mode restricts the command to read-only operations."
      : "Safe mode is off - this command may write files or modify system state.",
    safeModeClass: props.safeMode ? "text-emerald-400" : "text-amber-400",
    showPendingDecision: props.decision === "pending" || props.decision === "approving",
    busy: props.decision === "approving",
    decision: decisionValue,
    showError: Boolean(props.error),
    error: props.error,
  };
}

function shellResultState(props: {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  safeMode: boolean;
  tab: ShellOutputTab;
  showFullCommand: boolean;
}) {
  const success = props.exitCode === 0;
  const hasStdout = Boolean(props.stdout);
  const hasStderr = Boolean(props.stderr);
  const showTabs = hasStdout && hasStderr;
  const showStdout = props.tab === "stdout" || !hasStderr;
  const showStderr = props.tab === "stderr" && hasStderr;
  const noteText = !success ? shellExitCodeNote(props.exitCode) : null;

  return {
    commandPreview: props.command,
    showCommandToggle: props.command.length > 60,
    commandToggleText: props.showFullCommand ? SHELL_FULL_COMMAND_HIDE : SHELL_FULL_COMMAND_SHOW,
    showFullCommand: props.showFullCommand,
    durationText: props.durationMs > 0 ? formatDurationMs(props.durationMs) : null,
    showDuration: props.durationMs > 0,
    showSafeMode: props.safeMode,
    exitCodeText: `exit ${props.exitCode}`,
    exitCodeClass: success
      ? "rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-mono font-semibold text-emerald-300"
      : "rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-mono font-semibold text-red-300",
    noteText,
    showNote: Boolean(noteText),
    showTabs,
    stdoutTabClass:
      props.tab === "stdout"
        ? `${SHELL_TAB_BUTTON_BASE_CLASS} mr-4 border-primary text-on-surface`
        : `${SHELL_TAB_BUTTON_BASE_CLASS} mr-4 border-transparent text-on-surface-variant hover:text-on-surface`,
    stderrTabClass:
      props.tab === "stderr"
        ? `${SHELL_TAB_BUTTON_BASE_CLASS} border-red-400 text-red-300`
        : `${SHELL_TAB_BUTTON_BASE_CLASS} border-transparent text-on-surface-variant hover:text-on-surface`,
    showStdout,
    showStderr,
    hasStdout,
    stdoutText: props.stdout,
    stderrText: props.stderr,
  };
}

function ShellRequestCard(props: {
  messageId: string;
  command: string;
  workingDir?: string;
  timeout: number;
  safeMode: boolean;
  reason: string;
  approvalReview?: ApprovalReviewLike;
}) {
  const [decision, setDecision] = createSignal<ShellDecisionState>("pending");
  const [error, setError] = createSignal<ApprovalCardFailureReceipt | null>(null);

  const cardState = createMemo(() =>
    shellRequestState({
      command: props.command,
      workingDir: props.workingDir,
      timeout: props.timeout,
      safeMode: props.safeMode,
      reason: props.reason,
      approvalReview: props.approvalReview,
      decision: decision(),
      error: error(),
    }),
  );

  async function decide(approved: boolean) {
    setDecision("approving");
    setError(null);
    try {
      await submitShellDecision({
        source_message_id: props.messageId,
        approved,
        command: props.command,
      });
      setDecision(approved ? "approved" : "rejected");
    } catch (requestError) {
      setError(
        buildApprovalCardFailureReceipt(
          approved ? "Approve shell command" : "Reject shell command",
          requestError instanceof Error ? requestError.message : "Shell command decision failed",
        ),
      );
      setDecision("pending");
    }
  }

  return (
    <div class="space-y-3">
      <div class={SHELL_REQUEST_WARNING_CLASS}>
        <span class="mt-0.5 text-base">{SHELL_REQUEST_ICON}</span>
        <div class="space-y-0.5">
          <p class={SHELL_REQUEST_TITLE_CLASS}>{cardState().title}</p>
          <p class={SHELL_REQUEST_REASON_CLASS}>{cardState().reasonText}</p>
        </div>
      </div>

      <Show when={cardState().showApprovalReview}>
        <ApprovalReviewSummary
          class="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
          titleClass="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/65"
          chipClass="rounded-full bg-white/10 px-2 py-0.5 text-on-surface-variant/80 normal-case tracking-normal"
          confidenceClass="rounded-full bg-amber-400/10 px-2 py-0.5 text-amber-200 normal-case tracking-normal"
          listClass="space-y-1 text-xs text-on-surface-variant"
          summaryClass="text-xs text-on-surface-variant"
          approvalReview={cardState().approvalReview!}
          autonomyDecision={cardState().approvalReview?.autonomy_decision}
          fallbackReason={props.reason}
        />
      </Show>

      <div class={SHELL_COMMAND_CARD_CLASS}>
        <p class="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/60">
          {SHELL_COMMAND_LABEL}
        </p>
        <pre class="overflow-auto whitespace-pre-wrap text-xs text-emerald-300">{props.command}</pre>
        <div class={SHELL_COMMAND_META_ROW_CLASS}>
          <Show when={cardState().showWorkingDir}>
            <span>
              dir: <span class="font-mono text-on-surface-variant">{cardState().workingDir}</span>
            </span>
          </Show>
          <span>timeout: {cardState().timeoutText}</span>
          <span class={cardState().safeModeClass} title={cardState().safeModeTitle}>
            safe-mode: {cardState().safeModeLabel}
          </span>
        </div>
      </div>

      <Show
        when={cardState().showPendingDecision}
        fallback={
          <ApprovalDecisionNotice
            decision={cardState().decision}
            context={SHELL_APPROVAL_CONTEXT}
            detail={props.command}
            class="border-0 bg-transparent px-0 py-0"
            detailClass="text-on-surface-variant/70"
          />
        }
      >
        <div class="flex items-center gap-2">
          <ApprovalDecisionButtons
            class="flex gap-2"
            busy={cardState().busy}
            busyLabel={SHELL_BUSY_LABEL}
            onApprove={() => decide(true)}
            onReject={() => decide(false)}
            approveClass="rounded-full bg-emerald-500 px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            rejectClass="rounded-full border border-red-400/30 bg-red-400/10 px-5 py-2 text-sm font-medium text-red-300 hover:bg-red-400/20 disabled:opacity-50"
          />
          <Show when={cardState().showError}>
            <div class={SHELL_ERROR_CARD_CLASS}>
              <p class={SHELL_ERROR_TITLE_CLASS}>{cardState().error?.title}</p>
              <p class={SHELL_ERROR_SUMMARY_CLASS}>{cardState().error?.summary}</p>
              <p class={SHELL_ERROR_NEXT_STEP_CLASS}>{cardState().error?.nextStep}</p>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}

function ShellResultPanel(props: {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  safeMode: boolean;
}) {
  const [tab, setTab] = createSignal<ShellOutputTab>(
    props.exitCode !== 0 && props.stderr ? "stderr" : "stdout",
  );
  const [showFullCommand, setShowFullCommand] = createSignal(false);

  const panelState = createMemo(() =>
    shellResultState({
      command: props.command,
      stdout: props.stdout,
      stderr: props.stderr,
      exitCode: props.exitCode,
      durationMs: props.durationMs,
      safeMode: props.safeMode,
      tab: tab(),
      showFullCommand: showFullCommand(),
    }),
  );

  return (
    <div class={SHELL_RESULT_CARD_CLASS}>
      <div class="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div class="flex min-w-0 items-center gap-2 font-mono">
          <span class="flex-shrink-0 text-xs text-emerald-400/80">$</span>
          <span
            class="max-w-[300px] truncate text-xs text-on-surface/80"
            title={panelState().commandPreview}
          >
            {panelState().commandPreview}
          </span>
          <Show when={panelState().showCommandToggle}>
            <button
              type="button"
              class="flex-shrink-0 text-[10px] text-on-surface-variant/50 transition hover:text-on-surface-variant"
              onClick={() => setShowFullCommand((value) => !value)}
            >
              {panelState().commandToggleText}
            </button>
          </Show>
        </div>
        <div class="flex items-center gap-2">
          <Show when={panelState().showDuration}>
            <span class="text-[10px] text-on-surface-variant/50">{panelState().durationText}</span>
          </Show>
          <Show when={panelState().showSafeMode}>
            <span class="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300">
              {SHELL_SAFE_BADGE}
            </span>
          </Show>
          <div class="flex flex-col items-end">
            <span class={panelState().exitCodeClass}>{panelState().exitCodeText}</span>
            <Show when={panelState().showNote}>
              <span class="mt-0.5 text-[9px] text-on-surface-variant/50">{panelState().noteText}</span>
            </Show>
          </div>
        </div>
      </div>

      <Show when={panelState().showFullCommand}>
        <pre class="whitespace-pre-wrap border-b border-white/10 px-4 pb-3 font-mono text-[11px] text-emerald-300/80">
          {props.command}
        </pre>
      </Show>

      <Show when={panelState().showTabs}>
        <div class="flex border-b border-white/10 px-4 text-xs">
          <button type="button" class={panelState().stdoutTabClass} onClick={() => setTab("stdout")}>
            {SHELL_STDOUT_LABEL}
          </button>
          <button type="button" class={panelState().stderrTabClass} onClick={() => setTab("stderr")}>
            {SHELL_STDERR_LABEL}
          </button>
        </div>
      </Show>

      <div class="px-4 pb-4">
        <Show when={panelState().showStdout}>
          <Show
            when={panelState().hasStdout}
            fallback={<p class="py-2 text-xs italic text-on-surface-variant/40">{SHELL_NO_OUTPUT_LABEL}</p>}
          >
            <pre class="max-h-72 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-on-surface/90">
              {panelState().stdoutText}
            </pre>
          </Show>
        </Show>
        <Show when={panelState().showStderr}>
          <pre class="max-h-72 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-red-300/80">
            {panelState().stderrText}
          </pre>
        </Show>
      </div>
    </div>
  );
}

export function ShellResultRenderer(props: { message: AfpMessage; view?: AfpView }) {
  const rendererState = createMemo(() => shellResultRendererState(props.message, props.view));

  return (
    <div class="space-y-3">
      <div class="flex items-center gap-2">
        <span class={SHELL_HEADER_CHIP_CLASS}>{SHELL_HEADER_TITLE}</span>
        <Show when={rendererState().safeMode}>
          <span class={SHELL_SAFE_MODE_CHIP_CLASS}>{SHELL_SAFE_MODE_LABEL}</span>
        </Show>
        <span class="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[9px] text-on-surface-variant">
          {rendererState().subtype}
        </span>
      </div>

      <Show when={rendererState().showRequest}>
        <ShellRequestCard
          messageId={props.message.id}
          command={rendererState().command}
          workingDir={rendererState().workingDir}
          timeout={rendererState().timeout}
          safeMode={rendererState().safeMode}
          reason={rendererState().reason}
          approvalReview={rendererState().approvalReview}
        />
      </Show>

      <Show when={rendererState().showDecision}>
        <ApprovalDecisionNotice
          decision={rendererState().approved ? "approved" : "rejected"}
          context={SHELL_APPROVAL_CONTEXT}
          detail={rendererState().command}
        />
      </Show>

      <Show when={rendererState().showResult}>
        <ShellResultPanel
          command={rendererState().command}
          stdout={rendererState().stdout}
          stderr={rendererState().stderr}
          exitCode={rendererState().exitCode}
          durationMs={rendererState().durationMs}
          safeMode={rendererState().safeMode}
        />
      </Show>
    </div>
  );
}
