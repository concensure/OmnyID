// @locs-version: 1.0
import { createSignal, For, Show } from "solid-js";
import { uploadAttachmentFile, type AfpAttachment } from "@/lib/api";
import type { WeddingVendorOutreachFlowState } from "@/lib/weddingVendorOutreachFlowState";
import { weddingVendorOutreachSendGate } from "@/lib/weddingVendorOutreachFlowState";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { renderMarkdown } from "@/lib/markdownRenderer";
import { WeddingTrustInfoTip } from "@/components/WeddingTrustInfoTip";
import {
  weddingVendorSharedInformationLabels,
  type WeddingVendorEnquiryPermissions,
} from "@/lib/weddingVendorEnquiryPermissionsState";

export function WeddingVendorOutreachComposer(props: {
  flow: WeddingVendorOutreachFlowState;
  busy: boolean;
  gmailConnected: boolean;
  onBodyChange: (bodyMarkdown: string, bodyHtml?: string) => void;
  onRecipientChange?: (email: string) => void;
  onAttachmentsChange?: (attachments: AfpAttachment[]) => void;
  onPermissionsChange?: (permissions: WeddingVendorEnquiryPermissions) => void;
  onRegenerateDraft?: () => void;
  onSend: () => void;
  onCancel: () => void;
  onRetryDraft?: () => void;
  onConnectGmail: () => void;
  /** The directory's official vendor URL, when an email address is unavailable. */
  vendorWebsiteUrl?: string | null;
  protectedRepliesAvailable?: boolean;
}) {
  const gate = () => weddingVendorOutreachSendGate(props.flow, {
    gmailConnected: props.gmailConnected,
    protectedRepliesAvailable: props.protectedRepliesAvailable,
  });
  const [whyOpen, setWhyOpen] = createSignal(false);
  const [attachmentBusy, setAttachmentBusy] = createSignal(false);
  const [attachmentError, setAttachmentError] = createSignal<string | null>(null);
  const updatePermissions = (patch: Partial<WeddingVendorEnquiryPermissions>) => props.onPermissionsChange?.({
    ...props.flow.permissions,
    ...patch,
    previewApproved: patch.previewApproved ?? false,
  });
  const budgetChoiceOutOfSync = () => (
    props.flow.permissions.shareApproximateBudget !== props.flow.groundedOnFields.includes("budget_comfort")
  );
  const sharedInformation = () => weddingVendorSharedInformationLabels({
    permissions: props.flow.permissions,
    groundedOnLabels: props.flow.groundedOnLabels,
  });
  const updateAttachments = (attachments: AfpAttachment[]) => props.onAttachmentsChange?.(attachments);
  const uploadAttachments = async (files: FileList | null) => {
    if (!files?.length || attachmentBusy()) return;
    const available = Math.max(0, 5 - props.flow.attachments.length);
    if (files.length > available) {
      setAttachmentError("Attach no more than five files to one enquiry.");
      return;
    }
    setAttachmentBusy(true);
    setAttachmentError(null);
    try {
      const added: AfpAttachment[] = [];
      for (const file of Array.from(files)) {
        added.push(await uploadAttachmentFile(file, {
          filename: file.name,
          purpose: "wedding_vendor_message",
        }));
      }
      updateAttachments([...props.flow.attachments, ...added]);
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "The attachment could not be uploaded.");
    } finally {
      setAttachmentBusy(false);
    }
  };
  const officialWebsiteUrl = () => {
    const value = props.vendorWebsiteUrl?.trim();
    if (!value) return null;
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
    } catch {
      return null;
    }
  };

  return (
    <Show when={props.flow.stage !== "sent"}>
      <div class="mt-3 rounded-2xl border border-wedding-surface-muted bg-wedding-surface p-3">
        <div class="flex items-start justify-between gap-2">
          <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-wedding-muted">
            Suggested message — edit or send as-is
          </p>
          <button
            type="button"
            onClick={props.onCancel}
            class="shrink-0 text-xs font-semibold text-wedding-muted underline decoration-wedding-muted/50 underline-offset-2 hover:text-wedding-text"
          >
            Cancel
          </button>
        </div>

        <Show when={props.flow.stage === "drafting"}>
          <div class="mt-3 animate-pulse rounded-xl bg-wedding-surface-muted p-4">
            <p class="text-sm font-medium text-wedding-muted">
              Writing a message based on what you've told us…
            </p>
          </div>
        </Show>

        <Show when={props.flow.stage === "draft_failed"}>
          <div class="mt-3 rounded-xl border border-wedding-surface-blush bg-wedding-surface-blush p-3">
            <p class="text-sm font-semibold text-wedding-accent-dark">Couldn't write this draft</p>
            <Show when={props.flow.blockedReason}>
              {(reason) => <p class="mt-1 break-words text-sm leading-6 text-wedding-accent/80">{reason()}</p>}
            </Show>
            <button type="button" onClick={props.onRetryDraft} disabled={props.busy || !props.onRetryDraft} class="mt-3 min-h-10 rounded-lg border border-wedding-accent bg-white px-3 text-sm font-bold text-wedding-accent disabled:opacity-60">Retry draft</button>
          </div>
        </Show>

        <Show when={props.flow.stage === "draft_ready" || props.flow.stage === "send_failed" || props.flow.stage === "sending"}>
          <Show when={props.flow.groundedOnLabels.length > 0}>
            <div class="mt-3 rounded-xl bg-wedding-surface-muted px-3 py-2">
              <button
                type="button"
                onClick={() => setWhyOpen((open) => !open)}
                aria-expanded={whyOpen()}
                class="w-full text-left text-xs font-semibold text-wedding-text underline decoration-wedding-muted/50 underline-offset-2"
              >
                Why we wrote it this way{whyOpen() ? " (hide)" : ""}
              </button>
              <Show when={whyOpen()}>
                <ul class="mt-2 space-y-0.5 select-text">
                  <For each={props.flow.groundedOnLabels}>
                    {(label) => <li class="break-words text-xs leading-5 text-wedding-muted">{label}</li>}
                  </For>
                </ul>
              </Show>
            </div>
          </Show>

          <div class="mt-3 text-sm font-semibold text-wedding-text">
            <p>Suggested message</p>
            <p class="mt-1 text-xs font-normal leading-5 text-wedding-muted">Formatting tools are directly above the message. Select text, then choose a heading, size, bold, italic, or list.</p>
            <TiptapEditor
              mode="email"
              class="mt-2 overflow-hidden rounded-xl border border-wedding-muted/35 bg-white font-normal focus-within:border-wedding-cta focus-within:ring-2 focus-within:ring-wedding-surface-blush"
              contentClass="min-h-44 px-3 py-2 text-sm leading-6"
              initialContent={props.flow.bodyHtml ?? renderMarkdown(props.flow.bodyMarkdown)}
              disabled={props.busy}
              placeholder="Write the enquiry here."
              showToolbar={true}
              showFooter={false}
              enableSlashCommands={false}
              submitShortcut="none"
              onChange={(_text, markdown, html) => props.onBodyChange(markdown, html)}
              onSend={async () => {}}
            />
          </div>

          <label class="mt-3 block text-sm font-semibold text-wedding-text">
            Recipient
            <input
              type="email"
              value={props.flow.recipientEmail ?? ""}
              onInput={(event) => props.onRecipientChange?.(event.currentTarget.value)}
              disabled={props.busy}
              placeholder="vendor@example.com"
              class="mt-1 min-h-11 w-full select-text rounded-xl border border-wedding-muted/35 bg-white px-3 py-2 text-sm font-normal text-wedding-text outline-none focus:border-wedding-cta focus:ring-2 focus:ring-wedding-surface-blush disabled:cursor-wait disabled:opacity-70"
            />
          </label>

          <section class="mt-3 rounded-xl border border-wedding-border bg-white p-3" aria-labelledby={`enquiry-permissions-${props.flow.choiceId}`}>
            <h4 id={`enquiry-permissions-${props.flow.choiceId}`} class="text-sm font-bold text-wedding-text">Before this enquiry is sent</h4>
            <p class="mt-1 text-xs leading-5 text-wedding-muted">Choose what this vendor may receive or do. Changing a control never sends anything.</p>
            <div class="mt-3 space-y-2">
              <label class="flex min-h-11 items-start gap-2 rounded-lg border border-wedding-border px-3 py-2 text-sm text-wedding-text">
                <input type="checkbox" class="mt-1 h-4 w-4 accent-wedding-primary" checked={props.flow.permissions.shareApproximateBudget} onChange={(event) => updatePermissions({ shareApproximateBudget: event.currentTarget.checked })} />
                <span><strong>Share my approximate category budget</strong><span class="mt-0.5 block text-xs leading-5 text-wedding-muted">Only include it in the message after you choose this and update the draft.</span></span>
              </label>
              <label class="flex min-h-11 items-start gap-2 rounded-lg border border-wedding-border px-3 py-2 text-sm text-wedding-text">
                <input type="checkbox" class="mt-1 h-4 w-4 accent-wedding-primary" checked={props.flow.permissions.allowPhoneContact} onChange={(event) => updatePermissions({ allowPhoneContact: event.currentTarget.checked })} />
                <span><strong>Allow this vendor to contact me by phone</strong><span class="mt-0.5 block text-xs leading-5 text-wedding-muted">A phone number is never added automatically.</span></span>
              </label>
              <label class="flex min-h-11 items-start gap-2 rounded-lg border border-wedding-border px-3 py-2 text-sm text-wedding-text">
                <input type="checkbox" class="mt-1 h-4 w-4 accent-wedding-primary" checked={props.flow.permissions.remindUnanswered} onChange={(event) => updatePermissions({ remindUnanswered: event.currentTarget.checked })} />
                <span><strong>Remind me about unanswered enquiries</strong><span class="mt-0.5 block text-xs leading-5 text-wedding-muted">This creates an OmnyID reminder; it does not automatically chase the vendor.</span></span>
              </label>
            </div>
            <fieldset class="mt-3">
              <legend class="text-xs font-bold uppercase tracking-[0.08em] text-wedding-muted">Where replies should go</legend>
              <label class="mt-2 flex min-h-11 items-start gap-2 rounded-lg border border-wedding-border px-3 py-2 text-sm text-wedding-text">
                <input type="radio" name={`reply-route-${props.flow.choiceId}`} class="mt-1 h-4 w-4 accent-wedding-primary" checked={props.flow.permissions.replyRoute === "omnyid_protected"} onChange={() => updatePermissions({ replyRoute: "omnyid_protected" })} />
                <span><strong>Protected OmnyID replies</strong><span class="mt-0.5 block text-xs leading-5 text-wedding-muted">Default privacy choice. Sending stays blocked until the reviewed masked-reply service is enabled.</span></span>
              </label>
              <label class="mt-2 flex min-h-11 items-start gap-2 rounded-lg border border-wedding-border px-3 py-2 text-sm text-wedding-text">
                <input type="radio" name={`reply-route-${props.flow.choiceId}`} class="mt-1 h-4 w-4 accent-wedding-primary" checked={props.flow.permissions.replyRoute === "connected_email"} onChange={() => updatePermissions({ replyRoute: "connected_email" })} />
                <span><strong>My connected email</strong><span class="mt-0.5 block text-xs leading-5 text-wedding-muted">The vendor can reply to the address exposed by your connected email provider.</span></span>
              </label>
            </fieldset>
            <Show when={budgetChoiceOutOfSync()}>
              <button type="button" class="mt-3 min-h-11 w-full rounded-lg border border-wedding-primary bg-wedding-page px-3 py-2 text-sm font-bold text-wedding-primary" onClick={props.onRegenerateDraft} disabled={!props.onRegenerateDraft || props.busy}>Update draft with this budget choice</button>
            </Show>
          </section>

          <section class="mt-3 rounded-xl border border-wedding-primary/25 bg-wedding-page p-3" aria-labelledby={`vendor-preview-${props.flow.choiceId}`}>
            <h4 id={`vendor-preview-${props.flow.choiceId}`} class="text-sm font-bold text-wedding-text">Preview what the vendor receives</h4>
            <dl class="mt-2 grid gap-2 text-xs sm:grid-cols-2">
              <div><dt class="font-bold text-wedding-muted">Recipient</dt><dd class="mt-1 break-words text-wedding-text">{props.flow.recipientEmail || "Add a vendor email above"}</dd></div>
              <div><dt class="font-bold text-wedding-muted">Reply route</dt><dd class="mt-1 text-wedding-text">{props.flow.permissions.replyRoute === "omnyid_protected" ? "Protected OmnyID replies" : "Connected email"}</dd></div>
            </dl>
            <p class="mt-3 text-xs font-bold text-wedding-muted">Shared information</p>
            <ul class="mt-1 list-disc space-y-1 pl-5 text-xs leading-5 text-wedding-text"><For each={sharedInformation()}>{(label) => <li>{label}</li>}</For></ul>
            <p class="mt-2 text-xs leading-5 text-wedding-muted">The exact message is the editable content above. Attachments listed below are also included.</p>
            <label class="mt-3 flex min-h-11 items-start gap-2 rounded-lg bg-white px-3 py-2 text-sm text-wedding-text">
              <input type="checkbox" class="mt-1 h-4 w-4 accent-wedding-primary" checked={props.flow.permissions.previewApproved} onChange={(event) => updatePermissions({ previewApproved: event.currentTarget.checked })} />
              <span><strong>I have reviewed the recipient, exact message and shared information.</strong></span>
            </label>
          </section>

          <WeddingTrustInfoTip
            class="mt-3"
            label="How OmnyID protects this enquiry"
            items={[
              { question: "Will I be bombarded with sales calls?", answer: "Phone contact is off by default. A vendor receives only the contact details and permissions shown in this preview." },
              { question: "Is the AI inventing details?", answer: "The draft uses the listed wedding facts and source references. Unknown information stays unknown, and you approve the exact wording." },
              { question: "What if the vendor never replies?", answer: "OmnyID can remind you to follow up or move on. It does not send repeated chasers without your approval." },
            ]}
          />

          <div class="mt-3 rounded-xl border border-wedding-muted/25 bg-white p-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="text-sm font-semibold text-wedding-text">Attachments</p>
                <p class="text-xs leading-5 text-wedding-muted">PDF, DOCX, TXT, JPG, PNG or WebP · up to 10 MB each</p>
              </div>
              <label class="inline-flex min-h-10 cursor-pointer items-center rounded-xl border border-wedding-cta px-3 py-2 text-sm font-semibold text-wedding-text hover:bg-wedding-surface-blush">
                {attachmentBusy() ? "Checking…" : "Add files"}
                <input
                  class="sr-only"
                  type="file"
                  multiple
                  accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/jpeg,image/png,image/webp"
                  disabled={props.busy || attachmentBusy() || props.flow.attachments.length >= 5}
                  onChange={(event) => {
                    void uploadAttachments(event.currentTarget.files);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
            <Show when={props.flow.attachments.length > 0}>
              <ul class="mt-2 space-y-2">
                <For each={props.flow.attachments}>{(attachment) => (
                  <li class="flex items-center justify-between gap-2 rounded-lg bg-wedding-surface-muted px-3 py-2 text-xs text-wedding-text">
                    <span class="min-w-0 truncate">{attachment.name}</span>
                    <button
                      type="button"
                      class="shrink-0 font-semibold underline underline-offset-2"
                      onClick={() => updateAttachments(props.flow.attachments.filter((item) => item.id !== attachment.id))}
                    >Remove</button>
                  </li>
                )}</For>
              </ul>
            </Show>
            <Show when={attachmentError()}>{(message) => <p role="alert" class="mt-2 text-xs leading-5 text-red-700">{message()}</p>}</Show>
          </div>

          <Show when={!props.flow.recipientEmail}>
            <div class="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950">
              <p class="font-semibold">No vendor email is available in the directory.</p>
              <Show
                when={officialWebsiteUrl()}
                fallback={<p class="mt-1">Add the vendor's email above before sending this message.</p>}
              >
                {(url) => (
                  <p class="mt-1">
                    Use the vendor's official enquiry form instead: {" "}
                    <a class="font-semibold underline underline-offset-2" href={url()} target="_blank" rel="noopener noreferrer">
                      Open {props.flow.vendorName}'s website
                    </a>.
                  </p>
                )}
              </Show>
            </div>
          </Show>

          <Show when={props.flow.stage === "send_failed" && props.flow.blockedReason}>
            {(reason) => (
              <div class="mt-3 rounded-xl border border-wedding-surface-blush bg-wedding-surface-blush p-3">
                <p class="text-sm font-semibold text-wedding-accent-dark">Couldn't send this enquiry</p>
                <p class="mt-1 break-words text-sm leading-6 text-wedding-accent/80">{reason()}</p>
              </div>
            )}
          </Show>

          <button
            type="button"
            disabled={!gate().canSend || props.busy || attachmentBusy()}
            title={gate().reason ?? undefined}
            onClick={props.onSend}
            class="mt-3 min-h-[44px] w-full rounded-2xl border-2 border-wedding-cta bg-white px-5 py-3 text-sm font-bold text-wedding-text transition hover:bg-wedding-surface-blush focus:outline-none focus:ring-2 focus:ring-wedding-cta focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {props.flow.stage === "sending" ? "Sending…" : "Send enquiry"}
          </button>

          <Show when={!props.gmailConnected}>
            <button
              type="button"
              onClick={props.onConnectGmail}
              class="mt-2 w-full rounded-2xl border border-wedding-surface-muted bg-white min-h-[44px] px-5 py-3 text-sm font-semibold text-wedding-accent-dark transition hover:bg-wedding-surface-blush"
            >
              Connect Gmail
            </button>
          </Show>
        </Show>
      </div>
    </Show>
  );
}
