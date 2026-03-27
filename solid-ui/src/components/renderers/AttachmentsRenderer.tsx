import { For, Show } from "solid-js";
import type { AfpMessage } from "@/lib/api";

/**
 * Renders the encrypted attachment metadata panel for an AFP message.
 * Content stays encrypted on the client; only metadata is displayed.
 */
export function AttachmentsRenderer(props: { message: AfpMessage }) {
  const attachments = () => props.message.attachments ?? [];

  return (
    <div class="space-y-2">
      <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">
        Attachments · {attachments().length} file{attachments().length !== 1 ? "s" : ""}
      </p>
      <Show
        when={attachments().length > 0}
        fallback={
          <p class="text-sm text-on-surface-variant">No attachments on this message.</p>
        }
      >
        <div class="space-y-2">
          <For each={attachments()}>
            {(att) => {
              const backend = () =>
                (att.storage?.backend as string | undefined) ??
                (att.storage?.type as string | undefined) ??
                "hosted";
              const scheme = () =>
                (att.encryption?.scheme as string | undefined) ??
                (att.encryption?.algorithm as string | undefined) ??
                "AES-256-GCM";

              return (
                <div class="rounded-2xl border border-white/30 bg-white/20 px-4 py-3">
                  <div class="flex items-start justify-between gap-4">
                    <div class="min-w-0">
                      <p class="truncate font-medium text-on-surface">{att.name}</p>
                      <p class="mt-0.5 text-xs text-on-surface-variant">
                        {att.mime_type} · {formatBytes(att.size_bytes)}
                      </p>
                    </div>
                    <span class="shrink-0 rounded-full bg-primary-fixed/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary">
                      encrypted
                    </span>
                  </div>
                  <div class="mt-3 grid grid-cols-2 gap-2 text-xs text-on-surface-variant sm:grid-cols-3">
                    <div class="rounded-lg bg-white/30 px-2 py-1.5">
                      <div class="font-mono text-[9px] uppercase tracking-widest text-outline">Storage</div>
                      <div class="mt-0.5">{backend()}</div>
                    </div>
                    <div class="rounded-lg bg-white/30 px-2 py-1.5">
                      <div class="font-mono text-[9px] uppercase tracking-widest text-outline">Encryption</div>
                      <div class="mt-0.5">{scheme()}</div>
                    </div>
                    {att.sha256 && (
                      <div class="rounded-lg bg-white/30 px-2 py-1.5 sm:col-span-1">
                        <div class="font-mono text-[9px] uppercase tracking-widest text-outline">SHA-256</div>
                        <div class="mt-0.5 truncate font-mono text-[9px]">{att.sha256.slice(0, 16)}…</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            }}
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
