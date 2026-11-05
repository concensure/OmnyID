// @locs-version: 1.0
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import type { WeddingResponseWorkspaceViewProps } from "@/components/WeddingResponseWorkspaceViewTypes";
import { recordWeddingVendorContact } from "@/lib/api";
import { friendlyErrorText } from "@/lib/visibleErrorText";
import {
  approveAndSendWeddingInviteProposal,
} from "@/lib/weddingInviteProposalApi";
import type { WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";
import {
  approveWeddingInviteProposalBatch,
  buildWeddingInviteProposalBatch,
  type WeddingInviteProposalBatchItem,
} from "@/lib/weddingInviteProposalBatchState";
import {
  buildWeddingInviteProposalBrief,
  defaultWeddingInviteProposalSharing,
  validateWeddingInviteProposalDraft,
  weddingInviteProposalDraftToAfpSendInput,
  WEDDING_INVITE_PROPOSAL_RECIPIENT_LIMIT,
  type WeddingInviteProposalSharing,
} from "@/lib/weddingInviteProposalState";
import {
  weddingVendorOutreachDraftAfpSendInput,
  weddingVendorOutreachSentAfpSendInput,
  weddingVendorOutreachThreadId,
} from "@/lib/weddingVendorOutreachAfpState";

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
  const [sending, setSending] = createSignal(false);
  const [reviewing, setReviewing] = createSignal(false);
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
  const reviewItems = createMemo(() => buildWeddingInviteProposalBatch({
    brief: brief(),
    requestText: requestText(),
    selectedChoiceIds: selectedIds(),
    sharing: sharing(),
  }));

  function toggleRecipient(choiceId: string) {
    setNotice(null);
    setReviewing(false);
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

  function existingExactDraftId(item: WeddingInviteProposalBatchItem): string | null {
    const messages = [...props.workspace.state.afpMessages].reverse();
    const match = messages.find((message) => {
      if ((message.kind ?? message.subtype) !== "wedding_vendor_outreach_draft") return false;
      const content = message.content ?? {};
      return content.choice_id === item.choiceId
        && content.vendor_id === item.vendorId
        && content.to === item.recipientEmail
        && content.subject === item.flow.subject
        && content.text === item.flow.bodyMarkdown;
    });
    return match?.id ?? null;
  }

  async function approveAndSend() {
    const error = validation();
    if (error || !props.workspace.saveProjection || sending()) {
      setNotice(error ?? "Sending is not connected in this view.");
      return;
    }
    setSending(true);
    setNotice(null);
    try {
      const metadata = props.workspace.state.workspace.metadata;
      const items = reviewItems();
      const draftIds: string[] = [];
      for (const item of items) {
        const existingId = existingExactDraftId(item);
        if (existingId) {
          draftIds.push(existingId);
          continue;
        }
        const projection = weddingVendorOutreachDraftAfpSendInput({
          flow: item.flow,
          metadata,
          sourceArtifactId: brief().sourceArtifactId,
          vendorId: item.vendorId,
        });
        if (!projection.id) throw new Error("The saved invitation draft has no stable message reference.");
        await props.workspace.saveProjection(projection);
        draftIds.push(projection.id);
      }
      const result = await approveAndSendWeddingInviteProposal({
        wedding_plan_id: metadata.weddingPlanId,
        brief_id: brief().id,
        revision: 1,
        category: brief().category ?? "",
        location: brief().location,
        draft_message_ids: draftIds,
      });
      const approvedItems = approveWeddingInviteProposalBatch(items);
      for (const delivery of result.deliveries.filter((item) => item.status === "provider_accepted")) {
        const item = approvedItems.find((candidate) => candidate.vendorId === delivery.vendorId);
        if (!item) continue;
        await props.workspace.saveProjection(weddingVendorOutreachSentAfpSendInput({
          flow: item.flow,
          metadata,
          draftMessageId: delivery.draftMessageId,
          providerReceipt: {
            providerMessageId: delivery.providerMessageId,
            clientMessageId: delivery.clientMessageId,
          },
          vendorId: item.vendorId,
        }));
        try {
          await recordWeddingVendorContact(item.vendorId, {
            contact_method: "agent_email_draft",
            thread_id: weddingVendorOutreachThreadId({
              responseWorkspaceId: metadata.responseWorkspaceId,
              choiceId: item.choiceId,
            }),
            receipt_ref: delivery.clientMessageId,
            follow_up_due_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          });
        } catch {
          // The durable sent AFP record is authoritative; contact scheduling can
          // reproject on refresh if this secondary index is briefly unavailable.
        }
      }
      const failed = result.deliveries.filter((item) => item.status === "failed").length;
      setNotice(failed > 0
        ? `${result.deliveries.length - failed} invitation${result.deliveries.length - failed === 1 ? "" : "s"} accepted by the provider; ${failed} still need retrying.`
        : `${result.deliveries.length} invitation${result.deliveries.length === 1 ? "" : "s"} accepted by the provider. Delivery and replies are tracked separately.`);
      props.workspace.onRefreshWorkspace?.();
    } catch (caught) {
      setNotice(friendlyErrorText(caught, "The invitation batch could not be sent. Your saved drafts are unchanged."));
    } finally {
      setSending(false);
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
          <button type="button" disabled={Boolean(validation())} class="min-h-11 rounded-lg border border-wedding-secondary bg-white px-4 text-sm font-bold text-wedding-secondary disabled:cursor-not-allowed disabled:opacity-45" aria-expanded={reviewing()} aria-controls="wedding-proposal-exact-preview" onClick={() => { setNotice(null); setReviewing((value) => !value); }}>{reviewing() ? "Hide invitation preview" : "Review exact invitations"}</button>
          <p class="text-xs leading-5 text-wedding-ink/65">Sending will use the existing review-and-approve enquiry step.</p>
        </div>
        <Show when={notice()}>{(message) => <p class="mt-3 rounded-lg border border-wedding-border bg-wedding-page p-2 text-sm text-wedding-ink" role="status" aria-live="polite">{message()}</p>}</Show>
      </section>
      <Show when={reviewing()}>
        <section id="wedding-proposal-exact-preview" class="mt-3 rounded-xl border border-wedding-border bg-white p-3" aria-labelledby="wedding-proposal-preview-heading">
          <h3 id="wedding-proposal-preview-heading" class="font-semibold text-wedding-ink">Review every recipient and message</h3>
          <p class="mt-1 text-xs leading-5 text-wedding-ink/65">These are separate private vendor threads. Reviewing does not send them, and editing the brief or sharing choices requires another review.</p>
          <div class="mt-3 grid gap-3">
            <For each={reviewItems()}>{(item, index) => <article class="rounded-lg border border-wedding-border bg-wedding-page p-3" aria-labelledby={`wedding-proposal-preview-${index()}`}>
              <h4 id={`wedding-proposal-preview-${index()}`} class="font-semibold text-wedding-ink">{item.vendorName}</h4>
              <p class="mt-1 break-all text-xs text-wedding-ink/65">To: {item.recipientEmail}</p>
              <p class="mt-3 text-xs font-semibold uppercase tracking-wide text-wedding-ink/55">Subject</p>
              <p class="mt-1 text-sm text-wedding-ink">{item.flow.subject}</p>
              <p class="mt-3 text-xs font-semibold uppercase tracking-wide text-wedding-ink/55">Message</p>
              <div class="mt-1 whitespace-pre-wrap text-sm leading-6 text-wedding-ink">{item.flow.bodyMarkdown}</div>
            </article>}</For>
          </div>
          <div class="mt-4 rounded-lg bg-wedding-slate p-3 text-sm leading-6 text-wedding-ink/75">
            <strong class="text-wedding-ink">No invitation has been sent.</strong> The final action will recheck each vendor on the server and ask for one explicit approval for this exact batch revision.
          </div>
          <div class="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" class="min-h-11 rounded-lg bg-wedding-primary px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45" disabled={sending() || reviewItems().length === 0 || !props.workspace.saveProjection} onClick={() => void approveAndSend()}>{sending() ? "Sending approved invitations…" : `Approve and send ${reviewItems().length} invitation${reviewItems().length === 1 ? "" : "s"}`}</button>
            <p class="text-xs leading-5 text-wedding-ink/65">One approval applies only to the recipients and exact messages shown above.</p>
          </div>
        </section>
      </Show>
    </section>
  );
}
