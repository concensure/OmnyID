import { For, Show } from "solid-js";
import type { AfpMessage } from "@/lib/api";

/** Renders an AFP message as an email-style inbox card. */
export function InboxRenderer(props: { message: AfpMessage }) {
  const subject = () =>
    (props.message.content.subject as string | undefined) ??
    (props.message.content.title as string | undefined) ??
    `${props.message.type} · ${props.message.from}`;

  const body = () =>
    (props.message.content.body as string | undefined) ??
    (props.message.content.summary as string | undefined) ??
    (props.message.content.text as string | undefined);

  // The encryption field is an E2EE envelope stored alongside the plaintext content.
  // We show content whenever it exists; the lock badge just indicates E2EE is active.
  const isE2ee = () => Boolean(props.message.encryption);
  const hasAttachments = () => props.message.attachments?.length > 0;

  return (
    <div class="space-y-2">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="truncate font-medium text-on-surface">{subject()}</p>
          <p class="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-outline">
            {props.message.from}
          </p>
        </div>
        <div class="flex shrink-0 flex-col items-end gap-1">
          <div class="flex items-center gap-1.5">
            <Show when={isE2ee()}>
              <span title="End-to-end encrypted" class="rounded-full bg-green-500/15 px-2 py-0.5 font-mono text-[9px] text-green-700">
                🔒 E2EE
              </span>
            </Show>
            <span class="rounded-full bg-white/55 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-on-surface-variant">
              {props.message.type}
            </span>
          </div>
          <span class="text-xs text-on-surface-variant">{props.message.timestamp.slice(0, 10)}</span>
        </div>
      </div>

      <Show when={body()}>
        <p class="text-sm leading-7 text-on-surface-variant">{body()}</p>
      </Show>

      <Show when={hasAttachments()}>
        <div class="mt-2 space-y-1.5">
          <For each={props.message.attachments}>
            {(att) => (
              <div class="flex items-center gap-3 rounded-xl bg-white/40 px-3 py-2 text-xs">
                <span class="h-2 w-2 rounded-sm bg-outline" />
                <span class="truncate font-medium text-on-surface">{att.name}</span>
                <span class="ml-auto shrink-0 text-on-surface-variant">
                  {att.mime_type} · {formatBytes(att.size_bytes)}
                </span>
                <span class="shrink-0 rounded bg-primary-fixed/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary">
                  encrypted
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
