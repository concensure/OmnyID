import { createSignal, onMount, For, Show } from "solid-js";
import { apiFetch } from "../lib/api";

type FocusItem = {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  due_at?: string | null;
};

export function FocusItemsPanel() {
  const [items, setItems] = createSignal<FocusItem[]>([]);
  const [newTitle, setNewTitle] = createSignal("");
  const [loading, setLoading] = createSignal(true);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<{ items: FocusItem[] }>("/agent/focus");
      setItems(data.items ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  onMount(load);

  async function addItem() {
    const title = newTitle().trim();
    if (!title) return;
    try {
      await apiFetch("/agent/focus", { method: "POST", bodyJson: { title } });
      setNewTitle("");
      await load();
    } catch { /* ignore */ }
  }

  async function toggleStatus(item: FocusItem) {
    const next = item.status === "completed" ? "pending" : "completed";
    try {
      await apiFetch(`/agent/focus/${item.id}`, { method: "PATCH", bodyJson: { status: next } });
      await load();
    } catch { /* ignore */ }
  }

  const priorityColor = (p: string) =>
    p === "critical" ? "text-red-500" : p === "high" ? "text-orange-500" : "text-on-surface-variant";

  return (
    <div class="space-y-4">
      <h2 class="text-lg font-semibold text-on-surface">Focus Items</h2>

      {/* Add item */}
      <div class="flex gap-2">
        <input
          type="text"
          placeholder="New focus item…"
          value={newTitle()}
          onInput={(e) => setNewTitle(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
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

      <Show when={loading()}>
        <p class="text-sm text-on-surface-variant">Loading…</p>
      </Show>

      <Show when={!loading()}>
        <div class="space-y-2">
          <For each={items()} fallback={
            <p class="text-sm text-on-surface-variant">No focus items yet.</p>
          }>
            {(item) => (
              <div class={`flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 ${
                item.status === "completed" ? "opacity-50" : ""
              }`}>
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
                  {item.description && (
                    <p class="mt-0.5 text-xs text-on-surface-variant">{item.description}</p>
                  )}
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
