/**
 * KnowledgeGraphView — knowledge graph section under the Notes tab.
 *
 * Renders AFP messages produced by the Knowledge Curator daemon:
 *   backlink_update  → connections between messages (shown per-card)
 *   knowledge_card   → structured knowledge nodes (main grid)
 *   insight          → higher-level insight summaries (top banner)
 *   merge_suggestion → near-duplicate warnings (bottom tray)
 *
 * Consumes the existing DashboardBootstrap.messages array; no new API
 * calls needed — the Curator writes to the same AFP stream.
 */

import { createMemo, createSignal, For, Show } from "solid-js";
import type { AfpMessage } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type KnowledgeCard = {
  id: string;
  title: string;
  summary: string;
  supertags: string[];
  backlinks: BacklinkRef[];
  timestamp: string;
  sourceThreadId?: string;
};

type BacklinkRef = {
  targetId: string;
  targetTitle: string;
  relationLabel: string;
};

type InsightMsg = {
  id: string;
  body: string;
  topic?: string;
  count?: number;
  timestamp: string;
};

type MergeSuggestion = {
  id: string;
  sourceId: string;
  targetId: string;
  sourceTitle: string;
  targetTitle: string;
  similarityScore?: number;
  timestamp: string;
};

// ── Extraction helpers ────────────────────────────────────────────────────────

