// @locs-version: 1.0
import { createMemo, For, Show } from "solid-js";
import {
  flattenThreadFacetNextMoves,
  threadFacetCountLabel,
} from "afp-ts/retrieval";
import type { ThreadSummariesResponse } from "@/lib/api";
import { buildThreadSearchInput, parseThreadSearchInput } from "@/lib/threadSearch";

export function ThreadDiscoveryLens(props: {
  query: string;
  result: ThreadSummariesResponse | null | undefined;
  onSubmitQuery: (query: string) => void;
}) {
  const parsed = createMemo(() => parseThreadSearchInput(props.query));
  const nextMoves = createMemo(() => props.result?.facet_next_moves ?? null);
  const suggestions = createMemo(() => props.result?.facet_suggestions ?? null);

  function updateQuery(kind?: string, tags?: string[]) {
    const next = buildThreadSearchInput({
      query: parsed().query,
      kind,
      tags: tags ?? [],
      metadataTerms: parsed().metadataTerms,
      threadIds: parsed().threadIds,
      fromAgents: parsed().fromAgents,
      timeRange: parsed().timeRange,
    });
    if (next === props.query.trim()) return;
    void props.onSubmitQuery(next);
  }

  function toggleKind(kind: string) {
    updateQuery(parsed().kind === kind ? undefined : kind, parsed().tags);
  }

  function toggleTag(tag: string) {
    const nextTags = parsed().tags.includes(tag)
      ? parsed().tags.filter((existing) => existing !== tag)
      : [...parsed().tags, tag];
    updateQuery(parsed().kind, nextTags);
  }

  function toggleMetadataTerm(metadataTerm: string) {
    const nextMetadataTerms = parsed().metadataTerms.includes(metadataTerm)
      ? parsed().metadataTerms.filter((existing) => existing !== metadataTerm)
      : [...parsed().metadataTerms, metadataTerm];
    const next = buildThreadSearchInput({
      query: parsed().query,
      kind: parsed().kind,
      tags: parsed().tags,
      metadataTerms: nextMetadataTerms,
      threadIds: parsed().threadIds,
      fromAgents: parsed().fromAgents,
      timeRange: parsed().timeRange,
    });
    if (next === props.query.trim()) return;
    void props.onSubmitQuery(next);
  }

  function stopRefineButtonEvent(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <Show when={props.result && (nextMoves() || suggestions())}>
      <section class="mt-3 space-y-3 rounded-2xl border border-white/35 bg-white/22 px-4 py-3 backdrop-blur">
        <Show when={nextMoves()}>
          {(moves) => (
            <div class="space-y-2">
              <p class="text-xs font-medium text-on-surface-variant">Best next narrowing moves</p>
              <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <For each={flattenThreadFacetNextMoves(moves(), 6)}>
                  {(entry) => (
                    <button
                      type="button"
                      onPointerDown={stopRefineButtonEvent}
                      onClick={(event) => {
                        stopRefineButtonEvent(event);
                        if (entry.family === "kind") toggleKind(entry.value);
                        else if (entry.family === "tag") toggleTag(entry.value);
                        else toggleMetadataTerm(entry.value);
                      }}
                      class="rounded-[18px] border border-primary/20 bg-primary/8 px-3 py-2 text-left transition hover:bg-primary/14"
                    >
                      <div class="text-xs font-medium text-primary">
                        {typeof entry.count === "number"
                          ? threadFacetCountLabel(entry.family, entry.value, entry.count)
                          : entry.label}
                      </div>
                      <div class="mt-1 text-[11px] leading-snug text-on-surface-variant">
                        {entry.rationale}
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </div>
          )}
        </Show>

        <Show when={suggestions()?.kinds.length}>
          <div class="space-y-2">
            <p class="text-xs font-medium text-on-surface-variant">Kinds</p>
            <div class="flex flex-wrap gap-2">
              <For each={suggestions()?.kinds ?? []}>
                {(entry) => (
                  <button
                    type="button"
                    onPointerDown={stopRefineButtonEvent}
                    onClick={(event) => {
                      stopRefineButtonEvent(event);
                      toggleKind(entry.value);
                    }}
                    class={`rounded-full border px-3 py-1 text-xs transition ${
                      parsed().kind === entry.value
                        ? "border-primary/25 bg-primary/10 font-medium text-primary"
                        : "border-white/40 bg-white/45 text-on-surface-variant hover:bg-white/65"
                    }`}
                  >
                    {threadFacetCountLabel("kind", entry.value, entry.count)}
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>

        <Show when={suggestions()?.tags.length}>
          <div class="space-y-2">
            <p class="text-xs font-medium text-on-surface-variant">Supertags</p>
            <div class="flex flex-wrap gap-2">
              <For each={suggestions()?.tags ?? []}>
                {(entry) => (
                  <button
                    type="button"
                    onPointerDown={stopRefineButtonEvent}
                    onClick={(event) => {
                      stopRefineButtonEvent(event);
                      toggleTag(entry.value);
                    }}
                    class={`rounded-full border px-3 py-1 text-xs transition ${
                      parsed().tags.includes(entry.value)
                        ? "border-primary/25 bg-primary/10 font-medium text-primary"
                        : "border-white/40 bg-white/45 text-on-surface-variant hover:bg-white/65"
                    }`}
                  >
                    {threadFacetCountLabel("tag", entry.value, entry.count)}
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>

        <Show when={suggestions()?.metadata_terms?.length}>
          <div class="space-y-2">
            <p class="text-xs font-medium text-on-surface-variant">Scope</p>
            <div class="flex flex-wrap gap-2">
              <For each={suggestions()?.metadata_terms ?? []}>
                {(entry) => (
                  <button
                    type="button"
                    onPointerDown={stopRefineButtonEvent}
                    onClick={(event) => {
                      stopRefineButtonEvent(event);
                      toggleMetadataTerm(entry.value);
                    }}
                    class={`rounded-full border px-3 py-1 text-xs transition ${
                      parsed().metadataTerms.includes(entry.value)
                        ? "border-primary/25 bg-primary/10 font-medium text-primary"
                        : "border-white/40 bg-white/45 text-on-surface-variant hover:bg-white/65"
                    }`}
                  >
                    {threadFacetCountLabel("metadata_term", entry.value, entry.count)}
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>
      </section>
    </Show>
  );
}
