// @locs-version: 1.0
import { For, Show, createMemo, createSignal } from "solid-js";
import type { AfpMessage, AfpView } from "@/lib/api";
import { extractDocument, safeHref } from "@/lib/api";
import {
  buildParsedDocumentFailureReceipt,
  type ParsedDocumentFailureReceipt,
} from "@/lib/parsedDocumentFailureState";
import { toast } from "@/components/Toast";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";

interface ParsedDocumentContent {
  content_type?: string;
  parser_used?: string;
  source_url?: string;
  content_text?: string;
  page_count?: number;
  title?: string;
}

type ParsedLineBlock =
  | { kind: "heading"; line: string; level: number; text: string }
  | { kind: "code"; lines: string[]; text: string }
  | { kind: "bullet"; line: string; text: string }
  | { kind: "paragraph"; line: string };

const PARSED_DOCUMENT_TITLE = "Parsed Document";
const PARSED_DOCUMENT_EMPTY_COPY = "No content extracted.";
const PARSED_DOCUMENT_SOURCE_LABEL = "Source";
const PARSED_DOCUMENT_EXTRACT_LABEL = "Extract Table";
const PARSED_DOCUMENT_EXTRACTING_LABEL = "Extracting...";
const PARSED_DOCUMENT_COPY_CODE_LABEL = "Copy code";
const PARSED_DOCUMENT_LINES_SEPARATOR = " | ";

const PARSED_TAG_CLASS =
  "rounded-full border border-white/20 bg-white/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-outline";
const PARSED_SOURCE_BUTTON_CLASS =
  "shrink-0 rounded-full border border-white/25 bg-white/10 px-3 py-1 font-mono text-[9px] text-on-surface-variant hover:bg-white/20";
const PARSED_EXTRACT_BUTTON_CLASS =
  "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-700 transition hover:bg-emerald-500/20 disabled:opacity-50";
const PARSED_VIEWER_CLASS =
  "max-h-[480px] overflow-y-auto rounded-xl border border-white/15 bg-black/10 p-4 text-sm";
const PARSED_EMPTY_CLASS = "font-mono text-xs text-on-surface-variant opacity-50";
const PARSED_CONTENT_CLASS =
  "content-font-body mx-auto max-w-prose space-y-1.5 hyphens-auto leading-ui-prose";
const PARSED_CODE_COPY_BUTTON_CLASS =
  "absolute right-2 top-2 rounded-md border border-white/20 bg-black/35 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-on-surface-variant opacity-0 transition hover:border-primary/30 hover:text-on-surface group-hover:opacity-100 focus:opacity-100";
const PARSED_CODE_BLOCK_CLASS =
  "overflow-x-auto rounded-xl bg-surface-container-high/70 px-3 py-2 font-mono text-xs text-on-surface";
const PARSED_BULLET_CLASS =
  "break-words pl-4 leading-ui-prose text-on-surface before:mr-2 before:content-['-'] hyphens-auto";
const PARSED_PARAGRAPH_CLASS = "break-words leading-ui-prose text-on-surface hyphens-auto";
const PARSED_FAILURE_TITLE_CLASS = "text-xs font-semibold text-red-600";
const PARSED_FAILURE_SUMMARY_CLASS = "text-xs text-on-surface-variant";
const PARSED_FAILURE_NEXT_STEP_CLASS = "text-[11px] text-on-surface-variant/80";

function viewContent(message: AfpMessage, view?: AfpView): ParsedDocumentContent {
  const viewData = normalizeParsedDocumentContent(message.encryption ? undefined : view?.content);
  if (viewData?.content_text) return viewData;
  return normalizeParsedDocumentContent(decryptedDisplayContent(message));
}

