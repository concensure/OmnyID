// @locs-version: 1.0
import { Show, createMemo } from "solid-js";
import type { AfpMessage, AfpView } from "@/lib/api";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import { renderMarkdown } from "@/lib/markdownRenderer";
import { TrustSummaryBlocks } from "@/components/renderers/TrustSummaryBlocks";
import { trustSummaryStateFromContents } from "@/lib/trustFieldState";
import { surfaceNoteHeaderTimestamp } from "@/lib/surfaceTimestampPresentation";

const RICH_TEXT_HEADER_SEPARATOR = " · ";
const RICH_TEXT_DEFAULT_TITLE = "Note";
const RICH_TEXT_EMPTY_COPY = "Empty note.";

function contentString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function confidenceText(viewContent: Record<string, unknown>, messageContent: Record<string, unknown>): string | undefined {
  return contentString(viewContent.confidence) ?? contentString(messageContent.confidence);
}

export function RichTextRenderer(props: { message: AfpMessage; view?: AfpView }) {
  const rendererState = createMemo(() => {
    const messageContent = afpRecord(decryptedDisplayContent(props.message));
    const viewContent = afpRecord(props.message.encryption ? messageContent : props.view?.content ?? messageContent);
    const markdownSource = viewContent.markdown ?? viewContent.body ?? viewContent.text;
    const markdown = typeof markdownSource === "string" ? markdownSource : "";
    const title =
      (typeof viewContent.title === "string" && viewContent.title) ||
      (typeof messageContent.title === "string"
        ? messageContent.title
        : undefined);
    const trustSummary = trustSummaryStateFromContents(viewContent, messageContent);
    const confidence = confidenceText(viewContent, messageContent);
    const rawFrom = props.message.from ?? "";
    const fromText =
      rawFrom
        .split("/")
        .filter(Boolean)
        .at(-1)
        ?.replace(/_/g, " ") ?? rawFrom;
    const timestampText = surfaceNoteHeaderTimestamp(props.message.timestamp);
    const html = renderMarkdown(markdown);

    return {
      titleText: title ?? RICH_TEXT_DEFAULT_TITLE,
      showExplicitTitle: Boolean(title),
      fromText,
      timestampText,
      showTimestamp: Boolean(timestampText),
      trustSummary,
      confidence,
      html,
      showHtml: Boolean(html),
    };
  });

  return (
    <div class="space-y-3">
      <div class="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div class="flex min-w-0 items-start gap-2">
          <span class="h-2 w-2 shrink-0 rounded-full bg-primary/60" />
          <Show
            when={rendererState().showExplicitTitle}
            fallback={<p class="break-words text-xs font-medium uppercase tracking-[0.16em] text-secondary">{rendererState().titleText}</p>}
          >
            <p class="break-words text-sm font-semibold text-on-surface">{rendererState().titleText}</p>
          </Show>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-[11px] text-on-surface-variant/70 sm:shrink-0">
          <span>{rendererState().fromText}</span>
          <Show when={rendererState().showTimestamp}>
            <span>{RICH_TEXT_HEADER_SEPARATOR}</span>
            <span>{rendererState().timestampText}</span>
          </Show>
        </div>
      </div>

      <TrustSummaryBlocks
        boundedReason={rendererState().trustSummary.boundedReason}
        selectionReason={rendererState().trustSummary.selectionReason}
        showSelectionReason={rendererState().trustSummary.showSelectionReason}
        consequencePreview={rendererState().trustSummary.consequencePreview}
        provenanceCue={rendererState().trustSummary.provenanceCue}
        sourceSummary={rendererState().trustSummary.sourceSummary}
        confidence={rendererState().confidence}
      />

      <Show
        when={rendererState().showHtml}
        fallback={<p class="text-sm italic text-on-surface-variant/60">{RICH_TEXT_EMPTY_COPY}</p>}
      >
        <div class="md-prose" innerHTML={rendererState().html} />
      </Show>
    </div>
  );
}
