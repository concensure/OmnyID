import { For, Show, createMemo } from "solid-js";
import type { AfpMessage, AfpView } from "@/lib/api";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import { renderMarkdown } from "@/lib/markdownRenderer";
import { TrustSummaryBlocks } from "@/components/renderers/TrustSummaryBlocks";
import { trustSummaryStateFromContents } from "@/lib/trustFieldState";

type CanvasBlockItem = {
  id?: string;
  type?: "heading" | "paragraph" | "bullet" | "code" | "quote" | string;
  text?: string;
  level?: number;
};

type CanvasBlockState = {
  kind: "heading" | "bullet" | "code" | "quote" | "paragraph";
  text: string;
  className: string;
};

const CANVAS_HEADER_SEPARATOR = " · ";
const CANVAS_NOTE_LABEL = "Note";

function contentString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function confidenceText(viewContent: Record<string, unknown>, messageContent: Record<string, unknown>): string | undefined {
  return contentString(viewContent.confidence) ?? contentString(messageContent.confidence);
}

function contentNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeCanvasBlock(value: unknown): CanvasBlockItem | null {
  const record = afpRecord(value);
  const text = contentString(record.text);
  if (!text) return null;
  return {
    id: contentString(record.id),
    type: contentString(record.type),
    text,
    level: contentNumber(record.level),
  };
}

function normalizeCanvasBlocks(
  viewContent: Record<string, unknown>,
  message: AfpMessage,
  markdownBody: string | null,
): CanvasBlockItem[] {
  if (markdownBody) return [];
  const raw = viewContent.blocks;
  if (Array.isArray(raw)) {
    return raw.flatMap((block) => {
      const normalized = normalizeCanvasBlock(block);
      return normalized ? [normalized] : [];
    });
  }

  return [{ type: "paragraph", text: JSON.stringify(decryptedDisplayContent(message)) }];
}

function blockState(block: CanvasBlockItem): CanvasBlockState {
  const text = block.text ?? "";

  if (block.type === "heading") {
    return {
      kind: "heading",
      text,
      className:
        (block.level ?? 1) === 1
          ? "text-lg font-semibold text-on-surface"
          : "text-base font-semibold text-on-surface",
    };
  }

  if (block.type === "bullet") {
    return {
      kind: "bullet",
      text,
      className: "flex items-start gap-2 text-sm leading-7 text-on-surface-variant",
    };
  }

  if (block.type === "code") {
    return {
      kind: "code",
      text,
      className:
        "overflow-auto rounded-xl bg-white/40 px-4 py-3 font-mono text-xs leading-6 text-on-surface",
    };
  }

  if (block.type === "quote") {
    return {
      kind: "quote",
      text,
      className:
        "border-l-2 border-primary pl-4 text-sm italic leading-7 text-on-surface-variant",
    };
  }

  return {
    kind: "paragraph",
    text,
    className: "text-sm leading-7 text-on-surface-variant",
  };
}

function CanvasBlockView(props: { state: CanvasBlockState }) {
  return (
    <Show
      when={props.state.kind !== "heading"}
      fallback={<p class={props.state.className}>{props.state.text}</p>}
    >
      <Show
        when={props.state.kind !== "bullet"}
        fallback={
          <div class={props.state.className}>
            <span class="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-outline" />
            <span>{props.state.text}</span>
          </div>
        }
      >
        <Show
          when={props.state.kind !== "code"}
          fallback={<pre class={props.state.className}>{props.state.text}</pre>}
        >
          <Show
            when={props.state.kind !== "quote"}
            fallback={<blockquote class={props.state.className}>{props.state.text}</blockquote>}
          >
            <p class={props.state.className}>{props.state.text}</p>
          </Show>
        </Show>
      </Show>
    </Show>
  );
}

export function CanvasRenderer(props: { message: AfpMessage; view?: AfpView }) {
  const rendererState = createMemo(() => {
    const messageContent = afpRecord(decryptedDisplayContent(props.message));
    const viewContent = afpRecord(props.message.encryption ? messageContent : props.view?.content ?? messageContent);
    const explicitMarkdown =
      typeof viewContent.markdown === "string" && viewContent.markdown ? viewContent.markdown : null;
    // Notes without structured blocks (e.g. guest-mode sample data) carry their
    // formatting as markdown syntax in body/summary/text — render it as such
    // instead of dumping the raw "**bold**"/"- item" source as plain text.
    const fallbackMarkdown = !Array.isArray(viewContent.blocks)
      ? contentString(viewContent.body) ?? contentString(viewContent.summary) ?? contentString(viewContent.text) ?? null
      : null;
    const markdownBody = explicitMarkdown ?? fallbackMarkdown;
    const blocks = normalizeCanvasBlocks(viewContent, props.message, markdownBody);
    const trustSummary = trustSummaryStateFromContents(viewContent, messageContent);
    const confidence = confidenceText(viewContent, messageContent);
    const title =
      contentString(viewContent.title) ??
      contentString(messageContent.title) ??
      props.message.type;
    const html = markdownBody ? renderMarkdown(markdownBody) : "";

    return {
      title,
      fromText: props.message.from,
      headerText: `${title}${CANVAS_HEADER_SEPARATOR}${props.message.from}`,
      trustSummary,
      confidence,
      html,
      showMarkdown: Boolean(markdownBody),
      showBlocks: !markdownBody,
      blockStates: blocks.map((block) => blockState(block)),
    };
  });

  return (
    <div class="space-y-3">
      <div class="flex items-center gap-3">
        <span class="h-2 w-2 rounded-full bg-secondary" />
        <p class="text-xs font-medium uppercase tracking-[0.18em] text-secondary">
          {rendererState().title || CANVAS_NOTE_LABEL}
        </p>
        <span class="ml-auto text-xs text-on-surface-variant">{rendererState().fromText}</span>
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

      <Show when={rendererState().showMarkdown}>
        <div class="md-prose" innerHTML={rendererState().html} />
      </Show>

      <Show when={rendererState().showBlocks}>
        <For each={rendererState().blockStates}>
          {(state) => <CanvasBlockView state={state} />}
        </For>
      </Show>
    </div>
  );
}
