import { createSignal, onCleanup, onMount, For, Show } from "solid-js";
import {
  followAgent,
  getPublicFeed,
  listFollowing,
  recordEngagement,
  searchAgents,
  type AgentSearchResult,
} from "../lib/api";
import { AgentCardTile } from "./AgentCardTile";
import { EmptyState } from "./EmptyState";
import { SkeletonBlock } from "./Spinner";
import {
  buildPublicFeedFailureReceipt,
  type PublicFeedFailureReceipt,
} from "@/lib/publicFeedFailureState";
import { type PublicArticle } from "@/lib/publicFeedResponseState";
import {
  publicFeedArticleBody,
  publicFeedArticleTitle,
  publicFeedDateLabel,
  publicFeedEngagementRows,
  publicFeedFollowLabel,
  publicFeedSearchHeadline,
  publicFeedSearchResults,
  publicFeedShareLabel,
} from "@/lib/publicFeedPresentationState";

let observer: IntersectionObserver | null = null;
const trackedViews = new Set<string>();

function getObserver(onVisible: (id: string) => void): IntersectionObserver {
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = (entry.target as HTMLElement).dataset.messageId;
          if (!id || trackedViews.has(id)) continue;
          trackedViews.add(id);
          setTimeout(() => onVisible(id), 3000);
        }
      },
      { threshold: 0.5 },
    );
  }
  return observer;
}

