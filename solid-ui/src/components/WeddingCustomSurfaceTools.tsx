// @locs-version: 2.1
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import type { SendAfpMessageInput } from "@/lib/api";
import {
  normalizeWeddingCustomSurfaceItem,
  reorderWeddingCustomSurfaceItems,
  weddingCustomSurfaceItemsForMenu,
  weddingCustomSurfaceItemToAfpSendInput,
  type WeddingCustomSurfaceAction,
  type WeddingCustomSurfaceItem,
} from "@/lib/weddingCustomSurfaceState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";
import { weddingAccountScopedStorageKey } from "@/lib/weddingLocalAccountScope";

function customWorkspaceStorageKey(scope: string): string {
  return weddingAccountScopedStorageKey(`omnyid:wedding_custom_surface:${scope}`);
}

function loadCustomWorkspaceItems(scope: string): WeddingCustomSurfaceItem[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(customWorkspaceStorageKey(scope)) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.map(normalizeWeddingCustomSurfaceItem).filter((item): item is WeddingCustomSurfaceItem => item !== null)
      : [];
  } catch {
    return [];
  }
}

function saveCustomWorkspaceItems(scope: string, items: readonly WeddingCustomSurfaceItem[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(customWorkspaceStorageKey(scope), JSON.stringify(items.slice(0, 24)));
  } catch {
    // Storage can be unavailable or full; the in-page draft still remains usable.
  }
}

