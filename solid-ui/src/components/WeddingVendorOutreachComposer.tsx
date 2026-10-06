// @locs-version: 1.0
import { For, Show } from "solid-js";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import type { WeddingVendorOutreachFlowState } from "@/lib/weddingVendorOutreachFlowState";
import { weddingVendorOutreachSendGate } from "@/lib/weddingVendorOutreachFlowState";

export function WeddingVendorOutreachComposer(props: {
  flow: WeddingVendorOutreachFlowState;
  busy: boolean;
  gmailConnected: boolean;
  onBodyChange: (bodyMarkdown: string) => void;
  onSend: () => void;
  onCancel: () => void;
  onConnectGmail: () => void;
}) {
  const gate = () => weddingVendorOutreachSendGate(props.flow, { gmailConnected: props.gmailConnected });

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
          </div>
        </Show>

        <Show when={props.flow.stage === "draft_ready" || props.flow.stage === "send_failed" || props.flow.stage === "sending"}>
          <Show when={props.flow.groundedOnLabels.length > 0}>
            <div class="mt-3 rounded-xl bg-wedding-surface-muted px-3 py-2">
              <p class="text-xs font-semibold text-wedding-text">Why we wrote it this way:</p>
              <ul class="mt-1 space-y-0.5">
                <For each={props.flow.groundedOnLabels}>
                  {(label) => <li class="break-words text-xs leading-5 text-wedding-muted">{label}</li>}
                </For>
              </ul>
            </div>
          </Show>

          <div class="mt-3">
            <TiptapEditor
              mode="email"
              initialContent={props.flow.bodyMarkdown}
              threadId={props.flow.threadId ?? undefined}
              emailTo={props.flow.recipientEmail ?? undefined}
              emailSubject={props.flow.subject}
              disabled={props.busy}
              placeholder="Write the enquiry here."
              class="content-font-body"
              showFooter={false}
              onChange={(_text, markdown) => props.onBodyChange(markdown)}
              onSend={async () => {}}
            />
          </div>

          <p class="mt-3 break-words text-sm text-wedding-muted">
            To: {props.flow.recipientEmail ?? "no email on file"}
          </p>

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
            disabled={!gate().canSend || props.busy}
            title={gate().reason ?? undefined}
            onClick={props.onSend}
            class="mt-3 min-h-[44px] w-full rounded-2xl border-2 border-wedding-cta bg-white px-5 py-3 text-sm font-bold text-wedding-text transition hover:bg-wedding-surface-blush focus:outline-none focus:ring-2 focus:ring-wedding-cta focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {props.flow.stage === "sending" ? "Sending…" : `Send to ${props.flow.vendorName}`}
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
