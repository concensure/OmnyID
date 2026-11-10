// @locs-version: 2.1
import { createSignal, For, Show } from "solid-js";

import type { SendAfpMessageInput } from "@/lib/api";
import {
  weddingCustomSurfaceItemToAfpSendInput,
  type WeddingCustomSurfaceItem,
} from "@/lib/weddingCustomSurfaceState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import { weddingImportantDetailsActionLabel } from "@/lib/weddingRecommendationGenerationActionState";
import { weddingAccountScopedStorageKey } from "@/lib/weddingLocalAccountScope";

export function WeddingImportantDetailsPanel(props: {
  cards: WeddingResponseWorkspaceViewState["contextCards"];
  metadata?: unknown;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: () => void;
  onGenerateRecommendations?: (cardTitle: string, nextQuestionLabel: string) => void;
}) {
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [draftText, setDraftText] = createSignal("");
  const [saveNotice, setSaveNotice] = createSignal<string | null>(null);

  function cardKey(card: WeddingResponseWorkspaceViewState["contextCards"][number]): string {
    return weddingAccountScopedStorageKey(`omnyid:wedding_important_detail:${card.title}`);
  }

  function visibleLabels(card: WeddingResponseWorkspaceViewState["contextCards"][number]): string[] {
    try {
      const raw = localStorage.getItem(cardKey(card));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
      }
    } catch {
      // Ignore malformed local detail edits.
    }
    return card.answeredLabels.slice(0, 5);
  }

  function startEditing(card: WeddingResponseWorkspaceViewState["contextCards"][number]) {
    setEditingId(card.title);
    setDraftText(visibleLabels(card).join("\n"));
    setSaveNotice(null);
  }

  async function saveDetails(card: WeddingResponseWorkspaceViewState["contextCards"][number]) {
    const lines = draftText().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    localStorage.setItem(cardKey(card), JSON.stringify(lines));
    setEditingId(null);
    const now = new Date().toISOString();
    const item: WeddingCustomSurfaceItem = {
      id: `wedding-important-detail-${Date.now()}`,
      menu: "home",
      kind: "text",
      title: `Updated important details: ${card.title}`,
      body: lines.join("\n"),
      imageUrl: null,
      storageRef: null,
      order: 0,
      createdAt: now,
      updatedAt: now,
    };
    if (!props.saveProjection) {
      setSaveNotice("Saved on this page.");
      return;
    }
    try {
      await props.saveProjection(weddingCustomSurfaceItemToAfpSendInput({
        item,
        metadata: props.metadata,
        action: "upsert",
      }));
      props.onRefreshWorkspace?.();
      setSaveNotice("Important details saved.");
    } catch {
      setSaveNotice("Saved on this page. Wedding memory sync is not available yet.");
    }
  }

  return (
    <div class="min-w-0 rounded-[24px] border border-rose-100/80 bg-rose-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
      <p class="text-base font-semibold text-rose-950">Important details</p>
      <div class="mt-3 space-y-2">
        <For each={props.cards}>
          {(card) => (
            <article class="rounded-2xl border border-rose-100 bg-white/75 p-3">
              <div class="flex items-start justify-between gap-2">
                <p class="break-words text-xs font-semibold text-rose-950">{card.title}</p>
                <p class="max-w-full break-words text-right text-xs font-medium text-rose-900/75">{card.statusLabel}</p>
              </div>
              <ul class="mt-2 space-y-1">
                <For each={visibleLabels(card)}>
                  {(label) => <li class="text-xs leading-5 text-rose-900/75">{label}</li>}
                </For>
              </ul>
              <Show when={editingId() === card.title}>
                <textarea
                  value={draftText()}
                  onInput={(event) => setDraftText(event.currentTarget.value)}
                  class="mt-2 min-h-28 w-full rounded-2xl border border-rose-100 bg-white px-3 py-2 text-sm text-rose-950 outline-none focus:border-rose-300"
                />
              </Show>
              <p class="mt-2 rounded-xl border border-rose-100 bg-rose-50/70 px-2.5 py-2 text-xs leading-5 text-rose-950/80">
                Next: {card.nextQuestionLabel}
              </p>
              <div class="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="rounded-full border border-rose-100 bg-white px-3 py-1.5 text-xs font-semibold text-rose-950 transition hover:bg-rose-50"
                  onClick={() => editingId() === card.title ? void saveDetails(card) : startEditing(card)}
                >
                  {editingId() === card.title ? "Save details" : "Edit details"}
                </button>
                <button
                  type="button"
                  disabled={!props.onGenerateRecommendations}
                  class="rounded-full bg-rose-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => props.onGenerateRecommendations?.(card.title, card.nextQuestionLabel)}
                >
                  {weddingImportantDetailsActionLabel(card.nextQuestionLabel)}
                </button>
              </div>
            </article>
          )}
        </For>
      </div>
      <Show when={saveNotice()}>
        {(notice) => <p class="mt-2 text-xs font-semibold text-rose-900/75">{notice()}</p>}
      </Show>
    </div>
  );
}
