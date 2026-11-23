// @locs-version: 1.0
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";

import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import { readSession } from "@/lib/api";
import { loadContacts, subscribeContactsChangedEvent, type Contact } from "@/lib/contactsLocalState";
import type { WeddingGuestTrackingState } from "@/lib/weddingGuestTrackingState";
import { buildWeddingRsvpHouseholdLifecycles } from "@/lib/weddingRsvpLifecycleState";
import {
  sendApprovedWeddingRsvpReminder,
  weddingRsvpReminderProviderStatus,
  type WeddingRsvpReminderProviderStatus,
} from "@/lib/weddingRsvpReminderApi";
import {
  buildWeddingRsvpReminderCandidates,
  weddingRsvpReminderApprovalToAfpSendInput,
  weddingRsvpReminderDraftToAfpSendInput,
  weddingRsvpReminderReceiptsFromAfpMessages,
  type WeddingRsvpReminderCandidate,
} from "@/lib/weddingRsvpReminderState";
import type { WeddingRsvpSetupState } from "@/lib/weddingRsvpSetupState";
import { friendlyErrorText } from "@/lib/visibleErrorText";

type Draft = { email: string; body: string };

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function contactFor(candidate: WeddingRsvpReminderCandidate, contacts: readonly Contact[]): Contact | null {
  const emails = new Set(candidate.contactLabels.map((value) => value.trim().toLowerCase()));
  const names = new Set(candidate.recipientLabels.map((value) => value.trim().toLowerCase()));
  return contacts.find((contact) => (
    (contact.email && emails.has(contact.email.trim().toLowerCase()))
    || names.has(contact.name.trim().toLowerCase())
  )) ?? null;
}

