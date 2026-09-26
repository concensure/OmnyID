// @locs-version: 1.0
import { For, Show, createMemo, createSignal } from "solid-js";
import type { AfpMessage } from "@/lib/api";
import { generateExportFile, safeHref } from "@/lib/api";
import type { WorkflowFamilyContext } from "@/lib/workflowReviewTypes";
import { parseWorkflowFamilyContext } from "@/lib/workflowFamilyContext";
import {
  buildApprovalCardFailureReceipt,
  type ApprovalCardFailureReceipt,
} from "@/lib/approvalCardFailureState";
import { formatBytes } from "@/lib/format";
import { ApprovalDecisionNotice } from "@/components/ApprovalDecisionNotice";
import { ApprovalDecisionButtons } from "@/components/ApprovalDecisionButtons";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";

type ExportState = "idle" | "approving" | "done" | "error" | "rejected";

type ExportRequestContent = {
  format?: string;
  filename?: string;
  columns?: string[];
  rows?: string[][];
  summary?: string;
};

type ExportResultContent = {
  filename?: string;
  format?: string;
  size_bytes?: number;
  download_url?: string;
  data?: string;
  mime_type?: string;
  summary?: string;
  workflow_family_context?: unknown;
};

const EXPORT_ICON = "ðŸ“Š";
const EXPORT_READY_ICON = "âœ…";
const EXPORT_REQUEST_TITLE = "Export request";
const EXPORT_READY_TITLE = "Export ready";
const EXPORT_AUTOMATION_TITLE = "From automation";
const EXPORT_DOWNLOAD_LABEL = "Download";
const EXPORT_GENERATING_LABEL = "Generating file...";
const EXPORT_DEFAULT_FILENAME = "export";
const EXPORT_DEFAULT_FORMAT = "csv";
const EXPORT_APPROVE_CONTEXT = "export_generation";

const EXPORT_REQUEST_FORMAT_BADGE_CLASS =
  "ml-2 max-w-full break-words rounded-full border border-primary/25 bg-primary/8 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-primary/80";
const EXPORT_META_ROW_CLASS = "mt-2 flex flex-wrap gap-3 text-[11px] text-on-surface-variant";
const EXPORT_META_VALUE_CLASS = "text-on-surface";
const EXPORT_COLUMN_ROW_CLASS = "mt-1.5 flex flex-wrap items-center gap-1";
const EXPORT_COLUMN_LABEL_CLASS = "mr-0.5 text-[11px] text-on-surface-variant";
const EXPORT_COLUMN_CHIP_CLASS =
  "max-w-full break-words rounded-full border border-white/15 bg-white/8 px-2 py-1 font-mono text-[9px] text-on-surface";
const EXPORT_EXTRA_COLUMN_CHIP_CLASS =
  "max-w-full break-words rounded-full border border-white/15 bg-white/10 px-2 py-1 font-mono text-[9px] text-on-surface-variant";
const EXPORT_APPROVING_TEXT_CLASS =
  "animate-pulse font-mono text-[9px] uppercase tracking-wider text-primary";
const EXPORT_ERROR_CARD_CLASS = "rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3";
const EXPORT_ERROR_TITLE_CLASS = "text-xs font-semibold text-red-200";
const EXPORT_ERROR_SUMMARY_CLASS = "mt-1 text-xs text-red-100/85";
const EXPORT_ERROR_NEXT_STEP_CLASS = "mt-2 text-[11px] text-red-100/70";
const EXPORT_DOWNLOAD_CARD_CLASS =
  "flex min-w-0 flex-col items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 sm:flex-row sm:items-center";
const EXPORT_DOWNLOAD_BUTTON_CLASS =
  "w-full rounded-full bg-primary px-3 py-2 text-center text-xs font-medium text-white transition hover:bg-primary/80 sm:w-auto sm:py-1.5";
