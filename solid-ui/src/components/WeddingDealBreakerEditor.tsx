// @locs-version: 1.0
import { createMemo, createSignal, For, Show } from "solid-js";

import { WeddingConfirmDialog } from "@/components/WeddingConfirmDialog";
import { WeddingInlineHelpNote } from "@/components/WeddingInlineHelpNote";
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import {
  weddingDealBreakersFromAfpMessages,
  weddingDealBreakerToAfpSendInput,
} from "@/lib/weddingDealBreakerAfpState";

export function WeddingDealBreakerEditor(props: {
  messages: readonly AfpMessage[];
  metadata: unknown;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: () => void;
  surface?: "vision" | "enquiry" | "quote_review";
  promptWhenEmpty?: boolean;
  compact?: boolean;
  hideWhenPopulated?: boolean;
}) {
  const [optimisticAdded, setOptimisticAdded] = createSignal<string[]>([]);
  const [optimisticRemoved, setOptimisticRemoved] = createSignal<string[]>([]);
  const saved = createMemo(() => [...new Set([
    ...weddingDealBreakersFromAfpMessages({ messages: props.messages, metadata: props.metadata })
      .filter((label) => !optimisticRemoved().includes(label)),
    ...optimisticAdded(),
  ])]);
  const [draft, setDraft] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = createSignal<string | null>(null);

  async function persist(label: string, action: "add" | "remove") {
    if (!props.saveProjection || saving()) {
      setNotice("Account saving is not available yet. Your deal-breaker has not been changed.");
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      await props.saveProjection(weddingDealBreakerToAfpSendInput({
        metadata: props.metadata,
        label,
        action,
        sourceSurface: props.surface,
      }));
      if (action === "add") {
        setDraft("");
        setOptimisticAdded((current) => [...new Set([...current, label])]);
        setOptimisticRemoved((current) => current.filter((item) => item !== label));
      } else {
        setOptimisticAdded((current) => current.filter((item) => item !== label));
        setOptimisticRemoved((current) => [...new Set([...current, label])]);
      }
      setPendingRemoval(null);
      setNotice(action === "add" ? "Deal-breaker saved to your wedding knowledge." : "Deal-breaker removed.");
    } catch {
      setNotice("This change could not be saved. Try again without re-entering anything.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Show when={!props.hideWhenPopulated || saved().length === 0}>
    <section class={`rounded-xl border p-3 ${props.promptWhenEmpty && saved().length === 0 ? "border-amber-300 bg-amber-50" : "border-wedding-border bg-white/80"}`}>
      <h4 class="text-sm font-bold text-wedding-ink">Deal-breakers</h4>
      <p class="mt-1 text-xs leading-5 text-wedding-ink/70">
        Add anything you will not compromise on. OmnyID uses these private requirements in later searches, enquiries, quote reviews and booking checks.
      </p>
      <Show when={props.promptWhenEmpty && saved().length === 0}>
        <WeddingInlineHelpNote class="mt-2">Add at least one deal-breaker before asking for a quote or reviewing booking terms, or leave it blank deliberately if you have none.</WeddingInlineHelpNote>
      </Show>
      <Show when={saved().length > 0}>
        <div class="mt-2 flex flex-wrap gap-2">
          <For each={saved()}>{(label) => (
            <span class="inline-flex max-w-full items-center gap-1 rounded-full border border-wedding-border bg-wedding-page pl-3 pr-1 py-1 text-xs font-semibold text-wedding-ink">
              <span class="break-words">{label}</span>
              <button
                type="button"
                class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base text-wedding-ink/65 hover:bg-red-50 hover:text-red-800"
                aria-label={`Remove deal-breaker: ${label}`}
                onClick={() => setPendingRemoval(label)}
              >×</button>
            </span>
          )}</For>
        </div>
      </Show>
      <div class={`mt-3 grid gap-2 ${props.compact ? "sm:grid-cols-[1fr_auto]" : "md:grid-cols-[1fr_auto]"}`}>
        <input
          value={draft()}
          maxlength={180}
          onInput={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && draft().trim()) void persist(draft().trim(), "add"); }}
          placeholder="For example: wheelchair access, no outdoor-only wet-weather plan"
          class="min-h-11 min-w-0 rounded-xl border border-wedding-border bg-white px-3 text-sm text-wedding-ink outline-none focus:border-wedding-primary focus:ring-2 focus:ring-wedding-primary/15"
        />
        <button
          type="button"
          disabled={saving() || !draft().trim()}
          class="min-h-11 rounded-xl bg-wedding-primary px-4 text-sm font-bold text-white disabled:opacity-50"
          onClick={() => void persist(draft().trim(), "add")}
        >Add deal-breaker</button>
      </div>
      <Show when={notice()}>{(message) => <p class="mt-2 text-xs font-semibold text-wedding-ink/70" role="status">{message()}</p>}</Show>
      <WeddingConfirmDialog
        open={Boolean(pendingRemoval())}
        title="Remove this deal-breaker?"
        detail={`“${pendingRemoval() ?? ""}” will stop being used as a must-not-compromise requirement in future recommendations and quote checks.`}
        confirmLabel="Remove"
        destructive
        busy={saving()}
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => { const label = pendingRemoval(); if (label) void persist(label, "remove"); }}
      />
    </section>
    </Show>
  );
}
