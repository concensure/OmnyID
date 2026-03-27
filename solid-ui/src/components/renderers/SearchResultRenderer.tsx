import { For, Show } from "solid-js";
import type { AfpMessage, AfpView } from "@/lib/api";

type SearchSource = {
  title?: string;
  url?: string;
  snippet?: string;
};

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url.length > 40 ? `${url.slice(0, 37)}…` : url;
  }
}

export function SearchResultRenderer(props: {
  message: AfpMessage;
  view?: AfpView;
}) {
  const viewContent = () => props.view?.content ?? {};
  const msgContent = () => props.message.content;

  const query = () =>
    (viewContent()["query"] ?? msgContent()["query"] ?? "") as string;
  const summary = () =>
    (viewContent()["summary"] ?? msgContent()["summary"] ?? "") as string;
  const bullets = () =>
    ((viewContent()["bullets"] ?? msgContent()["bullets"] ?? []) as string[]);
  const sources = () =>
    ((viewContent()["sources"] ?? msgContent()["sources"] ?? []) as SearchSource[]);

  return (
    <div class="space-y-4">
      {/* Query label */}
      <Show when={query()}>
        <p class="font-mono text-[9px] uppercase tracking-[0.2em] text-outline">
          Search · {query()}
        </p>
      </Show>

      {/* Summary */}
      <Show when={summary()}>
        <p class="text-sm leading-6 text-on-surface">{summary()}</p>
      </Show>

      {/* Bullet points */}
      <Show when={bullets().length > 0}>
        <ul class="space-y-1.5">
          <For each={bullets()}>
            {(bullet) => (
              <li class="flex items-start gap-2 text-sm leading-6 text-on-surface">
                <span class="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                <span>{bullet}</span>
              </li>
            )}
          </For>
        </ul>
      </Show>

      {/* Sources */}
      <Show when={sources().length > 0}>
        <div class="border-t border-white/15 pt-3">
          <p class="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-outline">Sources</p>
          <div class="flex flex-wrap gap-2">
            <For each={sources()}>
              {(src) => (
                <Show when={src.url}>
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    title={src.url}
                    class="group relative flex max-w-[200px] items-center gap-1.5 rounded-full border border-white/30 bg-white/25 px-3 py-1 text-xs text-on-surface transition hover:bg-white/45 hover:text-primary"
                  >
                    <span class="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary/60" />
                    <span class="truncate">{shortUrl(src.url!)}</span>
                    {/* Full URL tooltip on hover */}
                    <span class="pointer-events-none absolute bottom-full left-0 z-10 mb-1 hidden max-w-xs break-all rounded-lg border border-white/30 bg-surface/95 px-3 py-2 text-[10px] text-on-surface shadow-lg group-hover:block">
                      {src.title && <span class="mb-0.5 block font-medium">{src.title}</span>}
                      <span class="text-on-surface-variant">{src.url}</span>
                    </span>
                  </a>
                </Show>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}