const EXPORT_DOWNLOAD_FORMAT_BADGE_CLASS =
  "max-w-full break-words rounded-full border border-white/20 bg-white/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.15em] text-on-surface-variant";
const EXPORT_WORKFLOW_CARD_CLASS = "rounded-xl border border-primary/20 bg-primary/6 px-4 py-3";
const EXPORT_WORKFLOW_TITLE_CLASS =
  "text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80";
const EXPORT_WORKFLOW_META_ROW_CLASS = "mt-2 flex flex-wrap gap-2 text-[11px] text-on-surface-variant";
const EXPORT_WORKFLOW_META_VALUE_CLASS = "text-on-surface";
const EXPORT_WORKFLOW_VALUE_ROW_CLASS = "mt-2 flex flex-wrap gap-2";
const EXPORT_WORKFLOW_VALUE_CHIP_CLASS =
  "rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] text-on-surface";

function exportString(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function exportOptionalString(value: unknown): string | undefined {
  const normalized = exportString(value);
  return normalized || undefined;
}

function exportStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => exportOptionalString(entry)).filter((entry): entry is string => Boolean(entry))
    : [];
}

function exportRows(value: unknown): string[][] {
  return Array.isArray(value)
    ? value
      .filter(Array.isArray)
      .map((row) => row.map((cell) => exportString(cell)))
    : [];
}

function exportFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeExportRequestContent(value: unknown): ExportRequestContent {
  const record = afpRecord(value);
  return {
    format: exportOptionalString(record["format"]),
    filename: exportOptionalString(record["filename"]),
    columns: exportStringArray(record["columns"]),
    rows: exportRows(record["rows"]),
    summary: exportOptionalString(record["summary"]),
  };
}

function normalizeExportResultContent(value: unknown): ExportResultContent {
  const record = afpRecord(value);
  return {
    filename: exportOptionalString(record["filename"]),
    format: exportOptionalString(record["format"]),
    size_bytes: exportFiniteNumber(record["size_bytes"]),
    download_url: exportOptionalString(record["download_url"]),
    data: exportOptionalString(record["data"]),
    mime_type: exportOptionalString(record["mime_type"]),
    summary: exportOptionalString(record["summary"]),
    workflow_family_context: record["workflow_family_context"],
  };
}

function decodeInlineDownload(data: string, mimeType: string, filename: string) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function workflowContextItems(context: WorkflowFamilyContext) {
  return [
    context.familyId ? { label: "Family", value: context.familyId } : null,
    context.semanticRole ? { label: "Role", value: context.semanticRole } : null,
    context.familyWorkflowId ? { label: "Source", value: context.familyWorkflowId } : null,
    context.familyAssetWorkflowId ? { label: "Asset", value: context.familyAssetWorkflowId } : null,
    context.instanceWorkflowId ? { label: "Instance", value: context.instanceWorkflowId } : null,
  ].filter((item): item is { label: string; value: string } => item !== null);
}

