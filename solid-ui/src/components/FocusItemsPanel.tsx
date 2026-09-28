import { createSignal, onMount, For, Show } from "solid-js";
import { createFocusItem, listFocusItems, updateFocusItem, type FocusItem } from "../lib/api";
import {
  buildFocusItemsFailureReceipt,
  type FocusItemsFailureReceipt,
} from "../lib/focusItemsFailureState";
import { recordShortcutUse } from "../lib/shortcutRecency";
import { EmptyState } from "./EmptyState";
import { SkeletonBlock } from "./Spinner";

export function FocusItemsPanel() {
  const [items, setItems] = createSignal<FocusItem[]>([]);
  const [newTitle, setNewTitle] = createSignal("");
  const [loading, setLoading] = createSignal(true);
  const [loadError, setLoadError] = createSignal<FocusItemsFailureReceipt | null>(null);
  const [actionError, setActionError] = createSignal<FocusItemsFailureReceipt | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      setItems(await listFocusItems());
    } catch (error) {
      setItems([]);
      setLoadError(
        buildFocusItemsFailureReceipt(
          "Load focus items",
          error instanceof Error ? error.message : "Could not load focus items.",
        ),
      );
    }
    setLoading(false);
  }

  onMount(load);

  async function addItem() {
    const title = newTitle().trim();
    if (!title) return;
    setActionError(null);
    try {
      await createFocusItem({ title });
      setNewTitle("");
      await load();
    } catch (error) {
      setActionError(
        buildFocusItemsFailureReceipt(
          "Add focus item",
          error instanceof Error ? error.message : "Could not add focus item.",
        ),
      );
    }
  }

  function clearDraft() {
    setNewTitle("");
    setActionError(null);
  }

  function handleDraftShortcut(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      recordShortcutUse("form_cancel");
      clearDraft();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      recordShortcutUse("form_submit");
      void addItem();
    }
  }

  async function toggleStatus(item: FocusItem) {
    const next = item.status === "completed" ? "pending" : "completed";
    setActionError(null);
    try {
      await updateFocusItem(item.id, { status: next });
      await load();
    } catch (error) {
      setActionError(
        buildFocusItemsFailureReceipt(
          "Update focus item",
          error instanceof Error ? error.message : "Could not update focus item.",
        ),
      );
    }
  }

  const priorityColor = (p: string) =>
    p === "critical" ? "text-red-500" : p === "high" ? "text-orange-500" : "text-on-surface-variant";

  return (
    <div class="space-y-4">
      <h2 class="text-lg font-semibold text-on-surface">Focus Items</h2>

      <div class="flex gap-2">
        <input
          type="text"
          placeholder="New focus item..."
          value={newTitle()}
          onInput={(e) => {
            setNewTitle(e.currentTarget.value);
            if (actionError()) setActionError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
              recordShortcutUse("form_submit");
              void addItem();
              return;
            }
            handleDraftShortcut(e);
          }}
          class="flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant outline-none focus:border-primary"
        />
        <button
          type="button"
          class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary/80"
          onClick={addItem}
        >
          Add
        </button>
      </div>

      <Show when={actionError()}>
        <div
          class={`rounded-xl border px-4 py-3 text-xs ${
            actionError()?.tone === "danger"
              ? "border-red-400/20 bg-red-500/10 text-red-400"
              : "border-amber-300/25 bg-amber-500/10 text-amber-200"
          }`}
        >
          <div class="flex items-start justify-between gap-3">
            <div class="space-y-1">
              <p class="font-semibold">{actionError()?.title}</p>
              <p>{actionError()?.summary}</p>
              <p class="text-[11px] opacity-90">Next step: {actionError()?.nextStep}</p>
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
        <div class="skeleton-crossfade space-y-2">
          <div class="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            <SkeletonBlock lines={2} />
          </div>
          <div class="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            <SkeletonBlock lines={2} />
          </div>
          <div class="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            <SkeletonBlock lines={2} />
          </div>
        </div>
      </Show>

      <Show when={!loading() && loadError()}>
        <EmptyState
          icon="!"
          title="Could not load focus items"
          body={`${loadError()?.summary ?? "Focus items are unavailable right now."} ${loadError()?.nextStep ?? ""}`.trim()}
          action={
            <button
              type="button"
              class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary/80"
              onClick={() => void load()}
            >
              Retry focus
            </button>
          }
        />
      </Show>

      <Show when={!loading() && !loadError()}>
        <div class="content-crossfade space-y-2">
          <For
            each={items()}
            fallback={
              <EmptyState
                icon="◎"
                title="No focus items yet"
                body="Add a small set of priority items here so your current commitments stay visible without hunting through other views."
              />
            }
          >
            {(item) => (
              <div
                class={`flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 ${
                  item.status === "completed" ? "opacity-50" : ""
                }`}
              >
                <button
                  type="button"
                  class={`mt-0.5 h-4 w-4 flex-shrink-0 rounded border transition ${
                    item.status === "completed"
                      ? "border-green-500 bg-green-500"
                      : "border-white/30 bg-transparent hover:border-primary"
                  }`}
                  onClick={() => toggleStatus(item)}
                />
                <div class="min-w-0 flex-1">
                  <p class={`text-sm ${item.status === "completed" ? "line-through" : "text-on-surface"}`}>
                    {item.title}
                  </p>
                  <Show when={item.description}>
                    <p class="mt-0.5 text-xs text-on-surface-variant">{item.description}</p>
                  </Show>
                </div>
                <span class={`text-xs font-medium ${priorityColor(item.priority)}`}>{item.priority}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