export function WeddingDecisionRsvpFollowUp(props: {
  setup: WeddingRsvpSetupState;
  guestTracking: WeddingGuestTrackingState;
  afpMessages: readonly AfpMessage[];
  metadata?: unknown;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: (() => void) | null;
}) {
  const [drafts, setDrafts] = createSignal<Record<string, Draft>>({});
  const [contacts, setContacts] = createSignal<Contact[]>([]);
  const [detailsId, setDetailsId] = createSignal<string | null>(null);
  const [busyId, setBusyId] = createSignal<string | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [provider, setProvider] = createSignal<WeddingRsvpReminderProviderStatus | null>(null);
  const receipts = createMemo(() => weddingRsvpReminderReceiptsFromAfpMessages(props.afpMessages));
  const candidates = createMemo(() => buildWeddingRsvpReminderCandidates({
    guestTracking: props.guestTracking,
    eventId: props.setup.eventId,
    eventLabel: props.setup.eventLabel,
    hostLabel: props.setup.hostLabel,
    responseDeadline: props.setup.responseDeadline,
    priorReminderHouseholdIds: receipts()
      .filter((receipt) => receipt.deliveryStatus === "provider_accepted" || receipt.deliveryStatus === "delivered")
      .map((receipt) => receipt.householdId),
    quietHoursActive: new Date().getHours() >= 21 || new Date().getHours() < 8,
  }));
  const lifecycles = createMemo(() => buildWeddingRsvpHouseholdLifecycles({
    guestTracking: props.guestTracking,
    eventId: props.setup.eventId,
    responseDeadline: props.setup.responseDeadline,
    afpMessages: props.afpMessages,
    reminderReceipts: receipts(),
  }));
  const actionableLifecycles = createMemo(() => lifecycles().filter((lifecycle) => lifecycle.responseState !== "complete" && lifecycle.followUpDue));

  createEffect(() => {
    const next = { ...drafts() };
    let changed = false;
    for (const candidate of candidates()) {
      if (next[candidate.id]) continue;
      next[candidate.id] = { email: candidate.contactLabels[0] ?? "", body: candidate.exactContent };
      changed = true;
    }
    if (changed) setDrafts(next);
  });

  onMount(() => {
    const userId = readSession()?.user?.id ?? null;
    const refreshContacts = () => setContacts(loadContacts(userId));
    refreshContacts();
    const unsubscribe = subscribeContactsChangedEvent(refreshContacts);
    onCleanup(unsubscribe);
    void weddingRsvpReminderProviderStatus()
      .then(setProvider)
      .catch(() => setProvider({ enabled: false, ready: false, provider: "disabled", reason: "unavailable" }));
  });

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] ?? { email: "", body: "" }), ...patch } }));
    setNotice(null);
  }

  function editedCandidate(candidate: WeddingRsvpReminderCandidate): WeddingRsvpReminderCandidate | null {
    const draft = drafts()[candidate.id];
    if (!draft || !validEmail(draft.email) || !draft.body.trim()) return null;
    return { ...candidate, contactLabels: [draft.email.trim().toLowerCase()], exactContent: draft.body.trim() };
  }

  async function saveDraft(candidate: WeddingRsvpReminderCandidate) {
    const edited = editedCandidate(candidate);
    if (!edited || !props.saveProjection || busyId()) return;
    setBusyId(candidate.id);
    setNotice(null);
    try {
      await props.saveProjection(weddingRsvpReminderDraftToAfpSendInput(edited, props.metadata));
      props.onRefreshWorkspace?.();
      setNotice(`Draft saved for ${candidate.householdLabel}. Nothing was sent.`);
    } catch (error) {
      setNotice(friendlyErrorText(error, "The RSVP reminder draft could not be saved."));
    } finally {
      setBusyId(null);
    }
  }

  async function send(candidate: WeddingRsvpReminderCandidate) {
    const edited = editedCandidate(candidate);
    if (!edited || !props.saveProjection || !provider()?.ready || busyId()) return;
    setBusyId(candidate.id);
    setNotice(null);
    try {
      await props.saveProjection(weddingRsvpReminderDraftToAfpSendInput(edited, props.metadata));
      const approval = weddingRsvpReminderApprovalToAfpSendInput(edited, props.metadata);
      await props.saveProjection(approval);
      if (!approval.id) throw new Error("The RSVP approval did not produce a durable message id.");
      const result = await sendApprovedWeddingRsvpReminder({
        threadId: approval.thread_id,
        approvalMessageId: approval.id,
      });
      props.onRefreshWorkspace?.();
      setNotice(result.deliveryStatus === "delivered"
        ? `RSVP reminder delivered to ${edited.contactLabels[0]}. Duplicate sends are blocked.`
        : result.deliveryStatus === "provider_accepted"
          ? `The email provider accepted the reminder to ${edited.contactLabels[0]}. Delivery is tracked separately.`
          : "The reminder was not delivered. Automatic retry is blocked until you review it.");
    } catch (error) {
      props.onRefreshWorkspace?.();
      setNotice(friendlyErrorText(error, "The RSVP reminder was not sent. Review the provider outcome before trying again."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section class="rounded-xl border border-pink-200 bg-white p-3 text-pink-950" aria-label="Message guests awaiting an RSVP">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-pink-900/70">Message the guest</p>
          <p class="mt-1 text-sm leading-6">Review the exact recipient and wording. Sending is an external action and happens only when you press Send reminder.</p>
        </div>
        <span class="rounded-full bg-pink-50 px-2.5 py-1 text-xs font-semibold">{candidates().length} ready</span>
      </div>
      <Show when={provider() && !provider()?.ready}>
        <p class="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">You can edit and save a draft. External delivery is currently unavailable, so nothing can be sent yet.</p>
      </Show>
      <div class="mt-3 grid gap-2" aria-label="RSVP follow-up evidence">
        <For each={actionableLifecycles()}>{(lifecycle) => <article class="rounded-lg border border-pink-100 bg-white px-3 py-2">
          <div class="flex flex-wrap items-center justify-between gap-2"><p class="text-sm font-semibold">{lifecycle.householdLabel}</p><Show when={lifecycle.followUpDue}><span class="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-950">Follow-up due</span></Show></div>
          <p class="mt-1 text-xs leading-5 text-pink-950/70">{lifecycle.evidenceLabels.join(" · ")}</p>
          <p class="mt-1 text-xs leading-5"><strong>Next:</strong> {lifecycle.nextAction}</p>
          <button type="button" class="mt-2 min-h-11 rounded-lg border border-pink-200 bg-pink-50 px-3 text-xs font-semibold text-pink-900" onClick={() => (lifecycle.actionLabel === "Record phone reply" ? document.getElementById("wedding-guest-operations") : document.querySelector<HTMLElement>(`[data-rsvp-household='${CSS.escape(lifecycle.householdId)}']`))?.scrollIntoView({ behavior: "smooth", block: "center" })}>{lifecycle.actionLabel}</button>
        </article>}</For>
      </div>
      <Show when={candidates().length > 0} fallback={<p class="mt-3 rounded-lg bg-pink-50 px-3 py-2 text-sm">No eligible pending guest has both reminder permission and an email address.</p>}>
        <div class="mt-3 grid gap-3">
          <For each={candidates()}>{(candidate) => {
            const matchedContact = () => contactFor(candidate, contacts());
            const draft = () => drafts()[candidate.id] ?? { email: "", body: "" };
            return <article data-rsvp-household={candidate.householdId ?? ""} class="rounded-xl border border-pink-100 bg-pink-50/40 p-3">
              <p class="text-sm font-semibold">{candidate.recipientLabels.join(" and ")}</p>
              <p class="mt-1 text-xs leading-5 text-pink-950/70">{candidate.reasonLabel}</p>
              <label class="mt-3 block text-xs font-semibold">Email address
                <input type="email" inputMode="email" autocomplete="email" class="mt-1 min-h-11 w-full rounded-lg border border-pink-200 bg-white px-3 text-sm" value={draft().email} onInput={(event) => updateDraft(candidate.id, { email: event.currentTarget.value })} />
              </label>
              <label class="mt-3 block text-xs font-semibold">Message
                <textarea rows={9} class="mt-1 w-full resize-y rounded-lg border border-pink-200 bg-white px-3 py-2 text-sm leading-6" value={draft().body} onInput={(event) => updateDraft(candidate.id, { body: event.currentTarget.value })} />
              </label>
              <button type="button" class="mt-2 text-xs font-semibold text-pink-800 underline underline-offset-2" aria-expanded={detailsId() === candidate.id} onClick={() => setDetailsId((current) => current === candidate.id ? null : candidate.id)}>{detailsId() === candidate.id ? "Hide other details" : "View other details about this person"}</button>
              <Show when={detailsId() === candidate.id}>
                <div class="mt-2 rounded-lg border border-pink-100 bg-white px-3 py-2 text-xs leading-5">
                  <p><strong>Email:</strong> {draft().email || "Not available"}</p>
                  <p><strong>Phone:</strong> {matchedContact()?.phone || "Not available"}</p>
                  <Show when={matchedContact()?.roles?.length}><p><strong>Role:</strong> {matchedContact()!.roles!.join(", ")}</p></Show>
                  <Show when={matchedContact()?.notes}><p><strong>Notes:</strong> {matchedContact()!.notes}</p></Show>
                </div>
              </Show>
              <div class="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={!editedCandidate(candidate) || !props.saveProjection || busyId() === candidate.id} class="min-h-11 rounded-lg border border-pink-300 bg-white px-4 text-sm font-semibold disabled:opacity-45" onClick={() => void saveDraft(candidate)}>Save draft</button>
                <button type="button" disabled={!editedCandidate(candidate) || !props.saveProjection || !provider()?.ready || !candidate.sendAllowedNow || busyId() === candidate.id} title={candidate.sendBlockReason ?? (!provider()?.ready ? "Email delivery is not ready." : "Sends this exact message") } class="min-h-11 rounded-lg bg-pink-700 px-4 text-sm font-semibold text-white disabled:opacity-45" onClick={() => void send(candidate)}>{busyId() === candidate.id ? "Sending…" : "Send reminder"}</button>
              </div>
              <Show when={candidate.sendBlockReason}><p class="mt-2 text-xs font-semibold text-amber-900">{candidate.sendBlockReason}</p></Show>
            </article>;
          }}</For>
        </div>
      </Show>
      <Show when={notice()}>{(message) => <p role="status" class="mt-3 rounded-lg border border-pink-100 bg-pink-50 px-3 py-2 text-xs leading-5">{message()}</p>}</Show>
    </section>
  );
}
