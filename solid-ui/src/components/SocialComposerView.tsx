// @locs-version: 1.0
import { createEffect, createSignal, For, onMount, Show } from "solid-js";
import { fetchSocialSuggestions, listSocialPosts, publishSocialPost } from "@/lib/api";
import type { EditorPayload } from "@/lib/editorPayload";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import {
  buildSocialComposerFailureReceipt,
  type SocialComposerFailureReceipt,
} from "@/lib/socialComposerFailureState";
import {
  socialComposerDefaultSuggestions,
  socialComposerEditorSubmitLabel,
  socialComposerInteractionLocked,
  socialComposerPublishLabel,
} from "@/lib/socialComposerViewState";
import {
  type SocialComposerPlatform,
  type SocialComposerPost,
  type SocialComposerSuggestion,
} from "@/lib/socialComposerResponseState";

// ── Platform definitions ──────────────────────────────────────────────────────

type Platform = SocialComposerPlatform;

const PLATFORMS: Array<{
  id: Platform;
  label: string;
  icon: string;
  charLimit: number;
  colorClass: string;
  accentClass: string;
  previewClass: string;
  url: string;
}> = [
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: "in",
    charLimit: 3000,
    colorClass: "text-[#0077b5]",
    accentClass: "bg-[#0077b5]",
    previewClass: "border-[#0077b5]/20 bg-[#0077b5]/4",
    url: "https://www.linkedin.com/post/new",
  },
  {
    id: "x",
    label: "X",
    icon: "𝕏",
    charLimit: 280,
    colorClass: "text-black",
    accentClass: "bg-black",
    previewClass: "border-black/10 bg-black/3",
    url: "https://x.com/compose/post",
  },
  {
    id: "bluesky",
    label: "Bluesky",
    icon: "🦋",
    charLimit: 300,
    colorClass: "text-[#0085ff]",
    accentClass: "bg-[#0085ff]",
    previewClass: "border-[#0085ff]/20 bg-[#0085ff]/4",
    url: "https://bsky.app",
  },
];

// ── Suggestion types ──────────────────────────────────────────────────────────

type AgentSuggestion = SocialComposerSuggestion;
type SocialPost = SocialComposerPost;

// ── Helpers ───────────────────────────────────────────────────────────────────

