/**
 * DiscoverView — Private Media & Knowledge Feed
 *
 * A personal, ad-free, E2EE feed curated by your own agents.
 * Surfaces summarised news, recommended videos/articles, and research digests
 * as rich agent-generated cards with "Open Original" links.
 */

import { createSignal, createMemo, For, Show } from "solid-js";

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

export function DiscoverView() {
  const [activeCategory, setActiveCategory] = createSignal<FeedCategory>("all");
  const [agentsConfigured] = createSignal(false); // set true when real agents push cards

  const visibleCards = createMemo(() => {
    const cat = activeCategory();
    if (cat === "all") return MOCK_CARDS;
    return MOCK_CARDS.filter((c) => c.category === cat);
  });

  return (
    <div class="view-enter flex flex-col gap-0" style="min-height: calc(100vh - 8em);">

      {/* Header bar */}
      <div class="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-xl font-bold text-on-surface tracking-tight">Discover</h1>
          <p class="mt-0.5 text-sm text-on-surface-variant">
            Your private, agent-curated feed. Zero ads. Zero tracking. Fully E2EE.
          </p>
        </div>

        {/* Privacy badge */}
        <div class="flex items-center gap-2 rounded-2xl border border-emerald-200/70 bg-emerald-50/80 px-3.5 py-2 text-xs text-emerald-700 shadow-sm">
          <span class="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span class="font-semibold">E2EE · No ads · Agent-controlled</span>
        </div>
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
          <span class="text-[11px] text-on-surface-variant">Powered by your agents</span>
          <button
            type="button"
            class="rounded-full border border-white/50 bg-white/60 px-3 py-1 text-[11px] font-medium text-on-surface-variant transition hover:bg-white/80"
            title="Configure which agents curate your feed"
          >
            Configure feed
          </button>
        </div>
      </div>

      {/* Agent setup prompt (shown until agents are configured) */}
      <Show when={!agentsConfigured()}>
        <div class="mb-5 rounded-[22px] border border-amber-200/70 bg-amber-50/80 px-5 py-4 shadow-soft">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Feed preview</p>
          <p class="mt-1 text-sm text-amber-900">
            You're seeing sample cards. To get your real private feed, activate the{" "}
            <span class="font-semibold">Knowledge Curator</span> and{" "}
            <span class="font-semibold">Research Assistant</span> agents from the{" "}
            <span class="font-semibold">Automations</span> tab. Once running, they'll push
            personalised cards here in real time — no algorithms, no advertisers.
          </p>
        </div>
      </Show>

      {/* Feed grid */}
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

              {/* Agent note */}
              <Show when={card.agentNote}>
                <div class="mt-3 rounded-xl border border-violet-200/60 bg-violet-50/70 px-3 py-2">
                  <p class="text-[10px] leading-4 text-violet-700">
                    <span class="font-semibold">Agent note: </span>{card.agentNote}
                  </p>
                </div>
              </Show>

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
                    href={card.originalUrl}
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

      {/* Load more hint */}
      <div class="mt-8 pb-6 text-center">
        <p class="text-xs text-on-surface-variant">
          Your agents deliver new cards automatically.{" "}
          <span class="font-medium text-primary">More cards appear as agents run.</span>
        </p>
      </div>
    </div>
  );
}
