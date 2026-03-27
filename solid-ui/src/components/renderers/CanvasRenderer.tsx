import { For, Show } from "solid-js";
import type { AfpMessage, AfpView } from "@/lib/api";

type CanvasBlock = {
  id?: string;
  type?: "heading" | "paragraph" | "bullet" | "code" | "quote" | string;
  text?: string;
  level?: number;
};

/**
 * Renders an AFP message as a Notion-style canvas / notes surface.
 * Agents write `views: [{format:"canvas", content:{blocks:[...]}}]` to drive this.
 */
export function CanvasRenderer(props: { message: AfpMessage; view?: AfpView }) {
  const canvasContent = () => props.view?.content ?? props.message.content;

  const blocks = (): CanvasBlock[] => {
    const raw = canvasContent().blocks;
    if (Array.isArray(raw)) return raw as CanvasBlock[];
    // Fallback: synthesise a single paragraph block from common content fields
    const text =
      (canvasContent().body as string | undefined) ??
      (canvasContent().summary as string | undefined) ??
      (canvasContent().text as string | undefined) ??
      JSON.stringify(props.message.content);
    return [{ type: "paragraph", text }];
  };

  const title = () =>
    (canvasContent().title as string | undefined) ??
    (props.message.content.title as string | undefined) ??
    props.message.type;

  return (
    <div class="space-y-3">
      <div class="flex items-center gap-3">
        <span class="h-2 w-2 rounded-full bg-secondary" />
        <p class="text-xs font-medium uppercase tracking-[0.18em] text-secondary">{title()}</p>
        <span class="ml-auto text-xs text-on-surface-variant">{props.message.from}</span>
      </div>
      <For each={blocks()}>
        {(block) => <CanvasBlock block={block} />}
      </For>
    </div>
  );
}

function CanvasBlock(props: { block: CanvasBlock }) {
  const b = () => props.block;
  return (
    <Show
      when={b().type !== "heading"}
      fallback={
        <p
          class={`font-semibold text-on-surface ${(b().level ?? 1) === 1 ? "text-lg" : "text-base"}`}
        >
          {b().text}
        </p>
      }
    >
      <Show
        when={b().type !== "bullet"}
        fallback={
          <div class="flex items-start gap-2 text-sm leading-7 text-on-surface-variant">
            <span class="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-outline" />
            <span>{b().text}</span>
          </div>
        }
      >
        <Show
          when={b().type !== "code"}
          fallback={
            <pre class="overflow-auto rounded-xl bg-white/40 px-4 py-3 font-mono text-xs leading-6 text-on-surface">
              {b().text}
            </pre>
          }
        >
          <Show
            when={b().type !== "quote"}
            fallback={
              <blockquote class="border-l-2 border-primary pl-4 text-sm italic leading-7 text-on-surface-variant">
                {b().text}
              </blockquote>
            }
          >
            <p class="text-sm leading-7 text-on-surface-variant">{b().text}</p>
          </Show>
        </Show>
      </Show>
    </Show>
  );
}