function charColor(used: number, limit: number): string {
  const pct = used / limit;
  if (pct >= 1) return "text-red-500";
  if (pct >= 0.9) return "text-amber-500";
  return "text-on-surface-variant/60";
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function platformBadge(platform: Platform): string {
  switch (platform) {
    case "linkedin":
      return "in";
    case "x":
      return "X";
    case "bluesky":
      return "BS";
  }
}

// ── Platform preview ──────────────────────────────────────────────────────────

function PlatformPreview(props: {
  platform: (typeof PLATFORMS)[number];
  content: string;
}) {
  const p = () => props.platform;
  const words = () => props.content.split(/\s+/).filter(Boolean);
  const hashtags = () => words().filter((w) => w.startsWith("#"));
  const mentions = () => words().filter((w) => w.startsWith("@"));
  const charCount = () => props.content.length;

  return (
    <div
      class={`rounded-2xl border p-4 space-y-3 ${p().previewClass}`}
    >
      {/* Profile mock row */}
      <div class="flex items-center gap-3">
        <div class="h-9 w-9 rounded-full bg-on-surface-variant/15 flex items-center justify-center text-xs font-bold text-on-surface-variant">
          You
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-on-surface leading-tight">Your Name</p>
          <p class="text-xs text-on-surface-variant">
            {p().id === "linkedin"
              ? "Your headline - Just now"
              : p().id === "x"
              ? "@yourhandle - now"
              : "@you.bsky.social - now"}
          </p>
        </div>
        <span class={`text-xs font-bold ${p().colorClass}`}>{platformBadge(p().id)}</span>
      </div>

      {/* Content */}
      <div class="text-sm text-on-surface leading-relaxed whitespace-pre-wrap break-words min-h-[40px]">
        <Show
          when={props.content.trim()}
          fallback={
            <span class="text-on-surface-variant/40 italic">
              Start typing to preview your post...
            </span>
          }
        >
          {props.content}
        </Show>
      </div>

      {/* Meta row */}
      <Show when={props.content.trim()}>
        <div class="flex flex-wrap items-center gap-3 border-t border-black/[0.06] pt-2">
          <Show when={hashtags().length > 0}>
            <div class="flex flex-wrap gap-1">
              <For each={hashtags()}>
                {(tag) => (
                  <span class={`text-xs font-medium ${p().colorClass}`}>{tag}</span>
                )}
              </For>
            </div>
          </Show>
          <Show when={mentions().length > 0}>
            <div class="flex flex-wrap gap-1">
              <For each={mentions()}>
                {(m) => (
                  <span class={`text-xs font-medium ${p().colorClass}`}>{m}</span>
                )}
              </For>
            </div>
          </Show>
          <span class={`ml-auto text-xs ${charColor(charCount(), p().charLimit)}`}>
            {charCount()} / {p().charLimit}
          </span>
        </div>

        {/* Engagement mock buttons */}
        <div class="flex items-center gap-4 text-on-surface-variant/50 text-xs">
          <span>[Like]</span>
          <span>[Comment]</span>
          <span>[Repost]</span>
          <span>[Share]</span>
        </div>
      </Show>
    </div>
  );
}

// ── Agent suggestion card ─────────────────────────────────────────────────────

function SuggestionCard(props: {
  suggestion: AgentSuggestion;
  onApply: (s: AgentSuggestion) => void;
  disabled?: boolean;
}) {
  const kindMeta: Record<AgentSuggestion["kind"], { icon: string; label: string }> = {
    tone:    { icon: "Tone", label: "Tone" },
    hashtag: { icon: "#",   label: "Hashtags" },
    timing:  { icon: "Time",  label: "Best time" },
    rewrite: { icon: "Edit", label: "Rewrite" },
  };
  const meta = () => kindMeta[props.suggestion.kind];

  return (
    <div class="rounded-xl border border-outline-variant/60 bg-white/70 p-3 space-y-2">
      <div class="flex items-center gap-2">
        <span class="text-base leading-none">{meta().icon}</span>
        <span class="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
          {meta().label}
        </span>
      </div>
      <p class="text-xs leading-5 text-on-surface">{props.suggestion.body}</p>
      <Show when={props.suggestion.action}>
        <button
          type="button"
          disabled={props.disabled}
          onClick={() => props.onApply(props.suggestion)}
          class="rounded-full border border-primary/20 bg-primary/6 px-3 py-1 text-[11px] font-medium text-primary transition hover:bg-primary/12 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {props.suggestion.action}
        </button>
      </Show>
    </div>
  );
}

// ── Published post card ───────────────────────────────────────────────────────

function PostCard(props: { post: SocialPost }) {
  const platform = () => PLATFORMS.find((p) => p.id === props.post.platform) ?? PLATFORMS[0];
  return (
    <div class="rounded-2xl border border-outline-variant/50 bg-white/80 p-4 space-y-3 shadow-card">
      <div class="flex items-center gap-2">
        <span class={`text-xs font-bold ${platform().colorClass}`}>{platformBadge(platform().id)}</span>
        <span class="text-xs font-medium text-on-surface">{platform().label}</span>
        <span class="ml-auto text-[10px] text-on-surface-variant">{timeAgo(props.post.publishedAt)}</span>
      </div>
      <p class="text-sm text-on-surface leading-relaxed line-clamp-4 whitespace-pre-wrap">
        {props.post.content}
      </p>
      <div class="flex items-center gap-4 text-xs text-on-surface-variant border-t border-black/[0.05] pt-2">
        <span>Likes {props.post.likes}</span>
        <span>Reposts {props.post.reposts}</span>
        <span>Replies {props.post.replies}</span>
      </div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function SocialComposerView() {
  const [platform, setPlatform] = createSignal<Platform>("linkedin");
  const [content, setContent] = createSignal("");
  const [suggestions, setSuggestions] = createSignal<AgentSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = createSignal(false);
  const [posts, setPosts] = createSignal<SocialPost[]>([]);
  const [postsError, setPostsError] = createSignal<SocialComposerFailureReceipt | null>(null);
  const [suggestionsError, setSuggestionsError] = createSignal<SocialComposerFailureReceipt | null>(null);
  const [loadingPosts, setLoadingPosts] = createSignal(false);
  const [publishing, setPublishing] = createSignal(false);
  const [publishedId, setPublishedId] = createSignal<string | null>(null);
  const [approvalPending, setApprovalPending] = createSignal(false);
  const [publishError, setPublishError] = createSignal<SocialComposerFailureReceipt | null>(null);

  const currentPlatform = () => PLATFORMS.find((p) => p.id === platform()) ?? PLATFORMS[0];
  const charCount = () => content().length;
  const charLimit = () => currentPlatform().charLimit;
  const overLimit = () => charCount() > charLimit();
  const isEmpty = () => content().trim().length === 0;
  const interactionLocked = () => socialComposerInteractionLocked({
    publishing: publishing(),
    approvalPending: approvalPending(),
  });

  onMount(() => {
    loadPosts();
    loadSuggestions("");
  });

  async function loadPosts() {
    if (loadingPosts()) return;
    setLoadingPosts(true);
    setPostsError(null);
    try {
      setPosts(await listSocialPosts());
    } catch (err) {
      setPostsError(
        buildSocialComposerFailureReceipt(
          "Load published posts",
          err instanceof Error ? err.message : "Could not load published posts.",
        ),
      );
    } finally {
      setLoadingPosts(false);
    }
  }

  async function loadSuggestions(currentContent: string) {
    if (loadingSuggestions()) return;
    setLoadingSuggestions(true);
    setSuggestionsError(null);
    try {
      setSuggestions(await fetchSocialSuggestions(platform(), currentContent));
      return;
    } catch (err) {
      setSuggestionsError(
        buildSocialComposerFailureReceipt(
          "Load live suggestions",
          err instanceof Error ? err.message : "Could not load live suggestions.",
        ),
      );
    // Default suggestions when backend not reachable
      setSuggestions(socialComposerDefaultSuggestions());
    } finally {
      setLoadingSuggestions(false);
    }
  }

  let suggestionDebounce: ReturnType<typeof setTimeout> | null = null;

  createEffect(() => {
    const c = content();
    if (suggestionDebounce) clearTimeout(suggestionDebounce);
    if (c.length > 30) {
      suggestionDebounce = setTimeout(() => loadSuggestions(c), 1200);
    }
  });

  async function handleEditorSend(_payload: EditorPayload): Promise<void> {
    // Editor's own send is unused; publish is triggered by the separate button
  }

  function applySuggestion(s: AgentSuggestion) {
    if (interactionLocked()) return;
    if (s.kind === "hashtag") {
      setContent((prev) => prev + "\n\n#AI #Productivity #Automation");
    }
  }

  async function requestPublish() {
    if (isEmpty() || overLimit() || interactionLocked()) return;
    setApprovalPending(true);
  }

  async function confirmPublish() {
    if (publishing()) return;
    setApprovalPending(false);
    setPublishing(true);
    setPublishError(null);
    try {
      const postId = await publishSocialPost(platform(), content());
      setPublishedId(postId);
      // Append to local feed optimistically.
      setPosts((prev) => [
        {
          id: postId,
          platform: platform(),
          content: content(),
          publishedAt: new Date().toISOString(),
          likes: 0,
          reposts: 0,
          replies: 0,
        },
        ...prev,
      ]);
      setContent("");
      window.setTimeout(() => setPublishedId(null), 4000);
      setPublishing(false);
      return;
    } catch (err) {
      setPublishError(
        buildSocialComposerFailureReceipt(
          "Publish post",
          err instanceof Error ? err.message : "Could not publish post.",
        ),
      );
    }
    setPublishing(false);
  }

  return (
    <div class="flex flex-col gap-6 pb-8">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-on-surface">Social Composer</h2>
          <p class="text-xs text-on-surface-variant mt-0.5">
            Write once, publish across platforms with agent-guided suggestions.
          </p>
        </div>
        <Show when={publishedId()}>
          <div class="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-medium text-emerald-700 animate-fade-in">
            <span class="h-2 w-2 rounded-full bg-emerald-500" />
            Published
          </div>
        </Show>
      </div>

      <Show when={postsError() || publishError()}>
        <div
          class={`rounded-2xl border p-4 text-sm ${
            publishError()?.tone === "danger" || postsError()?.tone === "danger"
              ? "border-red-200/60 bg-red-50/80 text-red-700"
              : "border-amber-200/60 bg-amber-50/80 text-amber-800"
          }`}
        >
          <div class="flex items-start justify-between gap-3">
            <div class="space-y-1">
              <p class="font-semibold">{publishError()?.title ?? postsError()?.title}</p>
              <p>{publishError()?.summary ?? postsError()?.summary}</p>
              <p class="text-xs opacity-80">Next step: {publishError()?.nextStep ?? postsError()?.nextStep}</p>
            </div>
            <div class="flex items-center gap-2">
              <Show when={postsError() && !publishError()}>
                <button
                  type="button"
                  disabled={loadingPosts() || interactionLocked()}
                  class={`rounded-full border bg-white/90 px-3 py-1.5 text-xs font-medium transition hover:bg-white ${
                    postsError()?.tone === "danger"
                      ? "border-red-200/70 text-red-700"
                      : "border-amber-200/70 text-amber-800"
                  }`}
                  onClick={() => void loadPosts()}
                >
                  Retry posts
                </button>
              </Show>
              <button
                type="button"
                disabled={interactionLocked()}
                class={`rounded-full border bg-white/90 px-2.5 py-1 text-[11px] font-medium transition hover:bg-white ${
                  publishError()?.tone === "danger" || postsError()?.tone === "danger"
                    ? "border-red-200/70 text-red-700"
                    : "border-amber-200/70 text-amber-800"
                }`}
                onClick={() => {
                  setPostsError(null);
                  setPublishError(null);
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* ── Platform picker ─────────────────────────────────────────────────── */}
      <div class="flex items-center gap-2 flex-wrap">
        <For each={PLATFORMS}>
          {(p) => (
            <button
              type="button"
              disabled={interactionLocked()}
              onClick={() => { setPlatform(p.id); void loadSuggestions(content()); }}
              class={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                platform() === p.id
                  ? `${p.accentClass} border-transparent text-white shadow-sm`
                  : "border-outline-variant/60 bg-white/70 text-on-surface hover:bg-white"
              }`}
            >
              <span class="text-base leading-none">{platformBadge(p.id)}</span>
              {p.label}
            </button>
          )}
        </For>
        <span class={`ml-auto text-sm font-mono transition ${charColor(charCount(), charLimit())}`}>
          {charCount()}/{charLimit()}
        </span>
      </div>

      {/* ── Composer + Preview ─────────────────────────────────────────────── */}
      {/* @container-based layout: stacked on small, side-by-side on wider */}
      <div class="composer-container grid gap-4" style="grid-template-columns: 1fr">
        <style>{`
          @container composer (min-width: 640px) {
            .composer-grid { grid-template-columns: 1fr 1fr !important; }
          }
        `}</style>

        <div
          class="composer-grid grid gap-4"
          style={{ "grid-template-columns": "1fr" }}
        >
          {/* Editor */}
          <div class="flex flex-col gap-2">
            <p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Compose</p>
            <div style={{"container-type": "inline-size", "container-name": "composer"}}>
              <TiptapEditor
                mode="compact"
                disabled={interactionLocked()}
                placeholder={`What's on your mind? (${currentPlatform().label} - ${charLimit()} chars)`}
                onSend={handleEditorSend}
                onChange={(text) => setContent(text)}
                submitLabel={socialComposerEditorSubmitLabel({
                  publishing: publishing(),
                  approvalPending: approvalPending(),
                })}
                class="min-h-[120px]"
              />
            </div>
            {/* Live char count bar */}
            <div class="h-1 w-full overflow-hidden rounded-full bg-outline-variant/30">
              <div
                class={`h-full rounded-full transition-all duration-300 ${
                  overLimit() ? "bg-red-500" : charCount() / charLimit() > 0.9 ? "bg-amber-400" : "bg-primary"
                }`}
                style={{ width: `${Math.min(100, (charCount() / charLimit()) * 100)}%` }}
              />
            </div>
            <Show when={overLimit()}>
              <p class="text-xs text-red-500">
                {charCount() - charLimit()} characters over the {currentPlatform().label} limit.
              </p>
            </Show>

            {/* Publish action */}
            <div class="flex items-center gap-2 mt-1">
              <button
                type="button"
                disabled={isEmpty() || overLimit() || interactionLocked()}
                onClick={requestPublish}
                class="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {socialComposerPublishLabel({
                  publishing: publishing(),
                  approvalPending: approvalPending(),
                  platformLabel: currentPlatform().label,
                })}
              </button>
              <a
                href={currentPlatform().url}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={interactionLocked()}
                tabIndex={interactionLocked() ? -1 : undefined}
                class={`rounded-full border border-outline-variant/60 px-4 py-2 text-xs text-on-surface-variant transition ${
                  interactionLocked() ? "pointer-events-none opacity-50" : "hover:bg-white"
                }`}
              >
                Open {currentPlatform().label}
              </a>
            </div>
          </div>

          {/* Preview */}
          <div class="flex flex-col gap-2">
            <p class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Preview</p>
            <PlatformPreview platform={currentPlatform()} content={content()} />
          </div>
        </div>
      </div>

      {/* ── Approval confirmation ───────────────────────────────────────────── */}
      <Show when={approvalPending()}>
        <div class="rounded-2xl border border-amber-200/60 bg-amber-50/90 p-4 space-y-3 animate-fade-in">
          <p class="text-sm font-semibold text-amber-800">Confirm publish?</p>
          <p class="text-xs text-amber-700 leading-5">
            This will post to{" "}
            <strong>{currentPlatform().label}</strong> via your connected account and create a signed AFP message in your Ledger.
          </p>
          <div class="flex items-center gap-2">
            <button
              type="button"
              disabled={publishing()}
              onClick={confirmPublish}
              class="rounded-full bg-amber-600 px-5 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {publishing() ? "Publishing..." : "Yes, publish"}
            </button>
            <button
              type="button"
              disabled={publishing()}
              onClick={() => setApprovalPending(false)}
              class="rounded-full border border-amber-300 px-4 py-1.5 text-xs text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </Show>

      {/* ── Agent suggestions ───────────────────────────────────────────────── */}
      <div class="space-y-3">
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold text-on-surface">Agent Suggestions</span>
          <Show when={loadingSuggestions()}>
            <span class="text-xs text-on-surface-variant animate-pulse">Analysing...</span>
          </Show>
        </div>
        <Show when={suggestionsError()}>
          <div
            class={`rounded-xl border px-4 py-3 text-xs ${
              suggestionsError()?.tone === "danger"
                ? "border-red-200/60 bg-red-50/80 text-red-700"
                : "border-amber-200/60 bg-amber-50/80 text-amber-800"
            }`}
          >
            <div class="flex items-start justify-between gap-3">
              <div class="space-y-1">
                <p class="font-semibold">{suggestionsError()?.title}</p>
                <p>{suggestionsError()?.summary}</p>
                <p class="opacity-80">
                  Next step: {suggestionsError()?.nextStep} Default suggestions are still available below.
                </p>
              </div>
              <button
                type="button"
                disabled={loadingSuggestions() || interactionLocked()}
                class={`rounded-full border bg-white/90 px-3 py-1 text-[11px] font-medium transition hover:bg-white ${
                  suggestionsError()?.tone === "danger"
                    ? "border-red-200/70 text-red-700"
                    : "border-amber-200/70 text-amber-800"
                }`}
                onClick={() => void loadSuggestions(content())}
              >
                Retry suggestions
              </button>
            </div>
          </div>
        </Show>
        <Show
          when={suggestions().length > 0}
          fallback={
            <p class="text-xs text-on-surface-variant/60 italic">
              Start writing to get personalised suggestions.
            </p>
          }
        >
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <For each={suggestions()}>
              {(s) => <SuggestionCard suggestion={s} onApply={applySuggestion} disabled={interactionLocked()} />}
            </For>
          </div>
        </Show>
      </div>

      {/* ── Published feed ──────────────────────────────────────────────────── */}
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <p class="text-sm font-semibold text-on-surface">Your Posts</p>
          <button
            type="button"
            disabled={loadingPosts() || interactionLocked()}
            onClick={() => void loadPosts()}
            class="text-xs text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingPosts() ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        <Show
          when={posts().length > 0}
          fallback={
            <div class="rounded-2xl border border-dashed border-outline-variant/50 px-6 py-10 text-center">
              <p class="text-sm text-on-surface-variant">No posts yet.</p>
              <p class="text-xs text-on-surface-variant/60 mt-1">
                Compose your first post above and publish it here.
              </p>
            </div>
          }
        >
          <div class="grid gap-3 sm:grid-cols-2">
            <For each={posts()}>
              {(post) => <PostCard post={post} />}
            </For>
          </div>
        </Show>
      </div>

    </div>
  );
}
