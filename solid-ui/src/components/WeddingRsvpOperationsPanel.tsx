// @locs-version: 1.0
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";

import { WeddingConfirmDialog } from "@/components/WeddingConfirmDialog";
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import type { WeddingGuestTrackingState } from "@/lib/weddingGuestTrackingState";
import {
  buildWeddingRsvpCoupleCsv,
  buildWeddingRsvpVendorExportPreview,
  weddingRsvpExportCorrectionToAfpSendInput,
  weddingRsvpExportReceiptToAfpSendInput,
  weddingRsvpExportReceiptsFromAfpMessages,
  weddingRsvpExportRevocationToAfpSendInput,
  weddingRsvpVendorPreviewCsv,
  type WeddingRsvpVendorExportAudience,
} from "@/lib/weddingRsvpExportState";
import { buildWeddingRsvpReconciliationState } from "@/lib/weddingRsvpReconciliationState";
import {
  buildWeddingRsvpReminderCandidates,
  weddingRsvpReminderApprovalToAfpSendInput,
  weddingRsvpReminderDraftToAfpSendInput,
  weddingRsvpReminderReceiptsFromAfpMessages,
} from "@/lib/weddingRsvpReminderState";
import type { WeddingRsvpSetupState } from "@/lib/weddingRsvpSetupState";
import { friendlyErrorText } from "@/lib/visibleErrorText";
import {
  sendApprovedWeddingRsvpReminder,
  weddingRsvpReminderProviderStatus,
  type WeddingRsvpReminderProviderStatus,
} from "@/lib/weddingRsvpReminderApi";