export function ExportRequestRenderer(props: { message: AfpMessage }) {
  const content = createMemo<ExportRequestContent>(() =>
    normalizeExportRequestContent(decryptedDisplayContent(props.message)),
  );
  const [state, setState] = createSignal<ExportState>("idle");
  const [result, setResult] = createSignal<ExportResultContent | null>(null);
  const [error, setError] = createSignal<ApprovalCardFailureReceipt | null>(null);
  const [elapsed, setElapsed] = createSignal(0);

  let elapsedTimer: ReturnType<typeof setInterval> | undefined;

  const rendererState = createMemo(() => {
    const request = content();
    const format = request.format ?? EXPORT_DEFAULT_FORMAT;
    const baseFilename = request.filename ?? EXPORT_DEFAULT_FILENAME;
    const filename = `${baseFilename}.${format}`;
    const columns = request.columns ?? [];
    const rows = request.rows ?? [];
    const visibleColumns = columns.slice(0, 3);
    const extraColumnCount = Math.max(0, columns.length - visibleColumns.length);

    return {
      request,
      format,
      formatLabel: format.toUpperCase(),
      filename,
      rowCount: rows.length,
      visibleColumns,
      showColumns: columns.length > 0,
      extraColumnCount,
      showExtraColumns: extraColumnCount > 0,
      showSummary: Boolean(request.summary),
      showIdleActions: state() === "idle",
      showApproving: state() === "approving",
      showRejected: state() === "rejected",
      showDone: state() === "done" && result() !== null,
      showError: state() === "error",
      approvingText: elapsed() > 0 ? `${EXPORT_GENERATING_LABEL} ${elapsed()}s` : EXPORT_GENERATING_LABEL,
      resultValue: result(),
      errorValue: error(),
    };
  });

  const doneState = createMemo(() => {
    const exportResult = rendererState().resultValue;
    const workflowContext = parseWorkflowFamilyContext(exportResult?.workflow_family_context);
    return {
      exportResult,
      workflowContext,
      showWorkflowContext: Boolean(workflowContext),
    };
  });

  async function approve() {
    const request = rendererState().request;
    setState("approving");
    setError(null);
    setElapsed(0);
    elapsedTimer = setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
    try {
      const exportResult = await generateExportFile({
        format: request.format ?? EXPORT_DEFAULT_FORMAT,
        filename: request.filename ?? EXPORT_DEFAULT_FILENAME,
        columns: request.columns ?? [],
        rows: request.rows ?? [],
        thread_id: props.message.thread_id,
        parent_id: props.message.id,
      });
      setResult(exportResult);
      setState("done");
    } catch (requestError) {
      setError(
        buildApprovalCardFailureReceipt(
          "Generate export",
          requestError instanceof Error ? requestError.message : "Export failed",
        ),
      );
      setState("error");
    } finally {
      clearInterval(elapsedTimer);
    }
  }

  function downloadInline() {
    const exportResult = doneState().exportResult;
    if (!exportResult?.data || !exportResult.mime_type) return;
    decodeInlineDownload(exportResult.data, exportResult.mime_type, exportResult.filename ?? EXPORT_DEFAULT_FILENAME);
  }

  return (
    <div class="space-y-3">
      <div class="flex items-start gap-3">
        <span class="mt-0.5 text-xl leading-none">{EXPORT_ICON}</span>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold text-on-surface">
            {EXPORT_REQUEST_TITLE}
            <span class={EXPORT_REQUEST_FORMAT_BADGE_CLASS}>{rendererState().formatLabel}</span>
          </p>
          <Show when={rendererState().showSummary}>
            <p class="mt-1 text-xs leading-5 text-on-surface-variant">{rendererState().request.summary}</p>
          </Show>
          <div class={EXPORT_META_ROW_CLASS}>
            <span>
              Filename: <strong class={EXPORT_META_VALUE_CLASS}>{rendererState().filename}</strong>
            </span>
            <span>
              Rows: <strong class={EXPORT_META_VALUE_CLASS}>{rendererState().rowCount}</strong>
            </span>
          </div>
          <Show when={rendererState().showColumns}>
            <div class={EXPORT_COLUMN_ROW_CLASS}>
              <span class={EXPORT_COLUMN_LABEL_CLASS}>Columns:</span>
              <For each={rendererState().visibleColumns}>
                {(column) => <span class={EXPORT_COLUMN_CHIP_CLASS}>{column}</span>}
              </For>
              <Show when={rendererState().showExtraColumns}>
                <span class={EXPORT_EXTRA_COLUMN_CHIP_CLASS}>
                  +{rendererState().extraColumnCount} more
                </span>
              </Show>
            </div>
          </Show>
        </div>
      </div>

      <Show when={rendererState().showIdleActions}>
        <ApprovalDecisionButtons
          class="flex gap-2 pt-1"
          approveContext={EXPORT_APPROVE_CONTEXT}
          onApprove={approve}
          onReject={() => setState("rejected")}
          approveClass="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          rejectClass="rounded-full border border-white/20 px-4 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-white/10 disabled:opacity-50"
        />
      </Show>

      <Show when={rendererState().showApproving}>
        <p class={EXPORT_APPROVING_TEXT_CLASS}>{rendererState().approvingText}</p>
      </Show>

      <Show when={rendererState().showRejected}>
        <ApprovalDecisionNotice
          decision="rejected"
          context={EXPORT_APPROVE_CONTEXT}
          detail={rendererState().filename}
          class="text-on-surface"
          detailClass="text-on-surface-variant/70"
        />
      </Show>

      <Show when={rendererState().showDone}>
        <div class="space-y-3">
          <ApprovalDecisionNotice
            decision="approved"
            context={EXPORT_APPROVE_CONTEXT}
            detail={doneState().exportResult?.filename ?? null}
            class="text-on-surface"
            detailClass="text-on-surface-variant/70"
          />
          <Show when={doneState().showWorkflowContext}>
            <WorkflowFamilyContextCard context={doneState().workflowContext!} />
          </Show>
          <ExportDownloadCard
            filename={doneState().exportResult?.filename ?? EXPORT_DEFAULT_FILENAME}
            format={rendererState().format}
            sizeBytes={doneState().exportResult?.size_bytes ?? 0}
            downloadUrl={doneState().exportResult?.download_url}
            inlineData={doneState().exportResult?.data}
            mimeType={doneState().exportResult?.mime_type}
            onDownloadInline={downloadInline}
          />
        </div>
      </Show>

      <Show when={rendererState().showError}>
        <div class={EXPORT_ERROR_CARD_CLASS}>
          <p class={EXPORT_ERROR_TITLE_CLASS}>{rendererState().errorValue?.title}</p>
          <p class={EXPORT_ERROR_SUMMARY_CLASS}>{rendererState().errorValue?.summary}</p>
          <p class={EXPORT_ERROR_NEXT_STEP_CLASS}>{rendererState().errorValue?.nextStep}</p>
        </div>
      </Show>
    </div>
  );
}

