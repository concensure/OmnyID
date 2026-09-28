/**
 * DiscoverView — Private Media & Knowledge Feed
 *
 * A personal, ad-free, E2EE feed curated by your own agents.
 * Surfaces summarised news, recommended videos/articles, and research digests
 * as rich agent-generated cards with "Open Original" links.
 */

import { createSignal, createMemo, For, Show, onMount } from "solid-js";
import { safeHref } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FeedCategory = "all" | "news" | "videos" | "research";

type FeedCard = {
  id: string;
  category: "news" | "videos" | "research";
  title: string;
  summary: string;
  source: string;
  sourceDomain: string;
  originalUrl?: string;
  publishedAt: string;
  /** Local/National/World for news; topic tags for others */
  tags: string[];
  readTimeMin?: number;
  agentNote?: string;
};

// ---------------------------------------------------------------------------
// Mock cards (replaced by real AFP messages once agents are configured)
// ---------------------------------------------------------------------------

const MOCK_CARDS: FeedCard[] = [
  {
    id: "c1",
    category: "news",
    title: "Local councils push for expanded EV charging infrastructure",
    summary:
      "A coalition of councils has submitted proposals for 2,400 new public charging points across suburban areas, aiming to cut average driver range anxiety by 40% before the 2026 targets.",
    source: "City Herald",
    sourceDomain: "cityherald.example",
    publishedAt: "2 hours ago",
    tags: ["Local", "EV", "Infrastructure"],
    readTimeMin: 3,
    agentNote: "Flagged because you follow clean energy and local planning topics.",
  },
  {
    id: "c2",
    category: "news",
    title: "Central bank holds rates steady amid easing inflation signals",
    summary:
      "The bank cited three consecutive months of declining core inflation and stable employment as reasons to pause the hiking cycle, though warned that energy price volatility remains a risk.",
    source: "Financial Wire",
    sourceDomain: "financialwire.example",
    publishedAt: "4 hours ago",
    tags: ["National", "Economy", "Finance"],
    readTimeMin: 4,
  },
  {
    id: "c3",
    category: "news",
    title: "Open-source AI framework reaches 100,000 GitHub stars",
    summary:
      "The project, which provides a modular pipeline for running local LLMs, reached the milestone after a viral benchmark showing it matched hosted API performance at a fraction of the cost.",
    source: "Tech Dispatch",
    sourceDomain: "techdispatch.example",
    publishedAt: "6 hours ago",
    tags: ["World", "AI", "Open Source"],
    readTimeMin: 2,
    agentNote: "Trending in your AI & developer interest cluster.",
  },
  {
    id: "c4",
    category: "videos",
    title: "How transformer attention actually works — visual explainer",
    summary:
      "A 12-minute deep dive using animated diagrams to show query-key-value mechanics, positional encoding, and why attention heads specialise. No maths degree required.",
    source: "3Blue1Brown-style channel",
    sourceDomain: "learnai.example",
    originalUrl: "#",
    publishedAt: "1 day ago",
    tags: ["AI", "Education", "Deep Learning"],
    readTimeMin: 12,
    agentNote: "Matches your saved interest: 'ML fundamentals'.",
  },
  {
    id: "c5",
    category: "videos",
    title: "Building a personal finance dashboard in 30 minutes",
    summary:
      "Step-by-step walkthrough connecting bank APIs, normalising transaction data, and rendering live charts in a minimal web app — all with open-source tooling.",
    source: "DevStream Weekly",
    sourceDomain: "devstream.example",
    originalUrl: "#",
    publishedAt: "2 days ago",
    tags: ["Finance", "Tutorial", "Web Dev"],
    readTimeMin: 30,
  },
  {
    id: "c6",
    category: "research",
    title: "Agent-curated digest: Advances in retrieval-augmented generation",
    summary:
      "This week your Research Assistant agent synthesised 14 papers on RAG architectures. Key findings: hybrid sparse-dense retrieval outperforms pure dense in domain-specific corpora; context window management remains the dominant bottleneck.",
    source: "Your Research Agent",
    sourceDomain: "agent.local",
    publishedAt: "Today, 9:00 am",
    tags: ["AI", "Research", "RAG"],
    readTimeMin: 6,
    agentNote: "Auto-generated weekly digest from your Research Assistant workflow.",
  },
  {
    id: "c7",
    category: "research",
    title: "Personal knowledge digest: Nutrition & longevity links",
    summary:
      "Based on 9 articles you saved this month, your Knowledge Curator identified three recurring themes: time-restricted eating, omega-3 bioavailability, and the gut-brain axis. Connections added to your knowledge graph.",
    source: "Knowledge Curator Agent",
    sourceDomain: "agent.local",
    publishedAt: "Yesterday",
    tags: ["Health", "Longevity", "Research"],
    readTimeMin: 4,
    agentNote: "Curated from your saved articles and reading history.",
  },
  {
    id: "c8",
    category: "news",
    title: "EU finalises digital identity wallet rollout timeline",
    summary:
      "Member states have agreed on a phased implementation ending in Q3 2026, with interoperability standards published for private-sector integrators. Cross-border authentication will use a unified eIDAS 2.0 profile.",
    source: "EuroPolicy Watch",
    sourceDomain: "europolicywatch.example",
    publishedAt: "8 hours ago",
    tags: ["World", "Privacy", "Policy"],
    readTimeMin: 5,
    agentNote: "Relevant to your interest in digital identity and privacy.",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<FeedCategory, string> = {
  all: "All",
  news: "News",
  videos: "Videos & Articles",
  research: "Research Digests",
};

const CATEGORY_ACCENT: Record<FeedCategory, string> = {
  all: "text-on-surface",
  news: "text-sky-700",
  videos: "text-fuchsia-700",
  research: "text-emerald-700",
};

const CARD_BORDER: Record<FeedCard["category"], string> = {
  news: "border-sky-200/70",
  videos: "border-fuchsia-200/70",
  research: "border-emerald-200/70",
};

const CARD_TAG_BG: Record<FeedCard["category"], string> = {
  news: "bg-sky-50 text-sky-700",
  videos: "bg-fuchsia-50 text-fuchsia-700",
  research: "bg-emerald-50 text-emerald-700",
};

const CARD_GLYPH: Record<FeedCard["category"], string> = {
  news: "📰",
  videos: "▶",
  research: "🔬",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const FEED_AGENTS = [
  { id: "knowledge_curator",   label: "Knowledge Curator",   desc: "Indexes your notes and surfaces relevant connections." },
  { id: "research_assistant",  label: "Research Assistant",  desc: "Synthesises papers and articles into weekly digests." },
  { id: "news_scout",          label: "News Scout",          desc: "Monitors topics you follow and surfaces relevant news." },
];

export function DiscoverView(props: { isDemo?: boolean }) {
  const [activeCategory, setActiveCategory] = createSignal<FeedCategory>("all");
  const [agentsConfigured] = createSignal(false); // set true when real agents push cards
  const [loading, setLoading] = createSignal(true);
  const [showFeedConfig, setShowFeedConfig] = createSignal(false);
  const [enabledAgents, setEnabledAgents] = createSignal<Set<string>>(
    new Set(["knowledge_curator", "research_assistant"])
  );

  onMount(() => {
    // Simulate async feed load — replace with real AFP subscription when agents are active
    const t = setTimeout(() => setLoading(false), 450);
    return () => clearTimeout(t);
  });

  const visibleCards = createMemo(() => {
    const cat = activeCategory();
    if (cat === "all") return MOCK_CARDS;
    return MOCK_CARDS.filter((c) => c.category === cat);
  });
  const isPreview = createMemo(() => props.isDemo || !agentsConfigured());

  return (
    <div class="view-enter flex flex-col gap-0" style="min-height: calc(100vh - 8em);">

      {/* Header bar */}
      <div class="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-xl font-bold text-on-surface tracking-tight">Discover</h1>
          <p class="mt-0.5 text-sm text-on-surface-variant">
            <Show
              when={isPreview()}
              fallback={<>Your private, agent-curated feed. Zero ads. Zero tracking. Fully E2EE.</>}
            >
              {props.isDemo
                ? "Demo preview of an agent-curated private feed. Sign in to replace these sample cards with your own sources and agents."
                : "Preview feed. Real private feed delivery starts once your curation agents are active and publishing live cards here."}
            </Show>
          </p>
        </div>

        {/* Privacy badge */}
        <Show
          when={isPreview()}
          fallback={
            <div class="flex items-center gap-2 rounded-2xl border border-emerald-200/70 bg-emerald-50/80 px-3.5 py-2 text-xs text-emerald-700 shadow-sm">
              <span class="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span class="font-semibold">E2EE · No ads · Agent-controlled</span>
            </div>
          }
        >
          <div class="flex items-center gap-2 rounded-2xl border border-amber-200/70 bg-amber-50/80 px-3.5 py-2 text-xs text-amber-700 shadow-sm">
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span class="font-semibold">Demo preview · Sample cards · Agent-style feed</span>
          </div>
        </Show>
      </div>

      {/* Category tabs */}
      <div class="mb-5 flex flex-wrap items-center gap-1.5">
        <For each={Object.keys(CATEGORY_LABELS) as FeedCategory[]}>
          {(cat) => (
            <button
              type="button"
              class={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                activeCategory() === cat
                  ? "border-primary/40 bg-primary text-white shadow-sm"
                  : "border-white/50 bg-white/60 text-on-surface-variant hover:bg-white/80 hover:text-on-surface"
              }`}
              onClick={() => setActiveCategory(cat)}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          )}
        </For>

        <div class="ml-auto flex items-center gap-2">
          <span class="text-[11px] text-on-surface-variant">
            {isPreview() ? "Agent-curated preview" : "Powered by your agents"}
          </span>
          <button
            type="button"
            onClick={() => setShowFeedConfig((v) => !v)}
            class={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
              showFeedConfig()
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-white/50 bg-white/60 text-on-surface-variant hover:bg-white/80"
            }`}
            title="Configure which agents curate your feed"
          >
            {showFeedConfig() ? "Done" : "Configure feed"}
          </button>
        </div>
      </div>

      {/* Feed config panel — shown when "Configure feed" is open */}
      <Show when={showFeedConfig()}>
        <div class="mb-5 rounded-[22px] border border-primary/20 bg-white/80 px-5 py-4 shadow-soft animate-fade-in backdrop-blur-sm">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Curating agents</p>
          <p class="mt-1 mb-3 text-[11px] text-on-surface-variant">
            Toggle which agents contribute to your feed. Changes take effect on the next agent run.
          </p>
          <div class="space-y-2">
            <For each={FEED_AGENTS}>
              {(agent) => {
                const enabled = () => enabledAgents().has(agent.id);
                return (
                  <button
                    type="button"
                    onClick={() => setEnabledAgents((prev) => {
                      const next = new Set(prev);
                      if (next.has(agent.id)) next.delete(agent.id);
                      else next.add(agent.id);
                      return next;
                    })}
                    class={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                      enabled()
                        ? "border-primary/30 bg-primary/8"
                        : "border-white/40 bg-white/40 hover:bg-white/60"
                    }`}
                  >
                    <span class={`mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border-2 transition ${
                      enabled() ? "border-primary bg-primary" : "border-slate-300 bg-white"
                    }`} />
                    <div>
                      <p class={`text-xs font-semibold ${enabled() ? "text-primary" : "text-on-surface"}`}>
                        {agent.label}
                      </p>
                      <p class="mt-0.5 text-[10px] text-on-surface-variant">{agent.desc}</p>
                    </div>
                  </button>
                );
              }}
            </For>
          </div>
        </div>
      </Show>

      {/* Agent setup prompt (shown until agents are configured) */}
      <Show when={isPreview()}>
        <div class="mb-5 rounded-[22px] border border-amber-200/70 bg-amber-50/80 px-5 py-4 shadow-soft">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
            {props.isDemo ? "Demo feed preview" : "Feed preview"}
          </p>
          <p class="mt-1 text-sm text-amber-900">
            <Show
              when={props.isDemo}
              fallback={
                <>
                  You're seeing sample cards. To get your real private feed, activate the{" "}
                  <span class="font-semibold">Knowledge Curator</span> and{" "}
                  <span class="font-semibold">Research Assistant</span> agents from the{" "}
                  <span class="font-semibold">Automations</span> tab. Once running, they'll push
                  personalised cards here in real time — no algorithms, no advertisers.
                </>
              }
            >
              You're seeing sample cards only. Sign in and activate the{" "}
              <span class="font-semibold">Knowledge Curator</span> and{" "}
              <span class="font-semibold">Research Assistant</span> agents to replace this preview
              with your own private feed.
            </Show>
          </p>
        </div>
      </Show>

      {/* Skeleton loading state */}
      <Show when={loading()}>
        <div class="skeleton-crossfade grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <For each={Array(6).fill(0)}>
            {() => (
              <div class="flex flex-col rounded-[22px] border border-slate-200/70 bg-white/60 p-5 space-y-3 animate-pulse">
                <div class="flex items-center gap-2">
                  <div class="h-5 w-5 rounded-full bg-slate-200" />
                  <div class="h-3 w-20 rounded-full bg-slate-200" />
                </div>
                <div class="h-4 w-full rounded-full bg-slate-200" />
                <div class="h-3 w-5/6 rounded-full bg-slate-200" />
                <div class="h-3 w-4/6 rounded-full bg-slate-200" />
                <div class="mt-1 h-8 rounded-xl bg-violet-100/70" />
                <div class="flex gap-1.5">
                  <div class="h-4 w-12 rounded-full bg-slate-200" />
                  <div class="h-4 w-16 rounded-full bg-slate-200" />
                </div>
              </div>
            )}
          </For>
        </div>
        <p class="mt-4 text-center text-xs text-on-surface-variant animate-pulse">
          Loading your agent-curated feed…
        </p>
      </Show>

      {/* Feed grid */}
      <Show when={!loading()}>
        <div class="content-crossfade grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <For each={visibleCards()}>
            {(card) => (
              <article
                class={`flex flex-col rounded-[22px] border bg-white/88 p-5 shadow-soft backdrop-blur-sm transition hover:shadow-md ${CARD_BORDER[card.category]}`}
              >
                {/* Card header */}
                <div class="mb-3 flex items-start justify-between gap-3">
                  <div class="flex items-center gap-2">
                    <span class="text-xl select-none" aria-hidden>{CARD_GLYPH[card.category]}</span>
                    <div>
                      <p class={`text-[10px] font-bold uppercase tracking-[0.18em] ${CATEGORY_ACCENT[card.category]}`}>
                        {CATEGORY_LABELS[card.category]}
                      </p>
                      <p class="text-[11px] text-on-surface-variant">{card.source}</p>
                    </div>
                  </div>
                  <span class="shrink-0 text-[11px] text-on-surface-variant">{card.publishedAt}</span>
                </div>

                {/* Title & summary */}
                <h2 class="mb-2 text-sm font-semibold leading-snug text-on-surface line-clamp-2">
                  {card.title}
                </h2>
                <p class="flex-1 text-[12px] leading-5 text-on-surface-variant line-clamp-4">
                  {card.summary}
                </p>

                {/* Agent rationale — always visible, reinforces agent-first value */}
                <div class="mt-3 rounded-xl border border-violet-200/60 bg-violet-50/70 px-3 py-2">
                  <p class="text-[10px] leading-4 text-violet-700">
                    <span class="font-semibold">Why surfaced: </span>
                    {card.agentNote ?? "Matched based on your saved interests and topics."}
                  </p>
                </div>

                {/* Tags */}
                <div class="mt-3 flex flex-wrap gap-1.5">
                  <For each={card.tags}>
                    {(tag) => (
                      <span class={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CARD_TAG_BG[card.category]}`}>
                        {tag}
                      </span>
                    )}
                  </For>
                  <Show when={card.readTimeMin}>
                    <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                      {card.readTimeMin} min
                    </span>
                  </Show>
                </div>

                {/* Footer actions */}
                <div class="mt-4 flex items-center justify-between border-t border-black/5 pt-3">
                  <Show when={card.originalUrl} fallback={
                    <span class="text-[11px] text-on-surface-variant/60 italic">Original link via agent</span>
                  }>
                    <a
                      href={safeHref(card.originalUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
                    >
                      Open Original →
                    </a>
                  </Show>
                  <button
                    type="button"
                    class="rounded-full border border-white/50 bg-white/60 px-3 py-1 text-[10px] font-medium text-on-surface-variant transition hover:bg-white/85"
                    title="Save to Notes"
                  >
                    Save
                  </button>
                </div>
              </article>
            )}
          </For>
        </div>
      </Show>

      {/* Load more hint */}
      <div class="mt-8 pb-6 text-center">
        <p class="text-xs text-on-surface-variant">
          <Show
            when={isPreview()}
            fallback={
              <>
                Your agents deliver new cards automatically.{" "}
                <span class="font-medium text-primary">More cards appear as agents run.</span>
              </>
            }
          >
            This preview stays static until your curation agents are active.{" "}
            <span class="font-medium text-primary">Live cards appear here once those agents start publishing.</span>
          </Show>
        </p>
      </div>
    </div>
  );
}
