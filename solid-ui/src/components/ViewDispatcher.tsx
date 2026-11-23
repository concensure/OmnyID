import { ErrorBoundary, Show, Suspense, lazy } from "solid-js";
import type { AfpMessage, AfpView } from "@/lib/api";
import { navigateToView } from "@/lib/decisionosNavigation";
import { resolveViewDispatcherRouting } from "@/lib/viewDispatcherRouting";
import { decryptedDisplayLabel } from "@/lib/decryptedDisplayState";
import { InboxRenderer } from "@/components/renderers/InboxRenderer";
import { CanvasRenderer } from "@/components/renderers/CanvasRenderer";
import { TableRenderer } from "@/components/renderers/TableRenderer";
import { CalendarRenderer } from "@/components/renderers/CalendarRenderer";
import { AttachmentsRenderer } from "@/components/renderers/AttachmentsRenderer";
import { ApprovalsRenderer } from "@/components/renderers/ApprovalsRenderer";
import { SearchResultRenderer } from "@/components/renderers/SearchResultRenderer";
import { TaskCardRenderer } from "@/components/renderers/TaskCardRenderer";
import { GenerativeCardRenderer } from "@/components/renderers/GenerativeCardRenderer";
import { BlueprintRenderer } from "@/components/renderers/BlueprintRenderer";
import { A2UIRenderer } from "@/components/renderers/A2UIRenderer";
import { PresentationCardRenderer } from "@/components/renderers/PresentationCardRenderer";
import { ProactiveSuggestionRenderer } from "@/components/renderers/ProactiveSuggestionRenderer";
import { RichTextRenderer } from "@/components/renderers/RichTextRenderer";
import { LedgerDiffRenderer } from "@/components/renderers/LedgerDiffRenderer";
import { InboxCanvasRenderer } from "@/components/renderers/InboxCanvasRenderer";
const LazyLedgerBoardRenderer = lazy(() =>
  import("@/components/renderers/LedgerBoardRenderer").then((m) => ({ default: m.LedgerBoardRenderer })),
);
const LazyMultiEditRenderer = lazy(() =>
  import("@/components/renderers/MultiEditRenderer").then((m) => ({ default: m.MultiEditRenderer })),
);
const LazyShellResultRenderer = lazy(() =>
  import("@/components/renderers/ShellResultRenderer").then((m) => ({ default: m.ShellResultRenderer })),
);
const LazyPlanningCardRenderer = lazy(() =>
  import("@/components/renderers/PlanningCardRenderer").then((m) => ({ default: m.PlanningCardRenderer })),
);
const LazyExportRequestRenderer = lazy(() =>
  import("@/components/renderers/ExportRenderer").then((m) => ({ default: m.ExportRequestRenderer })),
);
const LazyExportResultRenderer = lazy(() =>
  import("@/components/renderers/ExportRenderer").then((m) => ({ default: m.ExportResultRenderer })),
);
const LazyThreadDashboardRenderer = lazy(() =>
  import("@/components/renderers/ThreadDashboardRenderer").then((m) => ({ default: m.ThreadDashboardRenderer })),
);
const LazyParsedDocumentRenderer = lazy(() =>
  import("@/components/renderers/ParsedDocumentRenderer").then((m) => ({ default: m.ParsedDocumentRenderer })),
);
const LazyTranscriptRenderer = lazy(() =>
  import("@/components/renderers/TranscriptRenderer").then((m) => ({ default: m.TranscriptRenderer })),
);
const LazySupertagGridRendererLite = lazy(() =>
  import("@/components/renderers/SupertagGridRendererLite").then((m) => ({ default: m.SupertagGridRenderer })),
);

/**
 * The agent-first renderer registry.
 *
 * Every AFP message carries a `views` array where each entry has a `format`
 * string. ViewDispatcher picks the highest-priority known format and hands the
 * message to the correct renderer. If no view hint is present it falls back to
 * a heuristic based on the message `type`, then to a generic card.
 *
 * Agents change what the workspace shows by writing a different `views` entry
 * into an AFP message — no UI code changes required.
 */
