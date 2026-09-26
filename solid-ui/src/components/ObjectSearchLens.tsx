// @locs-version: 1.0
import { createMemo, For, Show } from "solid-js";
import {
  flattenObjectFacetNextMoves,
  objectFacetCountLabel,
  objectFacetMoveDisplayLabel,
  objectRetrievalStateSummary,
} from "afp-ts/retrieval";
import type { ObjectMessagesResponse } from "@/lib/api";
import { objectKindLabel } from "@/lib/objectKinds";
import {
  decisionOsObjectRetrievalBadges,
  decisionOsLeadingObjectCue,
  decisionOsObjectSupportState,
  decisionOsTopObjectFreshnessState,
} from "@/lib/decisionosObjectRetrievalState";
import type { ObjectSearchLaunchContext } from "@/lib/objectSearchNavigation";
import {
  buildObjectSearchQuery,
  parseObjectSearchQuery,
  type ParsedObjectSearchQuery,
} from "@/lib/objectSearchQuery";
import {
  objectMessagesFacetNextMoves,
  objectMessagesKindCounts,
  objectMessagesMetadataTermCounts,
  objectMessagesReferenceFacetCounts,
  objectMessagesRetrievalState,
  objectMessagesTagCounts,
} from "@/lib/objectMessagesResponseState";
import { retrievalBadgeTone } from "@/lib/retrievalTone";