function extractKnowledgeCards(messages: AfpMessage[]): KnowledgeCard[] {
  return messages
    .filter((m) => m.type === "knowledge_card")
    .map((m) => {
      const c = m.content as Record<string, unknown>;
      const rawTags = c.supertags;
      const supertags: string[] = Array.isArray(rawTags)
        ? (rawTags as unknown[]).filter((t): t is string => typeof t === "string")
        : [];
      return {
        id: m.id,
        title: typeof c.title === "string" ? c.title : m.id.slice(0, 12),
        summary: typeof c.summary === "string" ? c.summary : "",
        supertags,
        backlinks: [],
        timestamp: m.timestamp,
        sourceThreadId: m.thread_id,
      };
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function attachBacklinks(
  cards: KnowledgeCard[],
  messages: AfpMessage[],
): KnowledgeCard[] {
  const cardById = new Map(cards.map((c) => [c.id, c]));

  for (const m of messages) {
    if (m.type !== "backlink_update") continue;
    const c = m.content as Record<string, unknown>;
    const sourceId = typeof c.source_id === "string" ? c.source_id : null;
    const targetId = typeof c.target_id === "string" ? c.target_id : null;
    if (!sourceId || !targetId) continue;

    const ref: BacklinkRef = {
      targetId,
      targetTitle: typeof c.target_title === "string" ? c.target_title : targetId.slice(0, 12),
      relationLabel: typeof c.relation === "string" ? c.relation : "related",
    };

    const sourceCard = cardById.get(sourceId);
    if (sourceCard) {
      sourceCard.backlinks = [...sourceCard.backlinks, ref];
    }
  }

  return cards;
}

function extractInsights(messages: AfpMessage[]): InsightMsg[] {
  return messages
    .filter((m) => m.type === "insight")
    .map((m) => {
      const c = m.content as Record<string, unknown>;
      return {
        id: m.id,
        body: typeof c.body === "string" ? c.body : "",
        topic: typeof c.topic === "string" ? c.topic : undefined,
        count: typeof c.count === "number" ? c.count : undefined,
        timestamp: m.timestamp,
      };
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 8);
}

function extractMergeSuggestions(messages: AfpMessage[]): MergeSuggestion[] {
  return messages
    .filter((m) => m.type === "merge_suggestion")
    .map((m) => {
      const c = m.content as Record<string, unknown>;
      return {
        id: m.id,
        sourceId: typeof c.source_id === "string" ? c.source_id : "",
        targetId: typeof c.target_id === "string" ? c.target_id : "",
        sourceTitle: typeof c.source_title === "string" ? c.source_title : "Message A",
        targetTitle: typeof c.target_title === "string" ? c.target_title : "Message B",
        similarityScore: typeof c.similarity_score === "number" ? c.similarity_score : undefined,
        timestamp: m.timestamp,
      };
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InsightBanner(props: { insights: InsightMsg[] }) {
  return (
    <Show when={props.insights.length > 0}>
      <div class="mb-4 rounded-2xl border border-indigo-200/60 bg-indigo-50/70 p-4 backdrop-blur">
        <p class="mb-2 text-xs font-semibold uppercase tracking-wider text-indigo-500">
          ✦ Insights from your knowledge base
        </p>
        <div class="flex flex-wrap gap-2">
          <For each={props.insights}>
            {(ins) => (
              <div class="rounded-xl border border-indigo-100 bg-white/80 px-3 py-2 text-sm text-on-surface shadow-sm">
                <Show when={ins.topic}>
                  <span class="mr-1 font-medium text-indigo-600">{ins.topic}:</span>
                </Show>
                {ins.body}
                <Show when={ins.count !== undefined}>
                  <span class="ml-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                    ×{ins.count}
                  </span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}

function SupertagPill(props: { tag: string }) {
  return (
    <span class="inline-block rounded-full bg-violet-100/80 px-2 py-0.5 text-[11px] font-medium text-violet-700">
      #{props.tag}
    </span>
  );
}

function BacklinkChip(props: { link: BacklinkRef }) {
  return (
    <span
      class="inline-flex items-center gap-1 rounded-full border border-sky-200/80 bg-sky-50/70 px-2 py-0.5 text-[11px] text-sky-700"
      title={props.link.targetId}
    >
      <span class="opacity-60">↗</span>
      {props.link.targetTitle}
      <span class="opacity-50">· {props.link.relationLabel}</span>
    </span>
  );
}

function KnowledgeCardTile(props: { card: KnowledgeCard }) {
  const [expanded, setExpanded] = createSignal(false);

  const relDate = () => {
    try {
      const d = new Date(props.card.timestamp);
      const diffMs = Date.now() - d.getTime();
      const diffH = Math.floor(diffMs / 3_600_000);
      if (diffH < 1) return "just now";
      if (diffH < 24) return `${diffH}h ago`;
      const diffD = Math.floor(diffH / 24);
      if (diffD < 7) return `${diffD}d ago`;
      return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    } catch {
      return "";
    }
  };

  return (
    <div class="rounded-2xl border border-white/50 bg-white/70 p-4 shadow-sm backdrop-blur transition hover:shadow-md">
      {/* Header */}
      <div class="mb-2 flex items-start justify-between gap-2">
        <p class="flex-1 text-sm font-semibold text-on-surface leading-snug">
          {props.card.title}
        </p>
        <span class="shrink-0 text-[11px] text-on-surface-variant">{relDate()}</span>
      </div>

      {/* Summary */}
      <Show when={props.card.summary}>
        <p
          class={`mb-3 text-xs text-on-surface-variant leading-relaxed ${
            expanded() ? "" : "line-clamp-3"
          }`}
        >
          {props.card.summary}
        </p>
        <Show when={props.card.summary.length > 180}>
          <button
            type="button"
            class="mb-2 text-[11px] text-primary hover:underline"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded() ? "Show less" : "Show more"}
          </button>
        </Show>
      </Show>

      {/* Supertags */}
      <Show when={props.card.supertags.length > 0}>
        <div class="mb-2 flex flex-wrap gap-1">
          <For each={props.card.supertags}>{(t) => <SupertagPill tag={t} />}</For>
        </div>
      </Show>

      {/* Backlinks */}
      <Show when={props.card.backlinks.length > 0}>
        <div class="mt-2 flex flex-wrap gap-1 border-t border-white/50 pt-2">
          <For each={props.card.backlinks.slice(0, 4)}>
            {(l) => <BacklinkChip link={l} />}
          </For>
          <Show when={props.card.backlinks.length > 4}>
            <span class="text-[11px] text-on-surface-variant">
              +{props.card.backlinks.length - 4} more
            </span>
          </Show>
        </div>
      </Show>
    </div>
  );
}

function MergeSuggestionTray(props: { suggestions: MergeSuggestion[] }) {
  return (
    <Show when={props.suggestions.length > 0}>
      <div class="mt-6 rounded-2xl border border-amber-200/70 bg-amber-50/60 p-4 backdrop-blur">
        <p class="mb-3 text-xs font-semibold uppercase tracking-wider text-amber-600">
          ⚠ Possible duplicates — review suggested merges
        </p>
        <div class="space-y-2">
          <For each={props.suggestions.slice(0, 5)}>
            {(s) => (
              <div class="flex items-center gap-2 rounded-xl border border-amber-100 bg-white/80 px-3 py-2 text-xs">
                <span class="flex-1 truncate text-on-surface">
                  <span class="font-medium">{s.sourceTitle}</span>
                  <span class="mx-2 text-on-surface-variant">≈</span>
                  <span class="font-medium">{s.targetTitle}</span>
                </span>
                <Show when={s.similarityScore !== undefined}>
                  <span class="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">
                    {Math.round((s.similarityScore ?? 0) * 100)}% similar
                  </span>
                </Show>
                <span class="shrink-0 text-[11px] text-on-surface-variant">
                  Review in Threads
                </span>
              </div>
            )}
          </For>
          <Show when={props.suggestions.length > 5}>
            <p class="text-[11px] text-on-surface-variant">
              +{props.suggestions.length - 5} more suggestions — open the Threads view to review all.
            </p>
          </Show>
        </div>
      </div>
    </Show>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div class="flex flex-col items-center justify-center py-20 text-center">
      <span class="mb-4 text-5xl opacity-40">∞</span>
      <p class="mb-1 text-base font-semibold text-on-surface">Knowledge graph is empty</p>
      <p class="max-w-xs text-sm text-on-surface-variant leading-relaxed">
        The Knowledge Curator daemon builds this graph automatically as you add notes,
        emails, and research results. Enable it from the Automations tab under
        Background Daemons.
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export type KnowledgeGraphViewProps = {
  messages: AfpMessage[];
};

export function KnowledgeGraphView(props: KnowledgeGraphViewProps) {
  const [searchQuery, setSearchQuery] = createSignal("");
  const [activeTag, setActiveTag] = createSignal<string | null>(null);

  const insights = createMemo(() => extractInsights(props.messages));

  const allCards = createMemo(() =>
    attachBacklinks(extractKnowledgeCards(props.messages), props.messages),
  );

  const mergeSuggestions = createMemo(() => extractMergeSuggestions(props.messages));

  // All unique supertags across cards for the filter row
  const allTags = createMemo(() => {
    const set = new Set<string>();
    for (const c of allCards()) {
      for (const t of c.supertags) set.add(t);
    }
    return [...set].sort();
  });

  const filteredCards = createMemo(() => {
    const q = searchQuery().toLowerCase().trim();
    const tag = activeTag();
    return allCards().filter((c) => {
      if (tag && !c.supertags.includes(tag)) return false;
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        c.summary.toLowerCase().includes(q) ||
        c.supertags.some((t) => t.toLowerCase().includes(q))
      );
    });
  });

  const isEmpty = createMemo(
    () => allCards().length === 0 && insights().length === 0 && mergeSuggestions().length === 0,
  );

  return (
    <div class="flex flex-col gap-0">
      {/* Header bar */}
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2">
          <span class="text-xl">∞</span>
          <h2 class="text-base font-semibold text-on-surface">Knowledge Graph</h2>
        </div>

        {/* Search */}
        <div class="relative flex-1 min-w-[180px] max-w-xs">
          <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">
            🔍
          </span>
          <input
            type="text"
            placeholder="Search cards…"
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            class="w-full rounded-full border border-white/40 bg-white/60 py-1.5 pl-8 pr-3 text-sm text-on-surface placeholder-on-surface-variant backdrop-blur focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {/* Stats */}
        <div class="ml-auto flex items-center gap-2 text-[11px] text-on-surface-variant">
          <span>{allCards().length} cards</span>
          <span>·</span>
          <span>
            {allCards().reduce((acc, c) => acc + c.backlinks.length, 0)} backlinks
          </span>
          <Show when={mergeSuggestions().length > 0}>
            <span>·</span>
            <span class="text-amber-600">{mergeSuggestions().length} merge suggestions</span>
          </Show>
        </div>
      </div>

      {/* Supertag filter pills */}
      <Show when={allTags().length > 0}>
        <div class="mb-4 flex flex-wrap gap-1.5">
          <button
            type="button"
            class={`rounded-full px-3 py-1 text-xs font-medium transition ${
              activeTag() === null
                ? "bg-primary text-white"
                : "bg-white/60 text-on-surface-variant hover:bg-white/80"
            }`}
            onClick={() => setActiveTag(null)}
          >
            All
          </button>
          <For each={allTags()}>
            {(tag) => (
              <button
                type="button"
                class={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  activeTag() === tag
                    ? "bg-violet-600 text-white"
                    : "bg-violet-100/80 text-violet-700 hover:bg-violet-200"
                }`}
                onClick={() => setActiveTag(activeTag() === tag ? null : tag)}
              >
                #{tag}
              </button>
            )}
          </For>
        </div>
      </Show>

      {/* Insight banner */}
      <InsightBanner insights={insights()} />

      {/* Empty state */}
      <Show when={isEmpty()}>
        <EmptyState />
      </Show>

      {/* Knowledge card grid */}
      <Show when={filteredCards().length > 0}>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <For each={filteredCards()}>{(card) => <KnowledgeCardTile card={card} />}</For>
        </div>
      </Show>

      {/* No results for current filter */}
      <Show when={!isEmpty() && filteredCards().length === 0}>
        <p class="py-10 text-center text-sm text-on-surface-variant">
          No knowledge cards match your current filter.
        </p>
      </Show>

      {/* Merge suggestions tray */}
      <MergeSuggestionTray suggestions={mergeSuggestions()} />
    </div>
  );
}