export function ViewDispatcher(props: {
  message: AfpMessage;
  viewOverride?: AfpView;
  compact?: boolean;
  /** card_section_update messages belonging to this card (for generative_card format) */
  cardUpdates?: AfpMessage[];
  /** task update messages belonging to this ledger board */
  taskUpdates?: AfpMessage[];
  onDecision?: (cardId: string, dpId: string, optionId: string) => void;
  /** Called by ui_presentation cards when user clicks "View workflow →" */
  onViewWorkflow?: () => void;
}) {
  const routing = () => resolveViewDispatcherRouting(props.message, props.viewOverride);
  const chosenView = () => routing().chosenView ?? undefined;
  const proactiveSourceReference = () =>
    props.message.references?.find((reference) => {
      if (reference.type !== "message") return false;
      const metadata =
        reference.metadata && typeof reference.metadata === "object" && !Array.isArray(reference.metadata)
          ? reference.metadata
          : null;
      return metadata?.relation === "proactive_source";
    }) ?? null;
  const proactiveSourceThreadId = () => {
    const metadata = proactiveSourceReference()?.metadata;
    return metadata && typeof metadata["thread_id"] === "string" ? metadata["thread_id"] : null;
  };
  const proactiveSourceMessageId = () => proactiveSourceReference()?.target ?? null;

  const effectiveFormat = () => routing().effectiveFormat;

  return (
    <ErrorBoundary fallback={(err, reset) => (
      <RendererErrorFallback error={err} compact={props.compact} onReset={reset} />
    )}>
    <article class="glass-surface rounded-xl border border-white/35 p-5 shadow-panel">
      <Show when={!props.compact}>
        <FormatBadge format={effectiveFormat()} agentDriven={routing().agentDriven} />
      </Show>

      <Show when={proactiveSourceReference()}>
        <div class={props.compact ? "mt-2" : "mt-3"}>
          <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-300/20 bg-sky-400/10 px-3 py-2">
            <p class="text-xs leading-5 text-sky-50">
              Promoted from a proactive suggestion.
            </p>
            <Show when={proactiveSourceThreadId() && proactiveSourceMessageId()}>
              <button
                type="button"
                onClick={() =>
                  navigateToView("threads", {
                    threadId: proactiveSourceThreadId() ?? undefined,
                    messageId: proactiveSourceMessageId() ?? undefined,
                  })
                }
                class="rounded-full border border-sky-300/20 bg-sky-400/12 px-3 py-1.5 text-[11px] font-medium text-sky-50 transition hover:bg-sky-400/20"
              >
                Open source suggestion
              </button>
            </Show>
          </div>
        </div>
      </Show>

      <div class={props.compact ? "" : "mt-3"}>
        <Show when={effectiveFormat() === "encrypted_placeholder"}>
          <EncryptedMessagePlaceholder message={props.message} compact={props.compact} />
        </Show>
        <Show when={effectiveFormat() === "email"}>
          <InboxRenderer message={props.message} />
        </Show>
        <Show when={effectiveFormat() === "canvas"}>
          <CanvasRenderer message={props.message} view={chosenView() ?? undefined} />
        </Show>
        <Show when={effectiveFormat() === "table"}>
          <TableRenderer message={props.message} view={chosenView() ?? undefined} />
        </Show>
        <Show when={effectiveFormat() === "calendar"}>
          <CalendarRenderer message={props.message} view={chosenView() ?? undefined} />
        </Show>
        <Show when={effectiveFormat() === "attachments"}>
          <AttachmentsRenderer message={props.message} />
        </Show>
        <Show when={effectiveFormat() === "approvals"}>
          <ApprovalsRenderer message={props.message} view={chosenView() ?? undefined} />
        </Show>
        <Show when={effectiveFormat() === "search_result"}>
          <SearchResultRenderer message={props.message} view={chosenView() ?? undefined} />
        </Show>
        <Show when={effectiveFormat() === "task_card"}>
          <TaskCardRenderer message={props.message} view={chosenView() ?? undefined} />
        </Show>
        <Show when={effectiveFormat() === "ledger_diff"}>
          <LedgerDiffRenderer message={props.message} view={chosenView() ?? undefined} />
        </Show>
        <Show when={effectiveFormat() === "ledger_board"}>
          <Suspense fallback={<RendererFallback label="board" compact={props.compact} />}>
            <LazyLedgerBoardRenderer message={props.message} tasks={props.taskUpdates} />
          </Suspense>
        </Show>
        <Show when={effectiveFormat() === "multi_edit"}>
          <Suspense fallback={<RendererFallback label="batch editor" compact={props.compact} />}>
            <LazyMultiEditRenderer message={props.message} view={chosenView() ?? undefined} />
          </Suspense>
        </Show>
        <Show when={effectiveFormat() === "shell_result"}>
          <Suspense fallback={<RendererFallback label="shell result" compact={props.compact} />}>
            <LazyShellResultRenderer message={props.message} view={chosenView() ?? undefined} />
          </Suspense>
        </Show>
        <Show when={effectiveFormat() === "planning_result"}>
          <Suspense fallback={<RendererFallback label="plan" compact={props.compact} />}>
            <LazyPlanningCardRenderer message={props.message} view={chosenView() ?? undefined} />
          </Suspense>
        </Show>
        <Show when={effectiveFormat() === "export_request"}>
          <Suspense fallback={<RendererFallback label="export request" compact={props.compact} />}>
            <LazyExportRequestRenderer message={props.message} />
          </Suspense>
        </Show>
        <Show when={effectiveFormat() === "export_result"}>
          <Suspense fallback={<RendererFallback label="export result" compact={props.compact} />}>
            <LazyExportResultRenderer message={props.message} />
          </Suspense>
        </Show>
        <Show when={effectiveFormat() === "proactive_suggestion"}>
          <ProactiveSuggestionRenderer message={props.message} />
        </Show>
        <Show when={effectiveFormat() === "generative_card"}>
          <GenerativeCardRenderer
            message={props.message}
            updates={props.cardUpdates ?? []}
            onDecision={props.onDecision}
          />
        </Show>
        <Show when={effectiveFormat() === "a2ui.v1"}>
          <A2UIRenderer message={props.message} view={chosenView() ?? undefined} />
        </Show>
        <Show when={effectiveFormat() === "ui_presentation"}>
          <PresentationCardRenderer
            message={props.message}
            view={chosenView() ?? undefined}
            onViewWorkflow={props.onViewWorkflow}
          />
        </Show>
        <Show when={effectiveFormat() === "rich_text"}>
          <RichTextRenderer message={props.message} view={chosenView() ?? undefined} />
        </Show>
        <Show when={effectiveFormat() === "inbox_canvas"}>
          <InboxCanvasRenderer message={props.message} />
        </Show>
        <Show when={effectiveFormat() === "inbox_thread_dashboard"}>
          <Suspense fallback={<RendererFallback label="thread dashboard" compact={props.compact} />}>
            <LazyThreadDashboardRenderer message={props.message} />
          </Suspense>
        </Show>
        <Show when={effectiveFormat() === "parsed_document"}>
          <Suspense fallback={<RendererFallback label="document" compact={props.compact} />}>
            <LazyParsedDocumentRenderer message={props.message} view={chosenView() ?? undefined} />
          </Suspense>
        </Show>
        <Show when={effectiveFormat() === "transcript"}>
          <Suspense fallback={<RendererFallback label="transcript" compact={props.compact} />}>
            <LazyTranscriptRenderer message={props.message} view={chosenView() ?? undefined} />
          </Suspense>
        </Show>
        <Show when={effectiveFormat() === "supertag_grid"}>
          <Suspense fallback={<RendererFallback label="grid" compact={props.compact} />}>
            <LazySupertagGridRendererLite message={props.message} />
          </Suspense>
        </Show>
        <Show when={effectiveFormat() === "ui_blueprint" || effectiveFormat() === "blueprint"}>
          <BlueprintRenderer message={props.message} view={chosenView() ?? undefined} />
        </Show>
      </div>
    </article>
    </ErrorBoundary>
  );
}