export function ExportResultRenderer(props: { message: AfpMessage }) {
  const content = createMemo<ExportResultContent>(() =>
    normalizeExportResultContent(decryptedDisplayContent(props.message)),
  );

  const rendererState = createMemo(() => {
    const exportResult = content();
    const workflowContext = parseWorkflowFamilyContext(exportResult.workflow_family_context);
    return {
      exportResult,
      filename: exportResult.filename ?? EXPORT_DEFAULT_FILENAME,
      format: exportResult.format,
      formatLabel: exportResult.format?.toUpperCase() ?? null,
      summary: exportResult.summary ?? null,
      showSummary: Boolean(exportResult.summary),
      showFormat: Boolean(exportResult.format),
      workflowContext,
      showWorkflowContext: Boolean(workflowContext),
    };
  });

  function downloadInline() {
    const exportResult = rendererState().exportResult;
    if (!exportResult.data || !exportResult.mime_type) return;
    decodeInlineDownload(exportResult.data, exportResult.mime_type, rendererState().filename);
  }

  return (
    <div class="space-y-3">
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <p class="break-words text-sm font-semibold text-on-surface">{EXPORT_READY_TITLE}</p>
        <Show when={rendererState().showFormat}>
          <span class="max-w-full break-words rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.15em] text-emerald-700">
            {rendererState().formatLabel}
          </span>
        </Show>
      </div>
      <Show when={rendererState().showSummary}>
        <p class="break-words text-xs leading-5 text-on-surface-variant">{rendererState().summary}</p>
      </Show>
      <ApprovalDecisionNotice
        decision="approved"
        context={EXPORT_APPROVE_CONTEXT}
        detail={rendererState().filename}
        class="text-on-surface"
        detailClass="text-on-surface-variant/70"
      />
      <Show when={rendererState().showWorkflowContext}>
        <WorkflowFamilyContextCard context={rendererState().workflowContext!} />
      </Show>
      <ExportDownloadCard
        filename={rendererState().filename}
        format={rendererState().format}
        sizeBytes={rendererState().exportResult.size_bytes ?? 0}
        downloadUrl={rendererState().exportResult.download_url}
        inlineData={rendererState().exportResult.data}
        mimeType={rendererState().exportResult.mime_type}
        onDownloadInline={downloadInline}
      />
    </div>
  );
}