export function WeddingCustomSurfaceTools(props: {
  activeMenu: WeddingWorkspaceMenuId;
  storageKey: string;
  metadata?: unknown;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: () => void;
}) {
  const [open, setOpen] = createSignal(false);
  const [mode, setMode] = createSignal<WeddingCustomSurfaceItem["kind"] | null>(null);
  const [title, setTitle] = createSignal("");
  const [body, setBody] = createSignal("");
  const [imageUrl, setImageUrl] = createSignal<string | null>(null);
  const [saveStatus, setSaveStatus] = createSignal<string | null>(null);
  const [items, setItems] = createSignal<WeddingCustomSurfaceItem[]>(loadCustomWorkspaceItems(props.storageKey));
  const [draggingItemId, setDraggingItemId] = createSignal<string | null>(null);
  const visibleItems = createMemo(() => weddingCustomSurfaceItemsForMenu(items(), props.activeMenu));

  createEffect(() => {
    saveCustomWorkspaceItems(props.storageKey, items());
  });

  function resetDraft() {
    setTitle("");
    setBody("");
    setImageUrl(null);
    setMode(null);
  }

  async function saveItemAction(item: WeddingCustomSurfaceItem, action: WeddingCustomSurfaceAction) {
    if (!props.saveProjection) {
      setSaveStatus("Saved on this page.");
      return;
    }
    setSaveStatus("Saving...");
    try {
      await props.saveProjection(weddingCustomSurfaceItemToAfpSendInput({
        item,
        metadata: props.metadata,
        action,
      }));
      props.onRefreshWorkspace?.();
      setSaveStatus("Saved to wedding memory.");
    } catch {
      setSaveStatus("Saved on this page. Wedding memory sync is not available yet.");
    }
  }

  function addItem(kind: WeddingCustomSurfaceItem["kind"]) {
    const safeTitle = title().trim() || (kind === "image" ? "Wedding image" : "Planning note");
    const safeBody = body().trim();
    if (kind === "text" && !safeBody) return;
    if (kind === "image" && !imageUrl()) return;
    const now = new Date().toISOString();
    const item: WeddingCustomSurfaceItem = {
      id: `wedding-custom-${Date.now()}-${items().length}`,
      menu: props.activeMenu,
      kind,
      title: safeTitle,
      body: safeBody,
      imageUrl: imageUrl(),
      storageRef: null,
      order: visibleItems().length,
      createdAt: now,
      updatedAt: now,
    };
    setItems((current) => [
      ...current,
      item,
    ]);
    void saveItemAction(item, "upsert");
    resetDraft();
    setOpen(false);
  }

  function moveItem(id: string, direction: -1 | 1) {
    moveItemToIndex(id, visibleItems().findIndex((item) => item.id === id) + direction);
  }

  function moveItemToIndex(id: string, targetPageIndex: number) {
    setItems((current) => {
      const next = reorderWeddingCustomSurfaceItems({
        items: current,
        menu: props.activeMenu,
        itemId: id,
        targetIndex: targetPageIndex,
      });
      if (next === current || next.every((item, index) => item === current[index])) return current;
      const saved = next.find((item) => item.id === id);
      if (saved) void saveItemAction(saved, "reorder");
      return next;
    });
  }

  function dropItem(targetId: string) {
    const sourceId = draggingItemId();
    setDraggingItemId(null);
    if (!sourceId || sourceId === targetId) return;
    const targetIndex = visibleItems().findIndex((item) => item.id === targetId);
    moveItemToIndex(sourceId, targetIndex);
  }

  function removeItem(id: string) {
    const removed = items().find((item) => item.id === id);
    setItems((current) => current.filter((item) => item.id !== id));
    if (removed) void saveItemAction({ ...removed, updatedAt: new Date().toISOString() }, "remove");
  }

  function selectImage(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!title().trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") setImageUrl(reader.result);
    });
    reader.readAsDataURL(file);
  }

  return (
    <div class="rounded-[24px] border border-white/60 bg-white/75 p-3 shadow-card backdrop-blur sm:rounded-[28px]">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-on-surface">Add something here</p>
          <p class="mt-1 text-xs leading-5 text-on-surface-variant">
            Add a photo or note to this wedding page and move it into the order you like.
          </p>
          <Show when={saveStatus()}>
            {(status) => <p class="mt-1 text-xs font-semibold text-rose-900">{status()}</p>}
          </Show>
        </div>
        <div class="relative">
          <button
            type="button"
            class="flex h-10 w-10 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-lg font-bold text-rose-950 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
            title="Add a photo or note"
            aria-label="Add a photo or note"
            aria-expanded={open()}
            onClick={() => setOpen((current) => !current)}
          >
            +
          </button>
          <Show when={open()}>
            <div class="absolute right-0 z-20 mt-2 w-52 rounded-2xl border border-stone-200 bg-white p-2 shadow-xl">
              <button
                type="button"
                class="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-stone-800 transition hover:bg-stone-50"
                onClick={() => setMode(mode() === "image" ? null : "image")}
              >
                Image
              </button>
              <button
                type="button"
                class="mt-1 w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-stone-800 transition hover:bg-stone-50"
                onClick={() => setMode(mode() === "text" ? null : "text")}
              >
                Text note
              </button>
            </div>
          </Show>
        </div>
      </div>

      <Show when={mode()}>
        {(selectedMode) => (
          <div class="mt-3 rounded-2xl border border-stone-200 bg-white/80 p-3">
            <label class="text-xs font-semibold text-stone-700">
              Title
              <input
                class="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                value={title()}
                onInput={(event) => setTitle(event.currentTarget.value)}
                placeholder={selectedMode() === "image" ? "Photo title" : "Note title"}
              />
            </label>
            <Show when={selectedMode() === "image"} fallback={
              <label class="mt-3 block text-xs font-semibold text-stone-700">
                Text
                <textarea
                  class="mt-1 min-h-24 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                  value={body()}
                  onInput={(event) => setBody(event.currentTarget.value)}
                  placeholder="Write the note you want to keep here."
                />
              </label>
            }>
              <label class="mt-3 block text-xs font-semibold text-stone-700">
                Upload image
                <input
                  class="mt-1 block w-full text-sm text-stone-700 file:mr-3 file:rounded-full file:border-0 file:bg-rose-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-rose-950"
                  type="file"
                  accept="image/*"
                  onChange={selectImage}
                />
              </label>
              <Show when={imageUrl()}>
                {(url) => (
                  <div class="mt-3 rounded-2xl border border-stone-100 bg-stone-50 p-2">
                    <img src={url()} alt={title() || "Uploaded wedding image"} class="max-h-72 w-full rounded-xl object-contain" />
                  </div>
                )}
              </Show>
            </Show>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-full bg-rose-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={selectedMode() === "image" ? !imageUrl() : !body().trim()}
                onClick={() => addItem(selectedMode())}
              >
                Add
              </button>
              <button
                type="button"
                class="rounded-full border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
                onClick={resetDraft}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Show>

      <Show when={visibleItems().length > 0}>
        <div class="mt-3 space-y-2">
          <For each={visibleItems()}>
            {(item, index) => (
              <article
                class="rounded-2xl border border-stone-200 bg-white/80 p-3"
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => dropItem(item.id)}
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="flex min-w-0 items-start gap-2">
                    <button
                      type="button"
                      class="mt-0.5 cursor-grab rounded-full border border-stone-200 bg-white px-2 py-1 text-xs font-bold text-stone-500 active:cursor-grabbing"
                      title="Drag to move this item"
                      aria-label={`Move ${item.title}`}
                      draggable={visibleItems().length > 1}
                      onDragStart={(event) => {
                        setDraggingItemId(item.id);
                        event.dataTransfer?.setData("text/plain", item.id);
                      }}
                      onDragEnd={() => setDraggingItemId(null)}
                    >
                      ::
                    </button>
                    <div class="min-w-0">
                    <p class="break-words text-sm font-semibold text-stone-900">{item.title}</p>
                    <p class="mt-0.5 text-[11px] font-medium text-stone-500">
                      {visibleItems().length > 1 ? "Drag the handle or use up/down to reorder." : "Add another item to reorder this page."}
                    </p>
                    </div>
                  </div>
                  <div class="flex shrink-0 flex-wrap justify-end gap-1">
                    <button type="button" class="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-2 py-1 text-xs font-semibold text-stone-700 disabled:opacity-40" disabled={index() === 0} title="Move this item up" onClick={() => moveItem(item.id, -1)}>
                      Move up
                    </button>
                    <button type="button" class="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-2 py-1 text-xs font-semibold text-stone-700 disabled:opacity-40" disabled={index() === visibleItems().length - 1} title="Move this item down" onClick={() => moveItem(item.id, 1)}>
                      Move down
                    </button>
                    <button type="button" class="rounded-full border border-stone-200 px-2 py-1 text-xs font-semibold text-stone-700" onClick={() => removeItem(item.id)}>Remove</button>
                  </div>
                </div>
                <Show when={item.imageUrl} fallback={<p class="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-stone-700">{item.body}</p>}>
                  {(url) => (
                    <div class="mt-2 rounded-2xl border border-stone-100 bg-stone-50 p-2">
                      <img src={url()} alt={item.title} class="max-h-[34rem] w-full rounded-xl object-contain" />
                    </div>
                  )}
                </Show>
              </article>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