function RendererErrorFallback(props: { error: unknown; compact?: boolean; onReset: () => void }) {
  const errorMessage = () => props.error instanceof Error ? props.error.message : String(props.error);
  return (
    <article
      class={
        props.compact
          ? "rounded-xl border border-amber-300/25 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-950"
          : "glass-surface rounded-xl border border-amber-300/35 bg-amber-50/85 p-5 text-sm text-amber-950 shadow-panel"
      }
    >
      <p class="font-semibold">This result could not render.</p>
      <p class={props.compact ? "mt-1 leading-4" : "mt-2 leading-6"}>
        The workspace kept the card contained so the rest of the page can continue working.
      </p>
      <p class={props.compact ? "mt-1 font-mono text-[10px] opacity-75" : "mt-3 rounded-xl border border-amber-200/70 bg-white/65 px-3 py-2 font-mono text-xs text-amber-900"}>
        {errorMessage()}
      </p>
      <button
        type="button"
        class={props.compact
          ? "mt-2 rounded-full border border-amber-400/40 px-2 py-1 text-[10px] font-semibold"
          : "mt-4 rounded-full border border-amber-400/50 px-4 py-2 text-xs font-semibold transition hover:bg-amber-100"}
        onClick={props.onReset}
      >
        Try rendering again
      </button>
    </article>
  );
}

