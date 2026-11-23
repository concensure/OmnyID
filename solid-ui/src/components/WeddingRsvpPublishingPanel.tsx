// @locs-version: 1.0
import { For, Show, createMemo, createSignal, onMount } from "solid-js";
import { readSession, type SendAfpMessageInput } from "@/lib/api";

import type { WeddingGuestTrackingState } from "@/lib/weddingGuestTrackingState";
import { WeddingRsvpExperienceHeader } from "@/components/WeddingRsvpExperienceHeader";
import {
  createWeddingRsvpCapability,
  listWeddingRsvpCapabilities,
  loadWeddingRsvpCapabilityStatus,
  revokeWeddingRsvpCapability,
  weddingRsvpProtectedLink,
  type WeddingRsvpCapabilityGrant,
} from "@/lib/weddingRsvpCapabilityApi";
import {
  buildWeddingRsvpInvitationPreviews,
  type WeddingRsvpSetupState,
} from "@/lib/weddingRsvpSetupState";
import {
  buildWeddingRsvpHouseholdExperience,
  weddingRsvpMaterialPreflightGap,
  weddingRsvpTestLink,
} from "@/lib/weddingRsvpHouseholdExperienceState";
import { normalizeWeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";
import { friendlyErrorText } from "@/lib/visibleErrorText";
import { sendApprovedWeddingRsvpTest, weddingRsvpTestDeliveryProviderStatus, type WeddingRsvpTestDeliveryStatus } from "@/lib/weddingRsvpTestDeliveryApi";
import { weddingRsvpTestApprovalToAfp, weddingRsvpTestDraftToAfp, type WeddingRsvpTestDelivery } from "@/lib/weddingRsvpTestDeliveryState";

function futureExpiry(): string {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString().slice(0, 10);
}

function expiryIso(date: string): string {
  return new Date(`${date}T12:00:00.000Z`).toISOString();
}

export function WeddingRsvpPublishingPanel(props: {
  setup: WeddingRsvpSetupState;
  guestTracking: WeddingGuestTrackingState;
  metadata?: unknown;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
}) {
  const metadata = normalizeWeddingPlanningMetadata(props.metadata);
  const previews = createMemo(() => buildWeddingRsvpInvitationPreviews(props.setup, props.guestTracking));
  const [enabled, setEnabled] = createSignal(false);
  const [loaded, setLoaded] = createSignal(false);
  const [grants, setGrants] = createSignal<WeddingRsvpCapabilityGrant[]>([]);
  const [selectedHousehold, setSelectedHousehold] = createSignal<string | null>(null);
  const [previewHousehold, setPreviewHousehold] = createSignal<string | null>(null);
  const [expiry, setExpiry] = createSignal(futureExpiry());
  const [confirmed, setConfirmed] = createSignal(false);
  const [requestContactDetails, setRequestContactDetails] = createSignal(false);
  const [loomUrl, setLoomUrl] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [testProvider, setTestProvider] = createSignal<WeddingRsvpTestDeliveryStatus | null>(null);
  const [notice, setNotice] = createSignal("");
  const [createdLink, setCreatedLink] = createSignal("");
  const [createdRecipients, setCreatedRecipients] = createSignal<Array<{ displayName: string; email: string }>>([]);
  const [createdContactRequest, setCreatedContactRequest] = createSignal(false);
  const [createdLoomUrl, setCreatedLoomUrl] = createSignal("");
  const priorLoomUrls = createMemo(() => [...new Set(grants().flatMap((grant) => grant.loom_video_url ? [grant.loom_video_url] : []))]);
  const testPreview = createMemo(() => previews().find((preview) => preview.householdLabel === previewHousehold()) ?? null);
  const previewExperience = createMemo(() => testPreview() ? buildWeddingRsvpHouseholdExperience(props.setup, testPreview()!, "preview") : null);
  const preflightGap = createMemo(() => previewExperience() ? weddingRsvpMaterialPreflightGap(previewExperience()!) : null);
  const testDelivery = createMemo<WeddingRsvpTestDelivery | null>(() => {
    const experience = previewExperience();
    const recipient = readSession()?.user.email?.trim() ?? "";
    if (!experience || !recipient) return null;
    const fallbackUrl = weddingRsvpTestLink({ ...experience, mode: "test" });
    return {
      id: `wedding_rsvp_test:${metadata.responseWorkspaceId}:${testPreview()?.householdId ?? testPreview()?.householdLabel ?? "household"}`,
      recipient,
      subject: `TEST — RSVP for ${experience.eventLabel}`,
      hostLabel: experience.hostLabel,
      fallbackUrl,
      householdLabel: experience.householdLabel,
      body: `TEST — nothing in this message can submit a production RSVP.\n\n${experience.hostLabel} invites ${experience.recipientLabels.join(" and ")} to ${experience.eventLabel}.\nPlease respond by ${experience.responseDeadline}.`,
    };
  });

  function openTestView() {
    const delivery = testDelivery();
    if (!delivery) return;
    window.open(delivery.fallbackUrl, "_blank", "noopener,noreferrer");
  }

  async function sendTestToSelf() {
    const delivery = testDelivery();
    if (!delivery || !props.saveProjection || !testProvider()?.ready || busy()) return;
    setBusy(true); setNotice("");
    try {
      await props.saveProjection(weddingRsvpTestDraftToAfp(delivery, metadata));
      const approval = weddingRsvpTestApprovalToAfp(delivery, metadata);
      await props.saveProjection(approval);
      if (!approval.id) throw new Error("The exact test approval was not stored.");
      const result = await sendApprovedWeddingRsvpTest({ threadId: approval.thread_id, approvalMessageId: approval.id });
      setNotice(result.delivery_status === "delivered" ? `Test delivered to ${delivery.recipient}. The selected household was not contacted.` : `The provider accepted the test for ${delivery.recipient}. Delivery remains separate; household evidence was not changed.`);
    } catch (error) { setNotice(friendlyErrorText(error, "The test was not sent. The selected household was not changed.")); }
    finally { setBusy(false); }
  }

  onMount(async () => {
    void weddingRsvpTestDeliveryProviderStatus().then(setTestProvider).catch(() => setTestProvider({ enabled: false, ready: false, provider: "disabled", reason: "unavailable" }));
    try {
      const [status, current] = await Promise.all([
        loadWeddingRsvpCapabilityStatus(metadata.weddingPlanId, metadata.responseWorkspaceId),
        listWeddingRsvpCapabilities(metadata.weddingPlanId, metadata.responseWorkspaceId),
      ]);
      setEnabled(status.enabled);
      setGrants(current);
    } catch (error) {
      setNotice(friendlyErrorText(error, "Protected RSVP links could not be checked."));
    } finally {
      setLoaded(true);
    }
  });

  const activeGrant = (householdId: string | null) => grants().find((grant) => (
    householdId && grant.household_id === householdId && !grant.revoked_at && Date.parse(grant.expires_at) > Date.now()
  ));

  const contactEmailForInvitation = (invitationId: string): string | null => {
    const row = props.guestTracking.guestRows?.find((guest) => (
      guest.eventResponses.some((response) => response.invitationId === invitationId)
    ));
    return row?.contactLabel?.includes("@") ? row.contactLabel.trim() : null;
  };

  async function createLink() {
    const household = previews().find((preview) => preview.householdId === selectedHousehold());
    if (!enabled() || !household?.householdId || !confirmed() || busy()) return;
    setBusy(true);
    setNotice("");
    try {
      const created = await createWeddingRsvpCapability({
        weddingPlanId: metadata.weddingPlanId,
        responseWorkspaceId: metadata.responseWorkspaceId,
        householdId: household.householdId,
        invitationIds: household.recipients.map((recipient) => recipient.invitationId),
        expiresAt: expiryIso(expiry()),
        requestContactDetails: requestContactDetails(),
        loomVideoUrl: loomUrl(),
      });
      setGrants((current) => [created.grant, ...current]);
      setCreatedLink(weddingRsvpProtectedLink(created.token));
      setCreatedRecipients(household.recipients.flatMap((recipient) => {
        const email = contactEmailForInvitation(recipient.invitationId);
        return email ? [{ displayName: recipient.displayName, email }] : [];
      }));
      setCreatedContactRequest(requestContactDetails());
      setCreatedLoomUrl(loomUrl().trim());
      setNotice("Protected link created. It has not been sent to anyone.");
      setSelectedHousehold(null);
      setConfirmed(false);
      setRequestContactDetails(false);
    } catch (error) {
      setNotice(friendlyErrorText(error, "The protected RSVP link could not be created."));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(grantId: string) {
    if (busy()) return;
    setBusy(true);
    setNotice("");
    try {
      const revoked = await revokeWeddingRsvpCapability({
        grantId,
        weddingPlanId: metadata.weddingPlanId,
        responseWorkspaceId: metadata.responseWorkspaceId,
      });
      setGrants((current) => current.map((grant) => grant.grant_id === grantId ? revoked : grant));
      setNotice("Protected link revoked. It can no longer open the RSVP.");
    } catch (error) {
      setNotice(friendlyErrorText(error, "The protected RSVP link could not be revoked."));
    } finally {
      setBusy(false);
    }
  }

  async function copyCreatedLink() {
    if (!createdLink()) return;
    await navigator.clipboard.writeText(createdLink());
    setNotice("Protected link copied. Review the recipient before sending it yourself.");
  }

  function emailHref(recipient: { displayName: string; email: string }): string {
    const subject = createdContactRequest()
      ? `Please confirm your details and RSVP for ${props.setup.eventLabel}`
      : `Your RSVP for ${props.setup.eventLabel}`;
    const detailRequest = createdContactRequest()
      ? "Please also confirm your name, email, phone number and relationship to us. "
      : "";
    const video = createdLoomUrl() ? `We also recorded a short hello for you: ${createdLoomUrl()}\n\n` : "";
    const body = `Hi ${recipient.displayName},\n\n${video}Please use this protected link to reply for ${props.setup.eventLabel}. ${detailRequest}Only the people named on your invitation are shown.\n\n${createdLink()}\n\nThank you.`;
    return `mailto:${encodeURIComponent(recipient.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return <section class="mt-4 rounded-2xl border border-teal-200 bg-white p-3" aria-labelledby="rsvp-publish-title">
    <h4 id="rsvp-publish-title" class="text-sm font-semibold text-teal-950">Protected household links</h4>
    <p class="mt-1 text-xs leading-5 text-teal-950/70">Creating a link does not send it. Each link opens only the named people and event shown below.</p>
    <Show when={loaded()} fallback={<p role="status" class="mt-2 text-xs text-teal-900">Checking protected-link availability…</p>}>
      <Show when={!enabled()}><p class="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">Protected RSVP publishing is safely switched off in this environment. Draft setup and previews still work.</p></Show>
        <div class="mt-3 grid gap-2">
          <For each={previews()}>{(preview) => {
            const grant = () => activeGrant(preview.householdId);
            return <article class="rounded-xl border border-teal-100 p-3">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div class="min-w-0"><p class="break-words text-sm font-semibold text-teal-950">{preview.householdLabel}</p><p class="mt-0.5 break-words text-xs text-teal-950/65">{preview.recipients.map((recipient) => recipient.displayName).join(" · ")}</p></div>
                <div class="grid gap-2 sm:grid-cols-2">
                  <button type="button" class="min-h-11 rounded-lg border border-teal-300 px-3 text-sm font-semibold text-teal-950" onClick={() => { setPreviewHousehold(preview.householdLabel); setSelectedHousehold(null); }}>Preview as this household</button>
                  <Show when={enabled()}>
                    <Show when={preview.householdId} fallback={<span class="flex min-h-11 items-center text-xs font-semibold text-amber-800">Save this household before publishing</span>}>
                      <Show when={grant()} fallback={<button type="button" class="min-h-11 rounded-lg border border-teal-300 px-3 text-sm font-semibold text-teal-950" onClick={() => { setSelectedHousehold(preview.householdId); setPreviewHousehold(null); setCreatedLink(""); setCreatedRecipients([]); setCreatedContactRequest(false); setNotice(""); }}>Create link</button>}>
                        {(current) => <button type="button" disabled={busy()} class="min-h-11 rounded-lg border border-rose-200 px-3 text-sm font-semibold text-rose-900" onClick={() => void revoke(current().grant_id)}>Revoke link</button>}
                      </Show>
                    </Show>
                  </Show>
                </div>
              </div>
            </article>;
          }}</For>
        </div>
    </Show>
    <Show when={testPreview()}>{(preview) => <div role="dialog" aria-modal="true" aria-labelledby="rsvp-test-preview-title" class="mt-3 min-w-0 overflow-hidden rounded-xl border-2 border-sky-300 bg-sky-50 p-3">
      <span id="rsvp-test-preview-title" class="sr-only">Preview RSVP as {preview().householdLabel}</span>
      <Show when={previewExperience()}>{(experience) => <WeddingRsvpExperienceHeader experience={experience()} />}</Show>
      <div class="mt-3 grid gap-2"><For each={preview().recipients}>{(recipient) => <div class="rounded-lg border border-sky-100 bg-white p-3"><p class="font-semibold text-teal-950">{recipient.displayName}</p><p class="mt-1 text-xs text-teal-900/70">{recipient.plusOneAllowed ? "Plus-one included as a separately named guest. " : ""}{recipient.childrenInvited ? "Named children appear separately. " : ""}Current response: {recipient.responseStatus.replaceAll("_", " ")}.</p></div>}</For></div>
      <div class="mt-3 rounded-lg border border-sky-100 bg-white p-3"><p class="text-sm font-semibold text-teal-950">Questions this household will see</p><ul class="mt-1 grid gap-1 text-xs leading-5 text-teal-900/75"><For each={preview().questions}>{(question) => <li>{question.label}{question.required ? " · required" : " · optional"}{question.sensitive ? " · encrypted private answer" : ""}</li>}</For></ul></div>
      <p class="mt-3 text-xs leading-5 text-teal-900/75">{preview().privacyLabel}</p>
      <Show when={preflightGap()}>{(gap) => <div class="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950"><strong>Check before publishing:</strong> {gap().label} <button type="button" class="ml-1 font-semibold underline" onClick={() => document.getElementById("wedding-rsvp-setup-title")?.scrollIntoView({ behavior: "smooth", block: "start" })}>{gap().actionLabel}</button></div>}</Show>
      <Show when={testDelivery()}>{(delivery) => <div class="mt-3 rounded-lg border border-sky-200 bg-white p-3 text-xs leading-5 text-teal-950"><p><strong>Recipient:</strong> {delivery().recipient}</p><p><strong>Subject:</strong> {delivery().subject}</p><p><strong>Host/sender label:</strong> {delivery().hostLabel}</p><p class="break-all"><strong>Fallback URL:</strong> {delivery().fallbackUrl}</p><pre class="mt-2 max-w-full whitespace-pre-wrap break-words rounded bg-sky-50 p-2 font-sans">{delivery().body}</pre></div>}</Show>
      <div class="mt-3 flex flex-wrap gap-2"><button type="button" class="min-h-11 rounded-lg bg-sky-800 px-4 text-sm font-semibold text-white" onClick={openTestView}>Open test view</button><button type="button" disabled={!testDelivery() || !props.saveProjection || !testProvider()?.ready || busy()} class="min-h-11 rounded-lg bg-teal-800 px-4 text-sm font-semibold text-white disabled:opacity-45" onClick={() => void sendTestToSelf()}>{busy() ? "Sending test…" : "Send test to me"}</button><button type="button" class="min-h-11 rounded-lg border border-sky-300 bg-white px-4 text-sm font-semibold text-teal-950" onClick={() => setPreviewHousehold(null)}>Close preview</button></div>
    </div>}</Show>
    <Show when={selectedHousehold()}>
      <div role="dialog" aria-modal="true" aria-labelledby="rsvp-create-link-title" class="mt-3 rounded-xl border-2 border-teal-300 bg-teal-50 p-3">
        <h5 id="rsvp-create-link-title" class="text-sm font-semibold text-teal-950">Create this protected link?</h5>
        <p class="mt-1 text-xs leading-5 text-teal-950/70">This creates one household-scoped link for {props.setup.eventLabel}. It does not email, text or notify anyone.</p>
        <label class="mt-3 block text-xs font-semibold text-teal-950/75">Link expires<input type="date" min={new Date().toISOString().slice(0, 10)} value={expiry()} onInput={(event) => setExpiry(event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-lg border border-teal-200 bg-white px-3 text-sm" /></label>
        <label class="mt-3 flex min-h-11 items-start gap-2 rounded-lg border border-teal-100 bg-white px-3 py-2 text-xs font-semibold text-teal-950"><input type="checkbox" class="mt-0.5 h-5 w-5 accent-teal-800" checked={requestContactDetails()} onChange={(event) => setRequestContactDetails(event.currentTarget.checked)} /><span>Ask each named guest to confirm their name, email, phone and relationship to us in the same protected RSVP.</span></label>
        <label class="mt-3 block text-xs font-semibold text-teal-950/75">Optional Loom video<input type="url" list="wedding-rsvp-loom-history" placeholder="https://www.loom.com/share/…" value={loomUrl()} onInput={(event) => setLoomUrl(event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-lg border border-teal-200 bg-white px-3 text-sm font-normal" /><span class="mt-1 block font-normal leading-5">Paste a public Loom share link. <a class="font-semibold underline" href="https://www.loom.com/record" target="_blank" rel="noreferrer">Create a video in Loom</a>.</span></label>
        <datalist id="wedding-rsvp-loom-history"><For each={priorLoomUrls()}>{(url) => <option value={url} />}</For></datalist>
        <label class="mt-3 flex min-h-11 items-start gap-2 text-xs font-semibold text-teal-950"><input type="checkbox" class="mt-0.5 h-5 w-5 accent-teal-800" checked={confirmed()} onChange={(event) => setConfirmed(event.currentTarget.checked)} />I checked the named recipients, event and expiry. I understand this only creates a link.</label>
        <div class="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" class="min-h-11 rounded-lg border border-teal-200 bg-white font-semibold text-teal-950" onClick={() => { setSelectedHousehold(null); setConfirmed(false); setRequestContactDetails(false); }}>Cancel</button><button type="button" disabled={!confirmed() || busy()} class="min-h-11 rounded-lg bg-teal-800 font-semibold text-white disabled:bg-teal-300" onClick={() => void createLink()}>{busy() ? "Creating…" : "Confirm and create link"}</button></div>
      </div>
    </Show>
    <Show when={createdLink()}><div class="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p class="text-xs font-semibold text-emerald-950">Send or copy this link now. OmnyID stores only its digest.</p><p class="mt-1 break-all text-xs text-emerald-900">{createdLink()}</p><div class="mt-2 grid gap-2 sm:grid-cols-2"><For each={createdRecipients()}>{(recipient) => <a class="flex min-h-11 items-center justify-center rounded-lg bg-emerald-800 px-3 text-center text-sm font-semibold text-white" href={emailHref(recipient)}>Email {recipient.displayName}</a>}</For><button type="button" class="min-h-11 rounded-lg border border-emerald-700 bg-white px-3 text-sm font-semibold text-emerald-950" onClick={() => void copyCreatedLink()}>Copy protected link</button></div><Show when={createdRecipients().length === 0}><p class="mt-2 text-xs leading-5 text-emerald-950/75">Add the guest's email to their contact first, then recreate the link to open a ready-to-send email.</p></Show></div></Show>
    <Show when={notice()}><p role="status" class="mt-3 text-xs leading-5 text-teal-950">{notice()}</p></Show>
  </section>;
}