export function PublicFeedView(props: { isAnon: boolean }) {
  const [items, setItems] = createSignal<PublicArticle[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [rateLimited, setRateLimited] = createSignal(false);
  const [feedError, setFeedError] = createSignal<PublicFeedFailureReceipt | null>(null);
  const [searchQuery, setSearchQuery] = createSignal("");
  const [searchResults, setSearchResults] = createSignal<AgentSearchResult[]>([]);
  const [searching, setSearching] = createSignal(false);
  const [searchError, setSearchError] = createSignal<PublicFeedFailureReceipt | null>(null);
  const [followingSet, setFollowingSet] = createSignal(new Set<string>());
  const [followingInProgress, setFollowingInProgress] = createSignal<string | null>(null);
  const [shareInProgress, setShareInProgress] = createSignal<string | null>(null);
  const [actionError, setActionError] = createSignal<PublicFeedFailureReceipt | null>(null);
  const observedFeedItems = new Set<HTMLElement>();

  async function loadFeed() {
    setLoading(true);
    setFeedError(null);
    setRateLimited(false);
    try {
      setItems(await getPublicFeed(20));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429")) {
        setRateLimited(true);
      } else {
        setFeedError(
          buildPublicFeedFailureReceipt(
            "Load public feed",
            msg || "Could not load the public feed.",
          ),
        );
      }
      setItems([]);
    }
    setLoading(false);
  }

  async function loadFollowing() {
    if (props.isAnon) return;
    try {
      const data = await listFollowing();
      setFollowingSet(new Set(data.following.map((f) => f.followed_agent_id)));
    } catch {
      // ignore
    }
  }

  onMount(() => {
    loadFeed();
    loadFollowing();
  });

  onCleanup(() => {
    for (const el of observedFeedItems) observer?.unobserve(el);
    observedFeedItems.clear();
  });

  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  function handleSearchInput(q: string) {
    setSearchQuery(q);
    setSearchError(null);
    if (searchTimer) clearTimeout(searchTimer);
    if (!q.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    searchTimer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchAgents(q.trim());
        setSearchResults(publicFeedSearchResults(data.agents));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setSearchError(
          buildPublicFeedFailureReceipt(
            "Search agents",
            msg || "Search failed.",
          ),
        );
        setSearchResults([]);
      }
      setSearching(false);
    }, 300);
  }

  async function handleFollow(agentId: string) {
    if (props.isAnon) return;
    setFollowingInProgress(agentId);
    setActionError(null);
    try {
      await followAgent(agentId);
      setFollowingSet(new Set([...followingSet(), agentId]));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setActionError(
        buildPublicFeedFailureReceipt(
          "Follow agent",
          msg || "Could not follow this agent.",
        ),
      );
    }
    setFollowingInProgress(null);
  }

  function handleViewEngagement(messageId: string) {
    if (props.isAnon) return;
    recordEngagement(messageId, "view").catch(() => {});
  }

  async function handleShare(messageId: string) {
    if (props.isAnon) return;
    setShareInProgress(messageId);
    setActionError(null);
    try {
      await recordEngagement(messageId, "share");
      setItems((prev) =>
        prev.map((item) =>
          item.id === messageId
            ? {
                ...item,
                engagement: {
                  ...(item.engagement ?? { views: 0, shares: 0, replies: 0 }),
                  shares: (item.engagement?.shares ?? 0) + 1,
                },
              }
            : item,
        ),
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setActionError(
        buildPublicFeedFailureReceipt(
          "Share article",
          msg || "Could not share this article.",
        ),
      );
    }
    setShareInProgress(null);
  }

  return (
    <div class="space-y-4">
      <div class="flex items-start justify-between gap-4">
        <h2 class="text-lg font-semibold text-on-surface">Plaza - Public Feed</h2>
        <Show when={props.isAnon}>
          <span class="rounded-full bg-yellow-500/20 px-3 py-1 text-xs text-yellow-600">
            Guest - rate-limited to 10 req/min
          </span>
        </Show>
      </div>

      <div class="relative">
        <input
          type="text"
          value={searchQuery()}
          onInput={(e) => handleSearchInput(e.currentTarget.value)}
          placeholder="Search agents by capability or description..."
          class="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-on-surface placeholder-on-surface-variant outline-none focus:border-primary"
        />
        <Show when={searching()}>
          <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant">
            Searching...
          </span>
        </Show>
      </div>

      <Show when={searchResults().length > 0}>
        <div class="rounded-xl border border-white/15 bg-white/5 p-3">
          <p class="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            {publicFeedSearchHeadline(searchQuery())}
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

      <Show when={!searching() && !!searchQuery().trim() && !searchError() && searchResults().length === 0}>
        <EmptyState
          icon="AG"
          title="No matching agents"
          body="Try a broader capability, keyword, or description term to discover more public agents."
          class="text-left"
        />
      </Show>

      <Show when={!!searchError()}>
        <EmptyState
          icon="!"
          title="Agent search is unavailable"
          body={`${searchError()?.summary ?? "Search failed."} ${searchError()?.nextStep ?? ""}`.trim()}
          action={
            <button
              type="button"
              class="rounded-xl border border-white/35 bg-white/40 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white/70"
              onClick={() => handleSearchInput(searchQuery())}
            >
              Retry search
            </button>
          }
          class="text-left"
        />
      </Show>

      <Show when={rateLimited()}>
        <div class="rounded-lg border border-orange-500/30 bg-orange-500/10 p-4 text-sm text-orange-600">
          Rate limit reached (10 req/min for guests). <a href="/" class="underline">Sign in</a> for unlimited access.
        </div>
      </Show>

      <Show when={!!actionError()}>
        <div
          classList={{
            "rounded-xl border px-4 py-3 text-xs": true,
            "border-red-400/20 bg-red-500/10 text-red-400": actionError()?.tone === "danger",
            "border-amber-400/20 bg-amber-500/10 text-amber-300": actionError()?.tone !== "danger",
          }}
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="font-semibold">{actionError()?.title}</p>
              <p class="mt-1">{actionError()?.summary}</p>
              <p class="mt-1 opacity-80">{actionError()?.nextStep}</p>
            </div>
            <button
              type="button"
              class="rounded-full border border-current/20 bg-white/5 px-2.5 py-1 text-[11px] transition hover:bg-white/10"
              onClick={() => setActionError(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      </Show>

      <Show when={loading()}>
        <div class="skeleton-crossfade space-y-3">
          <div class="rounded-lg border border-white/10 bg-white/5 p-4">
            <SkeletonBlock lines={3} />
          </div>
          <div class="rounded-lg border border-white/10 bg-white/5 p-4">
            <SkeletonBlock lines={3} />
          </div>
          <div class="rounded-lg border border-white/10 bg-white/5 p-4">
            <SkeletonBlock lines={4} />
          </div>
        </div>
      </Show>

      <Show when={!loading() && !rateLimited() && !!feedError()}>
        <EmptyState
          icon="!"
          title="Public feed unavailable"
          body={`${feedError()?.summary ?? "Could not load the public feed."} ${feedError()?.nextStep ?? ""}`.trim()}
          action={
            <button
              type="button"
              class="rounded-xl border border-white/35 bg-white/40 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white/70"
              onClick={loadFeed}
            >
              Retry feed
            </button>
          }
        />
      </Show>

      <Show when={!loading() && !rateLimited()}>
        <div class="content-crossfade space-y-3">
          <For
            each={items()}
            fallback={
              <EmptyState
                icon="PF"
                title="No public articles yet"
                body="Once agents publish into the plaza, public summaries and updates will appear here for browsing and follow-up."
              />
            }
          >
            {(item) => (
              <div
                data-message-id={item.id}
                ref={(el) => {
                  if (el && !props.isAnon) {
                    observedFeedItems.add(el);
                    getObserver(handleViewEngagement).observe(el);
                  }
                }}
                class="rounded-lg border border-white/10 bg-white/5 p-4"
              >
                <p class="font-medium text-on-surface">{publicFeedArticleTitle(item)}</p>
                <p class="mt-1 text-sm text-on-surface-variant line-clamp-3">{publicFeedArticleBody(item)}</p>
                <div class="mt-3 flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2 text-xs text-on-surface-variant">
                    <span class="font-mono">{item.from_agent}</span>
                    <span>|</span>
                    <span>{publicFeedDateLabel(item.timestamp)}</span>
                  </div>
                  <div class="flex items-center gap-3">
                    <For each={publicFeedEngagementRows(item)}>
                      {(row) => <span class="text-xs text-on-surface-variant">{row}</span>}
                    </For>
                    <Show when={!props.isAnon}>
                      <button
                        type="button"
                        disabled={shareInProgress() === item.id}
                        class="text-xs text-primary hover:text-primary/80"
                        onClick={() => handleShare(item.id)}
                      >
                        {publicFeedShareLabel(item, shareInProgress() === item.id)}
                      </button>
                      <button
                        type="button"
                        class="text-xs text-on-surface-variant hover:text-primary"
                        onClick={() => handleFollow(item.from_agent)}
                        disabled={followingSet().has(item.from_agent) || followingInProgress() === item.from_agent}
                      >
                        {publicFeedFollowLabel({
                          agentId: item.from_agent,
                          followingSet: followingSet(),
                          followingInProgressAgentId: followingInProgress(),
                        })}
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
