// @locs-version: 1.0
import { For, Show, createMemo, createSignal } from "solid-js";
import type { AfpMessage, AfpView } from "@/lib/api";
import { safeHref } from "@/lib/api";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";

interface TranscriptSegment {
  start_s: number;
  end_s: number;
  text: string;
}

interface TranscriptContent {
  model_used?: string;
  source_url?: string;
  language?: string;
  duration_seconds?: number;
  text?: string;
  segments?: TranscriptSegment[];
}

const TRANSCRIPT_TITLE = "Transcript";
const TRANSCRIPT_SOURCE_LABEL = "Source";
const TRANSCRIPT_COPY_LABEL = "Copy";
const TRANSCRIPT_COPIED_LABEL = "Copied";
const TRANSCRIPT_SHOW_SEGMENTS_LABEL = "Show timestamps";
const TRANSCRIPT_SHOW_TEXT_LABEL = "Show full text";
const TRANSCRIPT_EMPTY_TEXT = "No transcript content.";
const TRANSCRIPT_SEGMENT_TITLE_SUFFIX = " - click to open source at this point";

const TRANSCRIPT_TAG_CLASS =
  "rounded-full border border-white/20 bg-white/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-outline";
const TRANSCRIPT_ACTION_BUTTON_CLASS =
  "rounded-full border border-white/25 bg-white/10 px-3 py-1 font-mono text-[9px] text-on-surface-variant transition hover:bg-white/20";
const TRANSCRIPT_BODY_CLASS = "max-h-[400px] overflow-y-auto rounded-xl border border-white/15 bg-black/10 p-4";
const TRANSCRIPT_TEXT_CLASS = "whitespace-pre-wrap text-sm leading-relaxed text-on-surface";
const TRANSCRIPT_SEGMENT_TIME_CLASS =
  "w-16 shrink-0 pt-0.5 font-mono text-[10px] text-on-surface-variant opacity-60";

function viewContent(message: AfpMessage, view?: AfpView): TranscriptContent {
  const viewData = transcriptContentFromUnknown(message.encryption ? undefined : view?.content);
  if (viewData.text) return viewData;
  return transcriptContentFromUnknown(decryptedDisplayContent(message));
}

function transcriptString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function transcriptNumber(value: unknown): number | undefined {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : NaN;
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function transcriptSegments(value: unknown): TranscriptSegment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record = afpRecord(entry);
    const start = transcriptNumber(record.start_s);
    const end = transcriptNumber(record.end_s);
    const text = transcriptString(record.text);
    return start === undefined || end === undefined || !text
      ? []
      : [{ start_s: start, end_s: end, text }];
  });
}

function transcriptContentFromUnknown(value: unknown): TranscriptContent {
  const record = afpRecord(value);
  return {
    model_used: transcriptString(record.model_used),
    source_url: transcriptString(record.source_url),
    language: transcriptString(record.language),
    duration_seconds: transcriptNumber(record.duration_seconds),
    text: transcriptString(record.text),
    segments: transcriptSegments(record.segments),
  };
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export function TranscriptRenderer(props: { message: AfpMessage; view?: AfpView }) {
  const [showSegments, setShowSegments] = createSignal(false);
  const [copied, setCopied] = createSignal(false);

  const rendererState = createMemo(() => {
    const content = viewContent(props.message, props.view);
    const segments = content.segments ?? [];
    const tagItems = [
      content.model_used ?? null,
      content.language ?? null,
      content.duration_seconds != null ? formatDuration(content.duration_seconds) : null,
    ].filter((item): item is string => item !== null);

    return {
      content,
      tagItems,
      showTags: tagItems.length > 0,
      segments,
      showSegmentsToggle: segments.length > 0,
      showSource: Boolean(safeHref(content.source_url)),
      sourceUrl: safeHref(content.source_url),
      showCopy: (content.text?.trim().length ?? 0) > 0,
      copyButtonText: copied() ? TRANSCRIPT_COPIED_LABEL : TRANSCRIPT_COPY_LABEL,
      segmentsToggleText: showSegments() ? TRANSCRIPT_SHOW_TEXT_LABEL : TRANSCRIPT_SHOW_SEGMENTS_LABEL,
      showSegmentView: showSegments() && segments.length > 0,
      transcriptText: content.text ?? TRANSCRIPT_EMPTY_TEXT,
      segmentItems: segments.map((segment) => ({
        timeText: formatTime(segment.start_s),
        titleText: `${formatTime(segment.start_s)}${TRANSCRIPT_SEGMENT_TITLE_SUFFIX}`,
        text: segment.text,
      })),
    };
  });

  async function copyTranscript() {
    try {
      await navigator.clipboard.writeText(rendererState().content.text ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div class="space-y-4">
      <div class="flex items-start justify-between gap-4">
        <div class="space-y-1">
          <p class="font-mono text-sm font-semibold text-on-surface">{TRANSCRIPT_TITLE}</p>
          <Show when={rendererState().showTags}>
            <div class="flex flex-wrap gap-2">
              <For each={rendererState().tagItems}>
                {(tag) => <span class={TRANSCRIPT_TAG_CLASS}>{tag}</span>}
              </For>
            </div>
          </Show>
        </div>
        <div class="flex items-center gap-2">
          <Show when={rendererState().showSegmentsToggle}>
            <button
              type="button"
              onClick={() => setShowSegments((value) => !value)}
              class={TRANSCRIPT_ACTION_BUTTON_CLASS}
            >
              {rendererState().segmentsToggleText}
            </button>
          </Show>
          <Show when={rendererState().showCopy}>
            <button type="button" class={TRANSCRIPT_ACTION_BUTTON_CLASS} onClick={copyTranscript}>
              {rendererState().copyButtonText}
            </button>
          </Show>
          <Show when={rendererState().showSource}>
            <a
              href={rendererState().sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              class={TRANSCRIPT_ACTION_BUTTON_CLASS}
            >
              {TRANSCRIPT_SOURCE_LABEL}
            </a>
          </Show>
        </div>
      </div>

      <div class={TRANSCRIPT_BODY_CLASS}>
        <Show
          when={rendererState().showSegmentView}
          fallback={<p class={TRANSCRIPT_TEXT_CLASS}>{rendererState().transcriptText}</p>}
        >
          <div class="space-y-2">
            <For each={rendererState().segmentItems}>
              {(segment) => (
                <div class="flex gap-3">
                  <span class={TRANSCRIPT_SEGMENT_TIME_CLASS} title={segment.titleText}>
                    {segment.timeText}
                  </span>
                  <p class="text-sm leading-relaxed text-on-surface">{segment.text}</p>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
