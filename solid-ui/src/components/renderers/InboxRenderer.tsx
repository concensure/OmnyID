import { For, Show, createMemo } from "solid-js";
import type { AfpMessage } from "@/lib/api";
import { EmptyState } from "@/components/EmptyState";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";

const INBOX_SUBJECT_SEPARATOR = " · ";
const INBOX_ENCRYPTION_LABEL = "E2EE";
const INBOX_ENCRYPTION_TITLE = "End-to-end encrypted";
const INBOX_ENCRYPTION_ICON = "🔒";
const INBOX_ATTACHMENT_ICON = "✦";
const INBOX_ATTACHMENT_STATUS = "encrypted";
const INBOX_EMPTY_ICON = "✉";
const INBOX_EMPTY_TITLE = "No message body yet";
const INBOX_EMPTY_BODY =
  "This inbox item has a subject and sender, but it does not include message text or attachments yet.";

const INBOX_ENCRYPTION_BADGE_CLASS =
  "max-w-full break-words rounded-full bg-green-500/15 px-2 py-1 font-mono text-[9px] text-green-700";
const INBOX_TYPE_BADGE_CLASS =
  "max-w-full break-words rounded-full bg-white/55 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-on-surface-variant";
const INBOX_ATTACHMENT_ROW_CLASS = "flex min-w-0 flex-col gap-2 rounded-xl bg-white/40 px-3 py-2 text-xs sm:flex-row sm:items-center sm:gap-3";
const INBOX_ATTACHMENT_META_CLASS = "break-words text-on-surface-variant sm:ml-auto sm:shrink-0";
const INBOX_ATTACHMENT_STATUS_CLASS =
  "max-w-full break-words rounded bg-primary-fixed/60 px-1.5 py-1 font-mono text-[9px] uppercase tracking-wider text-primary sm:shrink-0";

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1048576) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / 1048576).toFixed(1)} MB`;
}

function inboxString(content: Record<string, unknown>, key: string): string | null {
  const value = content[key];
  return typeof value === "string" ? value : null;
}

export function InboxRenderer(props: { message: AfpMessage }) {
  const rendererState = createMemo(() => {
    const content = afpRecord(decryptedDisplayContent(props.message));
    const subject =
      inboxString(content, "subject") ??
      inboxString(content, "title") ??
      `${props.message.type}${INBOX_SUBJECT_SEPARATOR}${props.message.from}`;
    const body =
      inboxString(content, "body") ??
      inboxString(content, "summary") ??
      inboxString(content, "text") ??
      null;
    const bodyText = body?.trim() ? body : null;
    const attachmentItems = (props.message.attachments ?? []).map((attachment) => ({
      name: attachment.name,
      metaText: `${attachment.mime_type}${INBOX_SUBJECT_SEPARATOR}${formatBytes(attachment.size_bytes)}`,
    }));

    return {
      subject,
      sender: props.message.from,
      bodyText,
      showBody: Boolean(bodyText),
      showEncryption: Boolean(props.message.encryption),
      typeLabel: props.message.type,
      timestampLabel: props.message.timestamp.slice(0, 10),
      attachmentItems,
      showAttachments: attachmentItems.length > 0,
      showContent: Boolean(bodyText) || attachmentItems.length > 0,
    };
  });

  return (
    <div class="space-y-2">
      <div class="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div class="min-w-0">
          <p class="break-words font-medium text-on-surface">{rendererState().subject}</p>
          <p class="mt-0.5 break-words font-mono text-[10px] uppercase tracking-[0.18em] text-outline">
            {rendererState().sender}
          </p>
        </div>
        <div class="flex flex-col items-start gap-1 sm:shrink-0 sm:items-end">
          <div class="flex flex-wrap items-center gap-1.5">
            <Show when={rendererState().showEncryption}>
              <span title={INBOX_ENCRYPTION_TITLE} class={INBOX_ENCRYPTION_BADGE_CLASS}>
                {INBOX_ENCRYPTION_ICON} {INBOX_ENCRYPTION_LABEL}
              </span>
            </Show>
            <span class={INBOX_TYPE_BADGE_CLASS}>{rendererState().typeLabel}</span>
          </div>
          <span class="text-xs text-on-surface-variant">{rendererState().timestampLabel}</span>
        </div>
      </div>

      <Show when={rendererState().showBody}>
        <p class="break-words text-sm leading-7 text-on-surface-variant">{rendererState().bodyText}</p>
      </Show>

      <Show when={rendererState().showAttachments}>
        <div class="mt-2 space-y-1.5">
          <For each={rendererState().attachmentItems}>
            {(attachment) => (
              <div class={INBOX_ATTACHMENT_ROW_CLASS}>
                <span>{INBOX_ATTACHMENT_ICON}</span>
                <span class="break-words font-medium text-on-surface">{attachment.name}</span>
                <span class={INBOX_ATTACHMENT_META_CLASS}>{attachment.metaText}</span>
                <span class={INBOX_ATTACHMENT_STATUS_CLASS}>{INBOX_ATTACHMENT_STATUS}</span>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={!rendererState().showContent}>
        <EmptyState icon={INBOX_EMPTY_ICON} title={INBOX_EMPTY_TITLE} body={INBOX_EMPTY_BODY} />
      </Show>
    </div>
  );
}