function ExportDownloadCard(props: {
  filename: string;
  format?: string;
  sizeBytes: number;
  downloadUrl?: string;
  inlineData?: string;
  mimeType?: string;
  onDownloadInline: () => void;
}) {
  const downloadState = createMemo(() => {
    const format = props.format?.toLowerCase();
    const safeFilename =
      format && !props.filename.endsWith(`.${format}`) ? `${props.filename}.${format}` : props.filename;
    return {
      safeFilename,
      formatLabel: props.format?.toUpperCase() ?? null,
      showFormat: Boolean(props.format),
      showUrlDownload: Boolean(props.downloadUrl),
      showInlineDownload: !props.downloadUrl && Boolean(props.inlineData && props.mimeType),
      href: safeHref(props.downloadUrl),
      sizeText: formatBytes(props.sizeBytes),
    };
  });

  return (
    <div class={EXPORT_DOWNLOAD_CARD_CLASS}>
      <span class="text-xl leading-none">{EXPORT_READY_ICON}</span>
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <p class="min-w-0 break-words text-xs font-semibold text-on-surface">{downloadState().safeFilename}</p>
          <Show when={downloadState().showFormat}>
            <span class={EXPORT_DOWNLOAD_FORMAT_BADGE_CLASS}>{downloadState().formatLabel}</span>
          </Show>
        </div>
        <p class="text-[11px] text-on-surface-variant">{downloadState().sizeText}</p>
      </div>
      <Show when={downloadState().showUrlDownload}>
        <a
          href={downloadState().href}
          download={downloadState().safeFilename}
          class={EXPORT_DOWNLOAD_BUTTON_CLASS}
        >
          {EXPORT_DOWNLOAD_LABEL}
        </a>
      </Show>
      <Show when={downloadState().showInlineDownload}>
        <button type="button" onClick={props.onDownloadInline} class={EXPORT_DOWNLOAD_BUTTON_CLASS}>
          {EXPORT_DOWNLOAD_LABEL}
        </button>
      </Show>
    </div>
  );
}

function WorkflowFamilyContextCard(props: { context: WorkflowFamilyContext }) {
  const cardState = createMemo(() => {
    const items = workflowContextItems(props.context);
    const values = props.context.values;
    return {
      items,
      values,
      showItems: items.length > 0,
      showValues: values.length > 0,
    };
  });

  return (
    <div class={EXPORT_WORKFLOW_CARD_CLASS}>
      <p class={EXPORT_WORKFLOW_TITLE_CLASS}>{EXPORT_AUTOMATION_TITLE}</p>
      <Show when={cardState().showItems}>
        <div class={EXPORT_WORKFLOW_META_ROW_CLASS}>
          <For each={cardState().items}>
            {(item) => (
              <span>
                {item.label}: <strong class={EXPORT_WORKFLOW_META_VALUE_CLASS}>{item.value}</strong>
              </span>
            )}
          </For>
        </div>
      </Show>
      <Show when={cardState().showValues}>
        <div class={EXPORT_WORKFLOW_VALUE_ROW_CLASS}>
          <For each={cardState().values}>
            {(entry) => (
              <span class={EXPORT_WORKFLOW_VALUE_CHIP_CLASS}>
                {entry.key}={entry.value}
              </span>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