function parsedString(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function parsedOptionalString(value: unknown): string | undefined {
  const normalized = parsedString(value);
  return normalized || undefined;
}

function parsedFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeParsedDocumentContent(value: unknown): ParsedDocumentContent {
  const record = afpRecord(value);
  return {
    content_type: parsedOptionalString(record["content_type"]),
    parser_used: parsedOptionalString(record["parser_used"]),
    source_url: parsedOptionalString(record["source_url"]),
    content_text: parsedString(record["content_text"]),
    page_count: parsedFiniteNumber(record["page_count"]),
    title: parsedOptionalString(record["title"]),
  };
}

function headingLevel(line: string) {
  const match = line.match(/^(#{1,6})\s/);
  return match ? match[1].length : 0;
}

function headingClass(level: number) {
  if (level === 1) return "mt-3 font-mono text-base font-bold text-on-surface";
  if (level === 2) return "mt-2 font-mono text-sm font-semibold text-on-surface";
  return "mt-1 font-mono text-xs font-semibold uppercase tracking-wide text-on-surface-variant";
}

function blockItems(contentText: string): ParsedLineBlock[] {
  const lines = contentText
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  const grouped: ParsedLineBlock[] = [];
  let pendingCode: string[] = [];

  const flushCode = () => {
    if (pendingCode.length === 0) return;
    grouped.push({ kind: "code", lines: pendingCode, text: pendingCode.join("\n") });
    pendingCode = [];
  };

  for (const line of lines) {
    if (line.startsWith("    ") || line.startsWith("\t")) {
      pendingCode.push(line);
      continue;
    }

    flushCode();

    if (line.startsWith("#")) {
      const level = headingLevel(line);
      grouped.push({
        kind: "heading",
        line,
        level,
        text: line.replace(/^#{1,6}\s+/, ""),
      });
      continue;
    }

    if (/^[-*]\s/.test(line)) {
      grouped.push({
        kind: "bullet",
        line,
        text: line.replace(/^[-*]\s+/, ""),
      });
      continue;
    }

    grouped.push({ kind: "paragraph", line });
  }

  flushCode();
  return grouped;
}

export function ParsedDocumentRenderer(props: { message: AfpMessage; view?: AfpView }) {
  const [extracting, setExtracting] = createSignal(false);
  const [extractFeedback, setExtractFeedback] = createSignal("");
  const [extractFeedbackKind, setExtractFeedbackKind] = createSignal<"success" | "error" | null>(null);
  const [extractFailure, setExtractFailure] = createSignal<ParsedDocumentFailureReceipt | null>(null);

  const rendererState = createMemo(() => {
    const documentData = viewContent(props.message, props.view);
    const contentText = documentData.content_text ?? "";
    const lines = contentText
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);
    const wordCount = contentText.split(/\s+/).filter(Boolean).length;
    const contentType = (documentData.content_type ?? "").toLowerCase();
    const canExtract =
      ["pdf", "spreadsheet", "csv", "xlsx", "xls"].some((token) => contentType.includes(token)) ||
      contentText.includes("\t") ||
      /\|.+\|/.test(contentText);
    const tagItems = [
      documentData.parser_used ? documentData.parser_used : null,
      documentData.content_type ? documentData.content_type : null,
      documentData.page_count ? `${documentData.page_count} pages` : null,
      lines.length > 0
        ? `${lines.length} lines${PARSED_DOCUMENT_LINES_SEPARATOR}~${wordCount.toLocaleString()} words`
        : null,
    ].filter((item): item is string => item !== null);
    const blocks = blockItems(contentText);

    return {
      documentData,
      title: documentData.title ?? PARSED_DOCUMENT_TITLE,
      showSource: Boolean(documentData.source_url),
      sourceUrl: safeHref(documentData.source_url),
      tagItems,
      showTags: tagItems.length > 0,
      canExtract,
      extractButtonText: extracting() ? PARSED_DOCUMENT_EXTRACTING_LABEL : PARSED_DOCUMENT_EXTRACT_LABEL,
      showExtractFeedback: Boolean(extractFeedback()),
      extractFeedbackText: extractFeedback(),
      extractFeedbackClass:
        extractFeedbackKind() === "success"
          ? "text-xs text-emerald-700"
          : extractFeedbackKind() === "error"
            ? "text-xs text-red-600"
            : "text-xs text-on-surface-variant",
      extractFailureValue: extractFailure(),
      showExtractFailure: Boolean(extractFailure()),
      blocks,
      showContent: lines.length > 0,
    };
  });

  async function copyCodeBlock(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Code copied");
    } catch {
      toast.error("Could not copy code");
    }
  }

  async function extractTable() {
    setExtracting(true);
    setExtractFeedback("");
    setExtractFailure(null);
    try {
      const result = await extractDocument(props.message.thread_id, props.message.id, {
        title: rendererState().documentData.title,
      });
      setExtractFeedback(
        `Dataset created: ${result.row_count} rows, ${result.column_count} columns (${result.quality_status}).`,
      );
      setExtractFeedbackKind("success");
    } catch (error) {
      setExtractFeedbackKind("error");
      setExtractFeedback("");
      setExtractFailure(
        buildParsedDocumentFailureReceipt(
          "Extract table",
          error instanceof Error ? error.message : "Dataset extraction failed.",
        ),
      );
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div class="space-y-4">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 class="font-mono text-base font-semibold text-on-surface">{rendererState().title}</h3>
          <Show when={rendererState().showTags}>
            <div class="mt-1 flex flex-wrap gap-2">
              <For each={rendererState().tagItems}>
                {(tag) => <span class={PARSED_TAG_CLASS}>{tag}</span>}
              </For>
            </div>
          </Show>
        </div>
        <Show when={rendererState().showSource}>
          <a
            href={rendererState().sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            class={PARSED_SOURCE_BUTTON_CLASS}
          >
            {PARSED_DOCUMENT_SOURCE_LABEL}
          </a>
        </Show>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <Show when={rendererState().canExtract}>
          <button
            type="button"
            onClick={extractTable}
            disabled={extracting()}
            class={PARSED_EXTRACT_BUTTON_CLASS}
          >
            {rendererState().extractButtonText}
          </button>
        </Show>
        <Show when={rendererState().showExtractFeedback}>
          <p class={rendererState().extractFeedbackClass}>{rendererState().extractFeedbackText}</p>
        </Show>
        <Show when={rendererState().showExtractFailure}>
          <div class="space-y-1">
            <p class={PARSED_FAILURE_TITLE_CLASS}>{rendererState().extractFailureValue?.title}</p>
            <p class={PARSED_FAILURE_SUMMARY_CLASS}>{rendererState().extractFailureValue?.summary}</p>
            <p class={PARSED_FAILURE_NEXT_STEP_CLASS}>{rendererState().extractFailureValue?.nextStep}</p>
          </div>
        </Show>
      </div>

      <div class={PARSED_VIEWER_CLASS}>
        <Show when={rendererState().showContent} fallback={<p class={PARSED_EMPTY_CLASS}>{PARSED_DOCUMENT_EMPTY_COPY}</p>}>
          <div lang="en" class={PARSED_CONTENT_CLASS}>
            <For each={rendererState().blocks}>
              {(block) => {
                if (block.kind === "heading") {
                  return <p class={headingClass(block.level)}>{block.text}</p>;
                }

                if (block.kind === "code") {
                  return (
                    <div class="group relative">
                      <button
                        type="button"
                        onClick={() => copyCodeBlock(block.text)}
                        class={PARSED_CODE_COPY_BUTTON_CLASS}
                      >
                        {PARSED_DOCUMENT_COPY_CODE_LABEL}
                      </button>
                      <pre class={PARSED_CODE_BLOCK_CLASS}>{block.text}</pre>
                    </div>
                  );
                }

                if (block.kind === "bullet") {
                  return <p class={PARSED_BULLET_CLASS}>{block.text}</p>;
                }

                return <p class={PARSED_PARAGRAPH_CLASS}>{block.line}</p>;
              }}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
