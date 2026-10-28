// @locs-version: 1.0
import { createMemo, For, Show } from "solid-js";
import type { UiCommandResponse } from "@/lib/api";
import { renderMarkdown } from "@/lib/markdownRenderer";
import { buildMasterAgentConversationState } from "@/lib/masterAgentConversationState";

export function MasterAgentConversationResponse(props: {
  query: string;
  response: UiCommandResponse;
}) {
  const state = createMemo(() => buildMasterAgentConversationState(props.query, props.response));
  const assistantHtml = createMemo(() => renderMarkdown(state().assistantMarkdown));

  return (
    <section
      class="space-y-3 rounded-3xl border border-primary/25 bg-surface-container-low px-4 py-4 text-on-surface shadow-card sm:px-5"
      aria-live="polite"
      aria-label="Master Agent conversation"
      data-testid="master-agent-visible-response"
    >
      <Show when={state().userText}>
        <div class="ml-auto max-w-[92%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-white sm:max-w-[82%]">
          <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/75">You</p>
          <p class="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{state().userText}</p>
        </div>
      </Show>

      <div class="max-w-full rounded-2xl rounded-bl-md border border-outline-variant/45 bg-white px-4 py-3">
        <p class="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
          Master Agent
        </p>
        <div class="md-prose mt-2 break-words text-sm leading-6" innerHTML={assistantHtml()} />
        <Show when={state().bullets.length > 0}>
          <ul class="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-on-surface-variant">
            <For each={state().bullets}>{(bullet) => <li class="break-words">{bullet}</li>}</For>
          </ul>
        </Show>
        <Show when={state().links.length > 0}>
          <div class="mt-3 border-t border-outline-variant/40 pt-3">
            <p class="text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
              Sources and results
            </p>
            <div class="mt-2 flex flex-wrap gap-2">
              <For each={state().links}>
                {(link) => (
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    class="max-w-full break-words rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/10"
                  >
                    {link.title}
                  </a>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </section>
  );
}