function RendererFallback(props: { label: string; compact?: boolean }) {
  return (
    <div
      class={
        props.compact
          ? "rounded-xl border border-white/15 bg-white/6 px-3 py-2 text-[11px] text-white/65"
          : "rounded-xl border border-white/15 bg-white/6 px-4 py-3 text-xs text-white/65"
      }
    >
      Loading {props.label}...
    </div>
  );
}

function EncryptedMessagePlaceholder(props: { message: AfpMessage; compact?: boolean }) {
  const label = () => decryptedDisplayLabel(props.message) ?? "Encrypted message - decrypting on this device";
  return (
    <div
      class={
        props.compact
          ? "rounded-xl border border-emerald-200/20 bg-emerald-400/10 px-3 py-2 text-[11px] text-emerald-50"
          : "rounded-xl border border-emerald-200/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-50"
      }
    >
      <p class="font-semibold">Encrypted</p>
      <p class="mt-1 text-xs opacity-80">{label()}</p>
    </div>
  );
}

function FormatBadge(props: { format: string; agentDriven: boolean }) {
  const label = () => {
    const map: Record<string, string> = {
      email: "Inbox",
      canvas: "Canvas",
      table: "Table",
      calendar: "Calendar",
      attachments: "Attachments",
      approvals: "Approval",
      search_result: "Research",
      task_card: "Task",
      proactive_suggestion: "Suggestion",
      generative_card: "Agent",
      "a2ui.v1": "A2UI",
      ledger_diff: "Diff",
      ledger_board: "Board",
      multi_edit: "Batch Edit",
      shell_result: "Shell",
      planning_result: "Plan",
      export_request: "Export",
      export_result: "Export",
      rich_text: "Note",
      inbox_canvas: "Inbox Canvas",
      inbox_thread_dashboard: "Thread Dashboard",
      parsed_document: "Document",
      transcript: "Transcript",
      supertag_grid: "Grid",
      ui_blueprint: "Blueprint",
      blueprint: "Blueprint",
      ui_presentation: "Presentation",
      encrypted_placeholder: "Encrypted",
    };
    return map[props.format] ?? props.format;
  };

  return (
    <div class="flex items-center gap-2">
      <span class="rounded-full bg-white/65 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-on-surface/80">
        {label()}
      </span>
      <Show when={props.agentDriven}>
        <span class="rounded-full bg-primary-fixed/50 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-primary">
          agent view
        </span>
      </Show>
    </div>
  );
}