export function ObjectSearchLens(props: {
  query: string;
  result: ObjectMessagesResponse;
  onSubmitQuery: (query: string) => void;
  launchContext?: ObjectSearchLaunchContext | null;
}) {
  const parsed = createMemo(() => parseObjectSearchQuery(props.query));
  const kindCounts = createMemo(() => objectMessagesKindCounts(props.result));
  const tagCounts = createMemo(() => objectMessagesTagCounts(props.result));
  const referenceFacetCounts = createMemo(() => objectMessagesReferenceFacetCounts(props.result));
  const metadataTermCounts = createMemo(() => objectMessagesMetadataTermCounts(props.result));
  const nextMoves = createMemo(() => objectMessagesFacetNextMoves(props.result));
  const stateSummary = createMemo(() =>
    objectRetrievalStateSummary({
      result: props.result,
      launchContext: props.launchContext,
    })
  );
  const stateBadges = createMemo(() =>
    decisionOsObjectRetrievalBadges({
      result: props.result,
      launchContext: props.launchContext,
    })
  );
  const topObjectFreshness = createMemo(() =>
    decisionOsTopObjectFreshnessState(objectMessagesRetrievalState(props.result))
  );
  const objectSupport = createMemo(() =>
    decisionOsObjectSupportState(objectMessagesRetrievalState(props.result))
  );
  const leadingObjectCue = createMemo(() =>
    decisionOsLeadingObjectCue(objectMessagesRetrievalState(props.result))
  );
  const retrievalBadgeClass = (badge: string) => {
    switch (retrievalBadgeTone(badge)) {
      case "success":
        return "border-emerald-200/70 bg-emerald-50/85 text-emerald-800";
      case "warning":
        return "border-amber-200/70 bg-amber-50/85 text-amber-800";
      case "info":
        return "border-sky-200/70 bg-sky-50/85 text-sky-800";
      default:
        return "border-white/45 bg-white/55 text-on-surface-variant";
    }
  };

  function updateQuery(transform: (current: ParsedObjectSearchQuery) => ParsedObjectSearchQuery) {
    const next = buildObjectSearchQuery(transform(parsed()));
    if (!next || next === props.query.trim()) return;
    void props.onSubmitQuery(next);
  }

  function toggleKind(kind: string) {
    updateQuery((current) => ({
      ...current,
      kind: current.kind === kind ? undefined : kind,
    }));
  }

  function toggleTag(tag: string) {
    updateQuery((current) => {
      const nextTags = current.tags.includes(tag)
        ? current.tags.filter((existing) => existing !== tag)
        : [...current.tags, tag];
      return { ...current, tags: nextTags };
    });
  }

  function toggleReferenceTarget(target: string) {
    updateQuery((current) => {
      const nextTargets = current.referenceTargets.includes(target)
        ? current.referenceTargets.filter((existing) => existing !== target)
        : [...current.referenceTargets, target];
      return { ...current, referenceTargets: nextTargets };
    });
  }

  function toggleReferenceType(referenceType: string) {
    updateQuery((current) => ({
      ...current,
      referenceType: current.referenceType === referenceType ? undefined : referenceType,
    }));
  }

  function toggleLinkType(linkType: string) {
    updateQuery((current) => ({
      ...current,
      linkType: current.linkType === linkType ? undefined : linkType,
    }));
  }

  function toggleMetadataTerm(term: string) {
    const [key, ...rest] = term.split(":");
    const value = rest.join(":").trim();
    if (!key || !value) return;
    updateQuery((current) => {
      const exists = current.metadataTerms.some(
        (existing) => existing.key === key && existing.value === value,
      );
      const nextTerms = exists
        ? current.metadataTerms.filter(
            (existing) => !(existing.key === key && existing.value === value),
          )
        : [...current.metadataTerms, { key, value }];
      return { ...current, metadataTerms: nextTerms };
    });
  }

  function hasMetadataTerm(term: string) {
    const [key, ...rest] = term.split(":");
    const value = rest.join(":").trim();
    return parsed().metadataTerms.some(
      (existing) => existing.key === key && existing.value === value,
    );
  }

  function clearStructuredFilters() {
    const freeText = parsed().freeText.trim();
    if (
      !freeText
      && !parsed().kind
      && parsed().tags.length === 0
      && parsed().referenceTargets.length === 0
      && !parsed().referenceType
      && !parsed().linkType
      && parsed().metadataTerms.length === 0
    ) return;
    void props.onSubmitQuery(freeText);
  }

  return (
    <section class="space-y-4 rounded-[24px] border border-white/45 bg-white/30 p-4 shadow-card backdrop-blur">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-outline">Object lens</p>
          <p class="text-sm text-on-surface-variant">
            Refine indexed object retrieval without rewriting the structured query manually.
          </p>
          <Show when={stateSummary()}>
            {(summary) => (
              <p class="mt-1 max-w-3xl text-xs text-on-surface-variant/80">
                {summary()}
              </p>
            )}
          </Show>
          <Show when={stateBadges().length > 0}>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <For each={stateBadges()}>
                {(badge) => (
                  <span class={`rounded-full border px-2.5 py-1 text-[11px] ${retrievalBadgeClass(badge)}`}>
                    {badge}
                  </span>
                )}
              </For>
            </div>
          </Show>
          <Show when={topObjectFreshness()}>
            {(freshness) => (
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <span
                  class={`rounded-full border px-2.5 py-1 text-[11px] ${
                    freshness().tone === "success"
                      ? "border-emerald-200/70 bg-emerald-50/85 text-emerald-800"
                      : freshness().tone === "warning"
                        ? "border-amber-200/70 bg-amber-50/85 text-amber-800"
                        : "border-sky-200/70 bg-sky-50/85 text-sky-800"
                  }`}
                  title={freshness().summary}
                >
                  {freshness().badge}
                </span>
              </div>
            )}
          </Show>
          <Show when={objectSupport()}>
            {(support) => (
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <span
                  class={`rounded-full border px-2.5 py-1 text-[11px] ${
                    support().tone === "warning"
                      ? "border-amber-200/70 bg-amber-50/85 text-amber-800"
                      : "border-sky-200/70 bg-sky-50/85 text-sky-800"
                  }`}
                  title={support().summary}
                >
                  {support().badge}
                </span>
              </div>
            )}
          </Show>
          <Show when={leadingObjectCue()}>
            {(cue) => (
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <span class="rounded-full border border-white/45 bg-white/55 px-2.5 py-1 text-[11px] text-on-surface-variant">
                  leading cue: {cue()}
                </span>
              </div>
            )}
          </Show>
        </div>
        <button
          type="button"
          onClick={clearStructuredFilters}
          class="rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-xs font-medium text-primary transition hover:bg-primary/14"
        >
          Clear structured filters
        </button>
      </div>

      <Show when={nextMoves()}>
        {(moves) => (
          <div class="space-y-2">
            <p class="text-xs font-medium text-on-surface-variant">Best next narrowing moves</p>
            <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <For each={flattenObjectFacetNextMoves(moves(), 8)}>
                {(entry) => (
                  <button
                    type="button"
                    onClick={() => {
                      switch (entry.family) {
                        case "kind":
                          toggleKind(entry.value);
                          break;
                        case "tag":
                          toggleTag(entry.value);
                          break;
                        case "reference_target":
                          toggleReferenceTarget(entry.value);
                          break;
                        case "reference_type":
                          toggleReferenceType(entry.value);
                          break;
                        case "link_type":
                          toggleLinkType(entry.value);
                          break;
                        case "metadata_term":
                          toggleMetadataTerm(entry.value);
                          break;
                      }
                    }}
                    class="rounded-[18px] border border-primary/20 bg-primary/8 px-3 py-2 text-left transition hover:bg-primary/14"
                  >
                    <div class="text-xs font-medium text-primary">
                      {objectFacetMoveDisplayLabel(entry)}
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

      <Show when={kindCounts().length > 0}>
        <div class="space-y-2">
          <p class="text-xs font-medium text-on-surface-variant">Kinds</p>
          <div class="flex flex-wrap gap-2">
            <For each={kindCounts()}>
              {(entry) => (
                <button
                  type="button"
                  onClick={() => toggleKind(entry.kind)}
                  class={`rounded-full border px-3 py-1 text-xs transition ${
                    parsed().kind === entry.kind
                      ? "border-primary/25 bg-primary/10 font-medium text-primary"
                      : "border-white/45 bg-white/50 text-on-surface-variant hover:bg-white/70"
                  }`}
                >
                  {objectKindLabel(entry.kind)} Â· {entry.count}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={tagCounts().length > 0}>
        <div class="space-y-2">
          <p class="text-xs font-medium text-on-surface-variant">Supertags</p>
          <div class="flex flex-wrap gap-2">
            <For each={tagCounts()}>
              {(entry) => (
                <button
                  type="button"
                  onClick={() => toggleTag(entry.tag)}
                  class={`rounded-full border px-3 py-1 text-xs transition ${
                    parsed().tags.includes(entry.tag)
                      ? "border-primary/25 bg-primary/10 font-medium text-primary"
                      : "border-white/45 bg-white/50 text-on-surface-variant hover:bg-white/70"
                  }`}
                >
                  #{entry.tag} Â· {entry.count}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={referenceFacetCounts().targets.length > 0}>
        <div class="space-y-2">
          <p class="text-xs font-medium text-on-surface-variant">Reference targets</p>
          <div class="flex flex-wrap gap-2">
            <For each={referenceFacetCounts().targets.slice(0, 10)}>
              {(entry) => (
                <button
                  type="button"
                  onClick={() => toggleReferenceTarget(entry.value)}
                  class={`rounded-full border px-3 py-1 text-xs transition ${
                    parsed().referenceTargets.includes(entry.value)
                      ? "border-primary/25 bg-primary/10 font-medium text-primary"
                      : "border-white/45 bg-white/50 text-on-surface-variant hover:bg-white/70"
                  }`}
                >
                  {objectFacetCountLabel("reference_target", entry.value, entry.count)}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={referenceFacetCounts().referenceTypes.length > 0 || referenceFacetCounts().linkTypes.length > 0}>
        <div class="grid gap-3 lg:grid-cols-2">
          <Show when={referenceFacetCounts().referenceTypes.length > 0}>
            <div class="space-y-2">
              <p class="text-xs font-medium text-on-surface-variant">Reference types</p>
              <div class="flex flex-wrap gap-2">
                <For each={referenceFacetCounts().referenceTypes.slice(0, 8)}>
                  {(entry) => (
                    <button
                      type="button"
                      onClick={() => toggleReferenceType(entry.value)}
                      class={`rounded-full border px-3 py-1 text-xs transition ${
                        parsed().referenceType === entry.value
                          ? "border-primary/25 bg-primary/10 font-medium text-primary"
                          : "border-white/45 bg-white/50 text-on-surface-variant hover:bg-white/70"
                      }`}
                    >
                      {objectFacetCountLabel("reference_type", entry.value, entry.count)}
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <Show when={referenceFacetCounts().linkTypes.length > 0}>
            <div class="space-y-2">
              <p class="text-xs font-medium text-on-surface-variant">Link types</p>
              <div class="flex flex-wrap gap-2">
                <For each={referenceFacetCounts().linkTypes.slice(0, 8)}>
                  {(entry) => (
                    <button
                      type="button"
                      onClick={() => toggleLinkType(entry.value)}
                      class={`rounded-full border px-3 py-1 text-xs transition ${
                        parsed().linkType === entry.value
                          ? "border-primary/25 bg-primary/10 font-medium text-primary"
                          : "border-white/45 bg-white/50 text-on-surface-variant hover:bg-white/70"
                      }`}
                    >
                      {objectFacetCountLabel("link_type", entry.value, entry.count)}
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={metadataTermCounts().length > 0}>
        <div class="space-y-2">
          <p class="text-xs font-medium text-on-surface-variant">Metadata terms</p>
          <div class="flex flex-wrap gap-2">
            <For each={metadataTermCounts()}>
              {(entry) => (
                <button
                  type="button"
                  onClick={() => toggleMetadataTerm(entry.value)}
                  class={`rounded-full border px-3 py-1 text-xs transition ${
                    hasMetadataTerm(entry.value)
                      ? "border-primary/25 bg-primary/10 font-medium text-primary"
                      : "border-white/45 bg-white/50 text-on-surface-variant hover:bg-white/70"
                  }`}
                >
                  {objectFacetCountLabel("metadata_term", entry.value, entry.count)}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>
    </section>
  );
}
