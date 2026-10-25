// @locs-version: 1.0
import { createSignal, For, Show } from "solid-js";
import { uploadAttachmentFile, type AfpAttachment } from "@/lib/api";
import type { WeddingVendorOutreachFlowState } from "@/lib/weddingVendorOutreachFlowState";
import { weddingVendorOutreachSendGate } from "@/lib/weddingVendorOutreachFlowState";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { renderMarkdown } from "@/lib/markdownRenderer";

export function WeddingVendorOutreachComposer(props: {
  flow: WeddingVendorOutreachFlowState;
  busy: boolean;
  gmailConnected: boolean;
  onBodyChange: (bodyMarkdown: string, bodyHtml?: string) => void;
  onRecipientChange?: (email: string) => void;
  onAttachmentsChange?: (attachments: AfpAttachment[]) => void;
  onSend: () => void;
  onCancel: () => void;
  onRetryDraft?: () => void;
  onConnectGmail: () => void;
  /** The directory's official vendor URL, when an email address is unavailable. */
  vendorWebsiteUrl?: string | null;
}) {
  const gate = () => weddingVendorOutreachSendGate(props.flow, { gmailConnected: props.gmailConnected });
  const [whyOpen, setWhyOpen] = createSignal(false);
  const [attachmentBusy, setAttachmentBusy] = createSignal(false);
  const [attachmentError, setAttachmentError] = createSignal<string | null>(null);
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
            Vendor email
            <input
              type="email"
              value={props.flow.recipientEmail ?? ""}
              onInput={(event) => props.onRecipientChange?.(event.currentTarget.value)}
              disabled={props.busy}
              placeholder="vendor@example.com"
              class="mt-1 min-h-11 w-full select-text rounded-xl border border-wedding-muted/35 bg-white px-3 py-2 text-sm font-normal text-wedding-text outline-none focus:border-wedding-cta focus:ring-2 focus:ring-wedding-surface-blush disabled:cursor-wait disabled:opacity-70"
            />
          </label>

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