function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function WeddingRsvpOperationsPanel(props: {
  setup: WeddingRsvpSetupState;
  guestTracking: WeddingGuestTrackingState;
  metadata?: unknown;
  afpMessages?: readonly AfpMessage[] | null;
  onSaveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: (() => void) | null;
}) {
  const [reminderOpen, setReminderOpen] = createSignal(false);
  const [exportsOpen, setExportsOpen] = createSignal(false);
  const [audience, setAudience] = createSignal<WeddingRsvpVendorExportAudience>("caterer");
  const [recipientLabel, setRecipientLabel] = createSignal("");
  const [includeDietaryDetails, setIncludeDietaryDetails] = createSignal(false);
  const [pendingExport, setPendingExport] = createSignal(false);
  const [correctingReceiptId, setCorrectingReceiptId] = createSignal<string | null>(null);
  const [pendingRevocationId, setPendingRevocationId] = createSignal<string | null>(null);
  const [pendingReminderApprovalId, setPendingReminderApprovalId] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [providerStatus, setProviderStatus] = createSignal<WeddingRsvpReminderProviderStatus | null>(null);
  const [providerStatusLoaded, setProviderStatusLoaded] = createSignal(false);
  const reconciliation = createMemo(() => buildWeddingRsvpReconciliationState({
    guestTracking: props.guestTracking,
    eventId: props.setup.eventId,
    requiredQuestionIds: props.setup.questions.filter((question) => question.required).map((question) => question.id),
  }));
  const reminderReceipts = createMemo(() => weddingRsvpReminderReceiptsFromAfpMessages(props.afpMessages));
  const approvedReminder = (householdId: string | null) => reminderReceipts()
    .find((receipt) => receipt.householdId === householdId && receipt.deliveryStatus === "approved") ?? null;
  const reminders = createMemo(() => {
    const hour = new Date().getHours();
    const priorReminderHouseholdIds = reminderReceipts()
      .filter((receipt) => receipt.deliveryStatus === "provider_accepted" || receipt.deliveryStatus === "delivered")
      .map((receipt) => receipt.householdId);
    return buildWeddingRsvpReminderCandidates({
      guestTracking: props.guestTracking,
      eventId: props.setup.eventId,
      eventLabel: props.setup.eventLabel,
      hostLabel: props.setup.hostLabel,
      responseDeadline: props.setup.responseDeadline,
      priorReminderHouseholdIds,
      quietHoursActive: hour >= 21 || hour < 8,
    });
  });
  const vendorPreview = createMemo(() => buildWeddingRsvpVendorExportPreview({
    guestTracking: props.guestTracking,
    eventId: props.setup.eventId,
    audience: audience(),
    includeDietaryDetails: includeDietaryDetails(),
  }));
  const exportReceipts = createMemo(() => weddingRsvpExportReceiptsFromAfpMessages(props.afpMessages));
  createEffect(() => {
    if (!reminderOpen() || providerStatusLoaded()) return;
    setProviderStatusLoaded(true);
    void weddingRsvpReminderProviderStatus()
      .then(setProviderStatus)
      .catch(() => setProviderStatus({ enabled: false, ready: false, provider: "disabled", reason: "unavailable" }));
  });
  const saveReminderDraft = async (index: number) => {
    const candidate = reminders()[index];
    if (!candidate || !props.onSaveProjection || busy()) return;
    setBusy(true);
    setNotice(null);
    try {
      await props.onSaveProjection(weddingRsvpReminderDraftToAfpSendInput(candidate, props.metadata));
      props.onRefreshWorkspace?.();
      setNotice(`Reminder draft saved for ${candidate.householdLabel}. Nothing was sent.`);
    } catch (error) {
      setNotice(friendlyErrorText(error, "The reminder draft could not be saved."));
    } finally {
      setBusy(false);
    }
  };
  const approveExport = async () => {
    const recipient = recipientLabel().trim();
    if (!recipient || !props.onSaveProjection || busy()) return;
    setBusy(true);
    setNotice(null);
    try {
      const preview = vendorPreview();
      const previous = exportReceipts().find((receipt) => receipt.receiptId === correctingReceiptId());
      await props.onSaveProjection(previous
        ? weddingRsvpExportCorrectionToAfpSendInput({ previousReceipt: previous, preview, approvedBy: "couple", metadata: props.metadata })
        : weddingRsvpExportReceiptToAfpSendInput({ preview, recipientLabel: recipient, approvedBy: "couple", metadata: props.metadata }));
      downloadText(`${audience()}-rsvp-brief.csv`, weddingRsvpVendorPreviewCsv(preview));
      setPendingExport(false);
      setCorrectingReceiptId(null);
      setNotice(`${previous ? "Correction recorded" : "Approval recorded"} for ${recipient} and the brief was downloaded. OmnyID did not send it.`);
    } catch (error) {
      setNotice(friendlyErrorText(error, "The approval receipt could not be saved, so no brief was downloaded."));
    } finally {
      setBusy(false);
    }
  };
  const approveReminder = async () => {
    const candidate = reminders().find((item) => item.id === pendingReminderApprovalId());
    if (!candidate || !props.onSaveProjection || busy()) return;
    setBusy(true);
    setNotice(null);
    try {
      await props.onSaveProjection(weddingRsvpReminderApprovalToAfpSendInput(candidate, props.metadata));
      props.onRefreshWorkspace?.();
      setPendingReminderApprovalId(null);
      setNotice(`Exact email content and recipient approved for ${candidate.householdLabel}. Nothing was sent or submitted to a provider.`);
    } catch (error) {
      setNotice(friendlyErrorText(error, "The reminder approval could not be saved."));
    } finally {
      setBusy(false);
    }
  };
  const sendReminder = async (householdId: string | null) => {
    const approval = approvedReminder(householdId);
    if (!approval || busy()) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await sendApprovedWeddingRsvpReminder({
        threadId: approval.threadId,
        approvalMessageId: approval.messageId,
      });
      props.onRefreshWorkspace?.();
      setNotice(result.deliveryStatus === "delivered"
        ? "Reminder delivered and recorded. Duplicate sends are blocked."
        : result.deliveryStatus === "provider_accepted"
          ? "The provider accepted the reminder. Delivery remains separate and duplicate sends are blocked."
          : "The reminder was not delivered. Automatic retry is blocked pending review.");
    } catch (error) {
      props.onRefreshWorkspace?.();
      setNotice(friendlyErrorText(error, "The reminder was not sent. Any provider outcome will be reconciled before another attempt."));
    } finally {
      setBusy(false);
    }
  };
  const beginCorrection = (receiptId: string) => {
    const receipt = exportReceipts().find((item) => item.receiptId === receiptId);
    if (!receipt) return;
    setAudience(receipt.audience);
    setRecipientLabel(receipt.recipientLabel);
    setCorrectingReceiptId(receipt.receiptId);
    setExportsOpen(true);
    setNotice("Review the current rows and fields. The new download will be recorded as a correction to the earlier brief.");
  };
  const confirmRevocation = async () => {
    const receipt = exportReceipts().find((item) => item.receiptId === pendingRevocationId());
    if (!receipt || !props.onSaveProjection || busy()) return;
    setBusy(true);
    setNotice(null);
    try {
      await props.onSaveProjection(weddingRsvpExportRevocationToAfpSendInput({ receipt, revokedBy: "couple", metadata: props.metadata }));
      setPendingRevocationId(null);
      setNotice(`Future-use permission withdrawn for ${receipt.recipientLabel}. A file already downloaded or handed over cannot be recalled automatically.`);
    } catch (error) {
      setNotice(friendlyErrorText(error, "The revocation record could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="mt-3 min-w-0 rounded-[24px] border border-sky-100 bg-white p-3 shadow-card sm:rounded-[28px] sm:p-4" aria-labelledby="rsvp-operations-title">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          <h3 id="rsvp-operations-title" class="text-base font-semibold text-sky-950">RSVP updates</h3>
          <p class="mt-1 text-sm leading-6 text-sky-950/75">One response updates guest counts, seating eligibility, follow-ups and export previews. Vendor commitments never change silently.</p>
        </div>
        <span class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900">{reconciliation().cateringHeadcount} attending</span>
      </div>
      <ul class="mt-3 grid gap-2 text-xs leading-5 text-sky-950/80 sm:grid-cols-2">
        <For each={reconciliation().connectedChangeLabels}>{(label) => <li class="rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-2">{label}</li>}</For>
      </ul>
      <Show when={reconciliation().missingDetailCandidates.length + reconciliation().lateChangeExceptions.length > 0}>
        <div class="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
          {reconciliation().missingDetailCandidates.length} missing detail{reconciliation().missingDetailCandidates.length === 1 ? "" : "s"} · {reconciliation().lateChangeExceptions.length} late change{reconciliation().lateChangeExceptions.length === 1 ? "" : "s"} held for review
        </div>
      </Show>
      <div class="mt-3 grid gap-2 sm:grid-cols-3">
        <button type="button" class="min-h-11 rounded-lg border border-sky-200 bg-white px-3 text-sm font-semibold text-sky-950" onClick={() => downloadText("wedding-rsvp-responses.csv", buildWeddingRsvpCoupleCsv(props.guestTracking, props.setup.eventId))}>Download couple CSV</button>
        <button type="button" class="min-h-11 rounded-lg border border-sky-200 bg-white px-3 text-sm font-semibold text-sky-950" onClick={() => setReminderOpen((value) => !value)}>Review reminders ({reminders().length})</button>
        <button type="button" class="min-h-11 rounded-lg border border-sky-200 bg-white px-3 text-sm font-semibold text-sky-950" onClick={() => setExportsOpen((value) => !value)}>Prepare vendor brief</button>
      </div>
      <Show when={reminderOpen()}>
        <div class="mt-3 grid gap-2" aria-label="RSVP reminder drafts">
          <Show when={providerStatusLoaded() && !providerStatus()?.ready}>
            <p class="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-950/75">Drafting and exact approval are available. External delivery remains off until the reviewed RSVP reminder rollout and provider cohort are enabled.</p>
          </Show>
          <Show when={reminders().length > 0} fallback={<p class="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700">No eligible reminder is due. Complete and declined households are excluded.</p>}>
            <For each={reminders()}>{(candidate, index) => <article class="rounded-xl border border-sky-100 p-3"><p class="text-sm font-semibold text-sky-950">{candidate.householdLabel}</p><p class="mt-1 text-xs leading-5 text-sky-950/75">Email: {candidate.contactLabels.join(", ")} · {candidate.reasonLabel}</p><Show when={candidate.sendBlockReason}><p class="mt-1 text-xs font-semibold text-amber-900">{candidate.sendBlockReason}</p></Show><pre class="mt-2 whitespace-pre-wrap break-words rounded-lg bg-sky-50 p-2 font-sans text-xs leading-5 text-sky-950">{candidate.exactContent}</pre><div class="mt-2 flex flex-wrap gap-2"><button type="button" disabled={!props.onSaveProjection || busy()} class="min-h-11 rounded-lg border border-sky-200 bg-white px-3 text-sm font-semibold text-sky-950 disabled:opacity-50" onClick={() => void saveReminderDraft(index())}>Save draft</button><button type="button" disabled={!props.onSaveProjection || busy() || !candidate.sendAllowedNow} class="min-h-11 rounded-lg bg-sky-900 px-3 text-sm font-semibold text-white disabled:opacity-50" onClick={() => setPendingReminderApprovalId(candidate.id)}>Review approval</button><Show when={providerStatus()?.ready && approvedReminder(candidate.householdId)}><button type="button" disabled={busy() || !candidate.sendAllowedNow} class="min-h-11 rounded-lg border border-sky-300 bg-white px-3 text-sm font-semibold text-sky-950 disabled:opacity-50" onClick={() => void sendReminder(candidate.householdId)}>Send approved reminder</button></Show></div><p class="mt-2 text-xs leading-5 text-sky-950/65">Approval records the exact recipient and content. Sending is a separate action and requires a durable provider receipt.</p></article>}</For>
          </Show>
        </div>
      </Show>
      <Show when={exportsOpen()}>
        <div class="mt-3 rounded-xl border border-sky-100 bg-sky-50/50 p-3">
          <Show when={correctingReceiptId()}><p class="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">Correction mode: this creates a new minimum-necessary brief and links it to the earlier receipt. It does not erase the earlier download.</p></Show>
          <div class="grid gap-2 sm:grid-cols-2"><label class="text-xs font-semibold text-sky-950">Brief for<select class="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={audience()} onChange={(event) => setAudience(event.currentTarget.value as WeddingRsvpVendorExportAudience)}><option value="caterer">Caterer</option><option value="venue">Venue</option></select></label><label class="text-xs font-semibold text-sky-950">Exact recipient<input class="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={recipientLabel()} onInput={(event) => setRecipientLabel(event.currentTarget.value)} placeholder="Business or contact name" /></label></div>
          <Show when={audience() === "caterer"}><label class="mt-3 flex items-start gap-2 text-xs font-semibold text-sky-950"><input type="checkbox" class="mt-0.5 h-5 w-5" checked={includeDietaryDetails()} onChange={(event) => setIncludeDietaryDetails(event.currentTarget.checked)} />Include dietary detail after reviewing the exact rows</label></Show>
          <p class="mt-3 text-xs font-semibold text-sky-950">Previewed fields: {vendorPreview().fieldLabels.join(", ")}</p>
          <p class="mt-1 text-xs leading-5 text-sky-950/70">Excluded: {vendorPreview().excludedFieldLabels.join(", ")}. {vendorPreview().rowCount} attending guest row{vendorPreview().rowCount === 1 ? "" : "s"}.</p>
          <For each={vendorPreview().warningLabels}>{(label) => <p class="mt-1 text-xs leading-5 text-amber-900">{label}</p>}</For>
          <button type="button" disabled={!recipientLabel().trim() || !props.onSaveProjection || vendorPreview().rowCount === 0} class="mt-3 min-h-11 rounded-lg bg-sky-900 px-4 text-sm font-semibold text-white disabled:opacity-50" onClick={() => setPendingExport(true)}>Review approval and download</button>
          <Show when={correctingReceiptId()}><button type="button" class="ml-2 mt-3 min-h-11 rounded-lg border border-sky-300 bg-white px-4 text-sm font-semibold text-sky-950" onClick={() => setCorrectingReceiptId(null)}>Cancel correction</button></Show>
        </div>
      </Show>
      <Show when={exportReceipts().length > 0}>
        <div class="mt-3" aria-label="RSVP export history">
          <h4 class="text-sm font-semibold text-sky-950">Brief history</h4>
          <div class="mt-2 grid gap-2">
            <For each={exportReceipts()}>{(receipt) => <article class="rounded-xl border border-sky-100 bg-white p-3"><div class="flex flex-wrap items-start justify-between gap-2"><div><p class="text-sm font-semibold text-sky-950">{receipt.recipientLabel || receipt.audience}</p><p class="mt-1 text-xs leading-5 text-sky-950/70">{receipt.rowCount} rows · {receipt.approvedFields.join(", ")} · {receipt.correctsReceiptId ? "Correction" : "Original brief"}</p><Show when={receipt.revokedAt}><p class="mt-1 text-xs font-semibold text-red-800">Future-use permission withdrawn</p></Show></div><div class="flex flex-wrap gap-2"><button type="button" disabled={Boolean(receipt.revokedAt)} class="min-h-10 rounded-lg border border-sky-200 px-3 text-xs font-semibold text-sky-950 disabled:opacity-50" onClick={() => beginCorrection(receipt.receiptId)}>Prepare correction</button><button type="button" disabled={Boolean(receipt.revokedAt)} class="min-h-10 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-800 disabled:opacity-50" onClick={() => setPendingRevocationId(receipt.receiptId)}>Withdraw future use</button></div></div></article>}</For>
          </div>
        </div>
      </Show>
      <Show when={notice()}>{(message) => <p role="status" class="mt-3 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-950">{message()}</p>}</Show>
      <WeddingConfirmDialog open={pendingExport()} title={correctingReceiptId() ? "Approve and record this correction?" : "Approve this minimum-necessary brief?"} detail={`This records approval to include ${vendorPreview().fieldLabels.join(", ")} for ${recipientLabel().trim()}. It downloads a CSV for manual handoff; OmnyID will not send it.`} confirmLabel={correctingReceiptId() ? "Record correction" : "Approve and download"} busy={busy()} onCancel={() => setPendingExport(false)} onConfirm={() => void approveExport()} />
      <WeddingConfirmDialog open={Boolean(pendingRevocationId())} title="Withdraw permission for future use?" detail="This records that the recipient should not use this RSVP brief again. It cannot recall a file that was already downloaded or handed over." confirmLabel="Withdraw future use" destructive busy={busy()} onCancel={() => setPendingRevocationId(null)} onConfirm={() => void confirmRevocation()} />
      <WeddingConfirmDialog open={Boolean(pendingReminderApprovalId())} title="Approve this exact RSVP reminder?" detail="Check the email address and message above. This records your approval for this one reminder; it does not send it or submit it to an email provider." confirmLabel="Record approval" busy={busy()} onCancel={() => setPendingReminderApprovalId(null)} onConfirm={() => void approveReminder()} />
    </section>
  );
}
