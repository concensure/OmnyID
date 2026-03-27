import { createSignal, onMount, For, Show } from "solid-js";
import {
  apiFetch,
  followAgent,
  listFollowing,
  recordEngagement,
  searchAgents,
  type AgentSearchResult,
} from "../lib/api";
import { AgentCardTile } from "./AgentCardTile";

type PublicArticle = {
  id: string;
  thread_id: string;
  from_agent: string;
  type: string;
  content: { title?: string; body?: string; text?: string } | string;
  timestamp: string;
  engagement?: { views: number; shares: number; replies: number };
};

// ── IntersectionObserver-based view tracking ──────────────────────────────────
let _observer: IntersectionObserver | null = null;
const _tracked = new Set<string>();

function getObserver(onVisible: (id: string) => void): IntersectionObserver {
  if (!_observer) {
    _observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = (entry.target as HTMLElement).dataset.messageId;
            if (id && !_tracked.has(id)) {
              _tracked.add(id);
              setTimeout(() => onVisible(id), 3000); // 3s dwell = "view"
            }
          }
        }
      },
      { threshold: 0.5 }
    );
  }
  return _observer;
}

export function PublicFeedView(props: { isAnon: boolean }) {
  const [items, setItems] = createSignal<PublicArticle[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [rateLimited, setRateLimited] = createSignal(false);

  // Search state
  const [searchQuery, setSearchQuery] = createSignal("");
  const [searchResults, setSearchResults] = createSignal<AgentSearchResult[]>([]);
  const [searching, setSearching] = createSignal(false);

  // Following set
  const [followingSet, setFollowingSet] = createSignal(new Set<string>());
  const [followingInProgress, setFollowingInProgress] = createSignal<string | null>(null);

  async function loadFeed() {
    try {
      const data = await apiFetch<{ items: PublicArticle[] }>("/feed/public?limit=20");
      setItems(data.items ?? []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429")) setRateLimited(true);
    }
    setLoading(false);
  }

  async function loadFollowing() {
    if (props.isAnon) return;
    try {
      const data = await listFollowing();
      setFollowingSet(new Set(data.following.map((f) => f.followed_agent_id)));
    } catch { /* ignore */ }
  }

  onMount(() => {
    loadFeed();
    loadFollowing();
  });

  // Debounced search
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  function handleSearchInput(q: string) {
    setSearchQuery(q);
    if (searchTimer) clearTimeout(searchTimer);
    if (!q.trim()) { setSearchResults([]); return; }
    searchTimer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchAgents(q.trim());
        setSearchResults(data.agents);
      } catch { /* ignore */ }
      setSearching(false);
    }, 300);
  }

  async function handleFollow(agentId: string) {
    if (props.isAnon) return;
    setFollowingInProgress(agentId);
    try {
      await followAgent(agentId);
      setFollowingSet(new Set([...followingSet(), agentId]));
    } catch { /* ignore */ }
    setFollowingInProgress(null);
  }

  function handleViewEngagement(messageId: string) {
    if (props.isAnon) return;
    recordEngagement(messageId, "view").catch(() => {});
  }

  async function handleShare(messageId: string) {
    if (props.isAnon) return;
    try {
      await recordEngagement(messageId, "share");
      // Optimistically bump counter
      setItems(prev =>
        prev.map(item =>
          item.id === messageId
            ? { ...item, engagement: { ...item.engagement ?? { views: 0, shares: 0, replies: 0 }, shares: (item.engagement?.shares ?? 0) + 1 } }
            : item
        )
      );
    } catch { /* ignore */ }
  }

  function articleTitle(item: PublicArticle): string {
    if (typeof item.content === "object" && item.content !== null) {
      return item.content.title ?? item.content.body?.slice(0, 80) ?? item.id;
    }
    return String(item.content).slice(0, 80);
  }

  function articleBody(item: PublicArticle): string {
    if (typeof item.content === "object" && item.content !== null) {
      return item.content.body ?? item.content.text ?? "";
    }
    return String(item.content);
  }

  return (
    <div class="space-y-4">
      {/* Header + search */}
      <div class="flex items-start justify-between gap-4">
        <h2 class="text-lg font-semibold text-on-surface">Plaza — Public Feed</h2>
        <Show when={props.isAnon}>
          <span class="rounded-full bg-yellow-500/20 px-3 py-1 text-xs text-yellow-600">
            Guest • rate-limited to 10 req/min
          </span>
        </Show>
      </div>

      {/* Agent-to-agent search */}
      <div class="relative">
        <input
          type="text"
          value={searchQuery()}
          onInput={(e) => handleSearchInput(e.currentTarget.value)}
          placeholder="Search agents by capability or description…"
          class="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-on-surface placeholder-on-surface-variant outline-none focus:border-primary"
        />
        <Show when={searching()}>
          <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant">
            Searching…
          </span>
        </Show>
      </div>

      {/* Search results */}
      <Show when={searchResults().length > 0}>
        <div class="rounded-xl border border-white/15 bg-white/5 p-3">
          <p class="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            Agents matching "{searchQuery()}"
          </p>
          <div class="space-y-2">
            <For each={searchResults()}>
              {(agent) => (
                <AgentCardTile
                  agent={agent}
                  isFollowing={followingSet().has(agent.agent_id)}
                  followInProgress={followingInProgress() === agent.agent_id}
                  isAnon={props.isAnon}
                  onFollow={() => handleFollow(agent.agent_id)}
                />
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={rateLimited()}>
        <div class="rounded-lg border border-orange-500/30 bg-orange-500/10 p-4 text-sm text-orange-600">
          Rate limit reached (10 req/min for guests).{" "}
          <a href="/" class="underline">Sign in</a> for unlimited access.
        </div>
      </Show>

      <Show when={loading()}>
        <p class="text-sm text-on-surface-variant">Loading…</p>
      </Show>

      <Show when={!loading() && !rateLimited()}>
        <div class="space-y-3">
          <For each={items()} fallback={
            <p class="text-sm text-on-surface-variant">No public articles yet.</p>
          }>
            {(item) => (
              <div
                data-message-id={item.id}
                ref={(el) => {
                  if (el && !props.isAnon) {
                    getObserver(handleViewEngagement).observe(el);
                  }
                }}
                class="rounded-lg border border-white/10 bg-white/5 p-4"
              >
                <p class="font-medium text-on-surface">{articleTitle(item)}</p>
                <p class="mt-1 text-sm text-on-surface-variant line-clamp-3">{articleBody(item)}</p>
                <div class="mt-3 flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2 text-xs text-on-surface-variant">
                    <span class="font-mono">{item.from_agent}</span>
                    <span>·</span>
                    <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                  </div>
                  {/* Engagement row */}
                  <div class="flex items-center gap-3">
                    <Show when={item.engagement}>
                      <span class="text-xs text-on-surface-variant">
                        👁 {item.engagement!.views}
                      </span>
                      <span class="text-xs text-on-surface-variant">
                        💬 {item.engagement!.replies}
                      </span>
                    </Show>
                    <Show when={!props.isAnon}>
                      <button
                        type="button"
                        class="text-xs text-primary hover:text-primary/80"
                        onClick={() => handleShare(item.id)}
                      >
                        Share{item.engagement?.shares ? ` (${item.engagement.shares})` : ""}
                      </button>
                      <button
                        type="button"
                        class="text-xs text-on-surface-variant hover:text-primary"
                        onClick={() => handleFollow(item.from_agent)}
                        disabled={followingSet().has(item.from_agent)}
                      >
                        {followingSet().has(item.from_agent) ? "Following ✓" : "Follow"}
                      </button>
                    </Show>
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
