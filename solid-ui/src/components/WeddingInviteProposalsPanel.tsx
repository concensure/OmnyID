// @locs-version: 1.0
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import type { WeddingResponseWorkspaceViewProps } from "@/components/WeddingResponseWorkspaceViewTypes";
import type { WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";
import {
  buildWeddingInviteProposalBrief,
  defaultWeddingInviteProposalSharing,
  validateWeddingInviteProposalDraft,
  weddingInviteProposalDraftToAfpSendInput,
  WEDDING_INVITE_PROPOSAL_RECIPIENT_LIMIT,
  type WeddingInviteProposalSharing,
} from "@/lib/weddingInviteProposalState";

const SHARE_OPTIONS: ReadonlyArray<{ key: keyof WeddingInviteProposalSharing; label: string }> = [
  { key: "dateOrSeason", label: "Wedding date or season" },
  { key: "location", label: "Broad location" },
  { key: "guestCount", label: "Guest count" },
  { key: "stylePriorities", label: "Style and priorities" },
  { key: "approximateCategoryBudget", label: "Approximate category budget" },
  { key: "phoneContact", label: "Allow phone contact" },
];

function budgetLabel(amount: number, currency: string): string {
  return amount.toLocaleString("en-AU", { style: "currency", currency, maximumFractionDigits: 0 });
}

export function WeddingInviteProposalsPanel(props: {
  workspace: WeddingResponseWorkspaceViewProps;
  preview: WeddingWorkspaceArtifactPreview | null;
  onFindVendors: () => void;
}) {
  const brief = createMemo(() => buildWeddingInviteProposalBrief({
    state: props.workspace.state,
    preview: props.preview,
    vendorDirectory: props.workspace.weddingVendorDirectory,
  }));
  const [requestText, setRequestText] = createSignal(props.workspace.vendorSearchQuery?.trim() ?? "");
  const [selectedIds, setSelectedIds] = createSignal<string[]>([]);
  const [sharing, setSharing] = createSignal(defaultWeddingInviteProposalSharing(brief()));
  const [saving, setSaving] = createSignal(false);
  const [notice, setNotice] = createSignal<string | null>(null);
  let previousBriefId = "";

  createEffect(() => {
    const current = brief();
    if (current.id === previousBriefId) return;
    previousBriefId = current.id;
    setSharing(defaultWeddingInviteProposalSharing(current));
    setSelectedIds([]);
  });

  const selectedRecipients = createMemo(() => brief().recipients.filter((item) => selectedIds().includes(item.choiceId)));
  const validation = createMemo(() => validateWeddingInviteProposalDraft({
    brief: brief(), requestText: requestText(), recipientChoiceIds: selectedIds(),
  }));

  function toggleRecipient(choiceId: string) {
    setNotice(null);
    setSelectedIds((current) => {
      if (current.includes(choiceId)) return current.filter((id) => id !== choiceId);
      if (current.length >= WEDDING_INVITE_PROPOSAL_RECIPIENT_LIMIT) {
        setNotice(`Choose up to ${WEDDING_INVITE_PROPOSAL_RECIPIENT_LIMIT} vendors for one invitation.`);
        return current;
      }
      return [...current, choiceId];
    });
  }

  async function saveDraft() {
    const error = validation();
    if (error || !props.workspace.saveProjection || saving()) {
      setNotice(error ?? "Saving is not connected in this view.");
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      await props.workspace.saveProjection(weddingInviteProposalDraftToAfpSendInput({
        brief: brief(), requestText: requestText(), recipientChoiceIds: selectedIds(),
        sharing: sharing(), metadata: props.workspace.state.workspace.metadata,
      }));
      setNotice("Private draft saved. No vendor has been contacted.");
      props.workspace.onRefreshWorkspace?.();
    } catch {
      setNotice("We couldn't save this draft. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="wedding-vendor-panel-invite" role="tabpanel" aria-labelledby="wedding-vendor-tab-invite" class="mt-4">
      <div class="rounded-xl border border-wedding-border bg-wedding-page p-3 sm:p-4">
        <p class="font-display text-xl font-semibold text-wedding-ink">Invite vendors to propose</p>
        <p class="mt-1 text-sm leading-6 text-wedding-ink/70">Prepare one private brief, choose who may receive it, then review the exact invitation before anything is sent.</p>
      </div>

      <div class="mt-3 grid gap-3 lg:grid-cols-2">
        <section class="rounded-xl border border-wedding-border bg-white p-3" aria-labelledby="proposal-brief-heading">
          <h3 id="proposal-brief-heading" class="font-semibold text-wedding-ink">Your proposal brief</h3>
          <label class="mt-3 block text-sm font-semibold text-wedding-ink">
            What should vendors propose?
            <textarea value={requestText()} onInput={(event) => setRequestText(event.currentTarget.value)} rows={4} class="mt-1 w-full rounded-lg border border-wedding-border bg-white p-3 text-base font-normal leading-6 outline-none focus:border-wedding-primary focus:ring-4 focus:ring-wedding-primary/15" placeholder="For example: a photography package covering preparation through speeches" />
          </label>
          <dl class="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <For each={[
              ["Category", brief().category], ["Date", brief().dateOrSeason],
              ["Location", brief().location], ["Guests", brief().guestCount],
              ["Category budget", brief().approximateCategoryBudget ? budgetLabel(brief().approximateCategoryBudget!.amount, brief().approximateCategoryBudget!.currency) : null],
            ] as const}>{(item) => <div class="rounded-lg bg-wedding-slate p-2"><dt class="text-xs font-semibold uppercase tracking-wide text-wedding-ink/55">{item[0]}</dt><dd class="mt-1 break-words text-wedding-ink">{item[1] ?? "Not added yet"}</dd></div>}</For>
          </dl>
          <Show when={brief().missingFacts.length > 0}><p class="mt-3 text-xs leading-5 text-wedding-ink/70">Still useful to add: {brief().missingFacts.join(", ")}.</p></Show>
        </section>

        <section class="rounded-xl border border-wedding-border bg-white p-3" aria-labelledby="proposal-recipients-heading">
          <h3 id="proposal-recipients-heading" class="font-semibold text-wedding-ink">Choose recipients</h3>
          <p class="mt-1 text-xs leading-5 text-wedding-ink/65">Choose up to five vendors from this wedding's current comparison. Each eventual invitation keeps its own private thread.</p>
          <Show when={brief().recipients.length > 0} fallback={<div class="mt-3 rounded-lg bg-wedding-slate p-3 text-sm text-wedding-ink/70">Find and compare vendors first, then return here to choose recipients.<button type="button" class="mt-2 block min-h-11 rounded-lg border border-wedding-secondary bg-white px-3 font-semibold text-wedding-secondary" onClick={props.onFindVendors}>Find vendors</button></div>}>
            <div class="mt-3 grid gap-2"><For each={brief().recipients}>{(vendor) => <label class={`flex min-h-12 items-start gap-3 rounded-lg border p-3 text-sm ${vendor.eligible ? "border-wedding-border text-wedding-ink" : "border-wedding-border bg-wedding-slate text-wedding-ink/65"}`}><input type="checkbox" checked={selectedIds().includes(vendor.choiceId)} disabled={!vendor.eligible} onChange={() => toggleRecipient(vendor.choiceId)} class="mt-0.5 h-5 w-5 accent-wedding-primary disabled:cursor-not-allowed" /><span class="min-w-0"><span class="block break-words font-semibold">{vendor.vendorName}</span><span class="block text-xs text-wedding-ink/60">{vendor.category ?? "Vendor"} · {vendor.eligibilityLabel}</span><span class="mt-1 block text-xs leading-5 text-wedding-ink/60">{vendor.eligibilityReason}</span></span></label>}</For></div>
          </Show>
        </section>
      </div>

      <section class="mt-3 rounded-xl border border-wedding-border bg-white p-3" aria-labelledby="proposal-sharing-heading">
        <h3 id="proposal-sharing-heading" class="font-semibold text-wedding-ink">Preview what may be shared</h3>
        <p class="mt-1 text-xs leading-5 text-wedding-ink/65">Budget and phone contact stay off unless you choose them. Saving this draft does not send it.</p>
        <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"><For each={SHARE_OPTIONS}>{(option) => <label class="flex min-h-11 items-center gap-2 rounded-lg bg-wedding-slate px-3 py-2 text-sm text-wedding-ink"><input type="checkbox" checked={sharing()[option.key]} onChange={(event) => setSharing((current) => ({ ...current, [option.key]: event.currentTarget.checked }))} class="h-5 w-5 accent-wedding-primary" />{option.label}</label>}</For></div>
        <Show when={selectedRecipients().length > 0}><p class="mt-3 text-xs text-wedding-ink/70">Intended recipients: {selectedRecipients().map((item) => item.vendorName).join(", ")}.</p></Show>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" disabled={saving() || Boolean(validation()) || !props.workspace.saveProjection} class="min-h-11 rounded-lg bg-wedding-primary px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45" onClick={() => void saveDraft()}>{saving() ? "Saving…" : "Save private draft"}</button>
          <p class="text-xs leading-5 text-wedding-ink/65">Sending will use the existing review-and-approve enquiry step.</p>
        </div>
        <Show when={notice()}>{(message) => <p class="mt-3 rounded-lg border border-wedding-border bg-wedding-page p-2 text-sm text-wedding-ink" role="status" aria-live="polite">{message()}</p>}</Show>
      </section>
    </section>
  );
}
