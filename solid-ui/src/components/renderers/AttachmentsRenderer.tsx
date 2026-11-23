import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";
import type { AfpAttachment, AfpMessage } from "@/lib/api";
import {
  attachmentPreviewDownloadUrl,
  attachmentPreviewInlineBuffer,
  attachmentPreviewInlineBytes,
  readAttachmentPreviewBytes,
} from "@/lib/attachmentPreviewSource";
import {
  buildAttachmentsRendererFailureReceipt,
  type AttachmentsRendererFailureReceipt,
} from "@/lib/attachmentsRendererFailureState";
import { GenesisLogoAnimation } from "@/components/GenesisLogoAnimation";
import { sanitizeMarkdownHtml } from "@/lib/htmlSanitizer";
import { fetchFileLibrary } from "@/lib/api";

const PREVIEWABLE_MIME = new Set([
  "application/pdf",
  "text/csv",
  "application/csv",
  "text/plain",
  "text/markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const AUDIO_PREVIEWABLE_MIME_PREFIXES = ["audio/"] as const;
const AUDIO_PREVIEWABLE_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".ogg",
  ".oga",
  ".flac",
  ".webm",
] as const;

type PreviewState =
  | { kind: "loading" }
  | { kind: "pdf"; url: string; name: string }
  | { kind: "csv"; rows: string[][]; name: string }
  | { kind: "text"; content: string; name: string }
  | { kind: "html"; content: string; name: string }
  | { kind: "office"; url: string; name: string }
  | { kind: "error"; receipt: AttachmentsRendererFailureReceipt };

type InlineAudioState =
  | { kind: "ready"; url: string; mimeType: string; revokeOnDispose: boolean }
  | { kind: "error"; receipt: AttachmentsRendererFailureReceipt };

type AttachmentCardState = {
  id: string;
  name: string;
  metaText: string;
  backendText: string;
  encryptionText: string;
  shaText: string | null;
  showSha: boolean;
  showPreviewButton: boolean;
  showAudioButton: boolean;
  previewButtonText: string;
  audioButtonText: string;
  loadingPreview: boolean;
  inlineAudioState: InlineAudioState | undefined;
  showInlineAudio: boolean;
  showBuffering: boolean;
};

const ATTACHMENTS_TITLE = "Attachments";
const ATTACHMENTS_EMPTY_TEXT = "No attachments on this message.";
const ATTACHMENTS_ENCRYPTED_LABEL = "encrypted";
const ATTACHMENTS_PREVIEW_LABEL = "Preview";
const ATTACHMENTS_PREVIEW_LOADING_LABEL = "...";
const ATTACHMENTS_AUDIO_SHOW_LABEL = "Play inline";
const ATTACHMENTS_AUDIO_HIDE_LABEL = "Hide audio";
const ATTACHMENTS_STORAGE_LABEL = "Storage";
const ATTACHMENTS_ENCRYPTION_LABEL = "Encryption";
const ATTACHMENTS_HASH_LABEL = "SHA-256";
const ATTACHMENTS_BUFFERING_LABEL = "Buffering...";
const ATTACHMENTS_PREVIEW_FALLBACK_TITLE = "Preview";
const ATTACHMENTS_CLOSE_LABEL = "Close";
const ATTACHMENTS_DECRYPTING_LABEL = "Decrypting attachment...";
const ATTACHMENTS_PDF_TITLE = "PDF Preview";
const ATTACHMENTS_AUDIO_BROWSER_FALLBACK = "Your browser cannot play this audio attachment.";

const ATTACHMENTS_HEADER_CLASS = "font-mono text-[10px] uppercase tracking-[0.22em] text-outline";
const ATTACHMENTS_CARD_CLASS = "rounded-2xl border border-white/30 bg-white/20 px-4 py-3";
const ATTACHMENTS_STATUS_CHIP_CLASS =
  "max-w-full break-words rounded-full bg-primary-fixed/60 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-primary";
const ATTACHMENTS_AUDIO_BUTTON_CLASS =
  "rounded-full border border-sky-400/40 px-2.5 py-2 font-mono text-[9px] uppercase tracking-wider text-sky-700 transition hover:bg-sky-500/10 sm:py-1";
const ATTACHMENTS_PREVIEW_BUTTON_CLASS =
  "rounded-full border border-primary/40 px-2.5 py-2 font-mono text-[9px] uppercase tracking-wider text-primary transition hover:bg-primary/10 disabled:opacity-50 sm:py-1";
const ATTACHMENTS_META_GRID_CLASS =
  "mt-3 grid grid-cols-1 gap-2 text-xs text-on-surface-variant sm:grid-cols-3";
const ATTACHMENTS_META_CARD_CLASS = "min-w-0 rounded-lg bg-white/30 px-2 py-1.5 break-words";
const ATTACHMENTS_META_LABEL_CLASS = "font-mono text-[9px] uppercase tracking-widest text-outline";
const ATTACHMENTS_AUDIO_PANEL_CLASS =
  "mt-3 rounded-xl border border-sky-200/60 bg-sky-50/60 px-3 py-2";
const ATTACHMENTS_AUDIO_ERROR_CLASS = "space-y-1 text-xs text-amber-900";
const ATTACHMENTS_MODAL_SHELL_CLASS =
  "glass-surface flex max-h-[88vh] w-full max-w-4xl flex-col rounded-2xl border border-white/30 shadow-panel";
const ATTACHMENTS_MODAL_OVERLAY_CLASS =
  "fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm";
const ATTACHMENTS_MODAL_HEADER_CLASS =
  "flex min-w-0 items-start justify-between gap-3 border-b border-white/20 px-5 py-3";
const ATTACHMENTS_MODAL_CLOSE_CLASS =
  "ml-4 shrink-0 rounded-lg px-2.5 py-1 text-xs text-on-surface-variant transition hover:bg-white/10";
const ATTACHMENTS_MODAL_BODY_CLASS = "flex-1 overflow-auto p-5";
const ATTACHMENTS_MODAL_ERROR_CLASS =
  "rounded-xl border border-amber-200/60 bg-amber-50/80 px-4 py-3 text-sm text-amber-900";

function isPreviewable(attachment: AfpAttachment): boolean {
  const mime = attachment.mime_type ?? "";
  if (PREVIEWABLE_MIME.has(mime)) return true;
  const lowerName = attachment.name?.toLowerCase() ?? "";
  return [".csv", ".txt", ".md", ".pdf", ".doc", ".docx"].some((extension) => lowerName.endsWith(extension));
}

function isAudioPreviewable(attachment: AfpAttachment): boolean {
  const mime = (attachment.mime_type ?? "").toLowerCase();
  if (AUDIO_PREVIEWABLE_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))) return true;
  const lowerName = attachment.name?.toLowerCase() ?? "";
  return AUDIO_PREVIEWABLE_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

function releaseInlineAudioState(state?: InlineAudioState | null) {
  if (state?.kind === "ready" && state.revokeOnDispose) URL.revokeObjectURL(state.url);
}

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1048576) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / 1048576).toFixed(1)} MB`;
}

function attachmentCardState(
  attachment: AfpAttachment,
  previewValue: { attId: string; state: PreviewState } | null,
  inlineAudioValue: InlineAudioState | undefined,
  buffering: boolean,
): AttachmentCardState {
  const backendText =
    (attachment.storage?.backend as string | undefined) ??
    (attachment.storage?.type as string | undefined) ??
    "hosted";
  const encryptionText =
    (attachment.encryption?.scheme as string | undefined) ??
    (attachment.encryption?.algorithm as string | undefined) ??
    "AES-256-GCM";
  const loadingPreview = previewValue?.attId === attachment.id && previewValue.state.kind === "loading";
  const showAudioButton = isAudioPreviewable(attachment);
  const showPreviewButton = isPreviewable(attachment);

  return {
    id: attachment.id,
    name: attachment.name,
    metaText: `${attachment.mime_type}${" · "}${formatBytes(attachment.size_bytes)}`,
    backendText,
    encryptionText,
    shaText: attachment.sha256 ? `${attachment.sha256.slice(0, 16)}...` : null,
    showSha: Boolean(attachment.sha256),
    showPreviewButton,
    showAudioButton,
    previewButtonText: loadingPreview ? ATTACHMENTS_PREVIEW_LOADING_LABEL : ATTACHMENTS_PREVIEW_LABEL,
    audioButtonText: inlineAudioValue ? ATTACHMENTS_AUDIO_HIDE_LABEL : ATTACHMENTS_AUDIO_SHOW_LABEL,
    loadingPreview,
    inlineAudioState: inlineAudioValue,
    showInlineAudio: Boolean(inlineAudioValue),
    showBuffering: buffering,
  };
}

export function AttachmentsRenderer(props: { message: AfpMessage }) {
  const attachments = createMemo(() => props.message.attachments ?? []);
  const [preview, setPreview] = createSignal<{ attId: string; state: PreviewState } | null>(null);
  const [inlineAudio, setInlineAudio] = createSignal<Record<string, InlineAudioState>>({});
  const [bufferingAudio, setBufferingAudio] = createSignal<Record<string, boolean>>({});

  const rendererState = createMemo(() => {
    const previewValue = preview();
    const audioMap = inlineAudio();
    const bufferingMap = bufferingAudio();
    const items = attachments().map((attachment) => ({
      attachment,
      cardState: attachmentCardState(
        attachment,
        previewValue,
        audioMap[attachment.id],
        Boolean(bufferingMap[attachment.id]),
      ),
    }));

    return {
      itemCount: items.length,
      headerText: `${ATTACHMENTS_TITLE} · ${items.length} file${items.length === 1 ? "" : "s"}`,
      items,
      showAttachments: items.length > 0,
      previewValue,
    };
  });

  const previewModalState = createMemo(() => {
    const previewValue = rendererState().previewValue;
    if (!previewValue) return null;

    const titleText =
      previewValue.state.kind !== "loading" && previewValue.state.kind !== "error"
        ? previewValue.state.name
        : ATTACHMENTS_PREVIEW_FALLBACK_TITLE;

    if (previewValue.state.kind === "csv") {
      const header = previewValue.state.rows[0] ?? [];
      const body = previewValue.state.rows.slice(1);
      return {
        previewValue,
        titleText,
        kind: "csv" as const,
        header,
        body,
        footerText: `${body.length} rows · ${header.length} cols`,
      };
    }

    return {
      previewValue,
      titleText,
      kind: previewValue.state.kind,
    };
  });

  function setBuffering(attachmentId: string, value: boolean) {
    setBufferingAudio((current) => (current[attachmentId] === value ? current : { ...current, [attachmentId]: value }));
  }

  async function ensureInlineAudio(attachment: AfpAttachment) {
    const existing = inlineAudio()[attachment.id];
    if (existing) return;

    try {
      const directUrl = attachmentPreviewDownloadUrl(attachment);
      const mimeType = attachment.mime_type || "audio/mpeg";
      const inlineBuffer = attachmentPreviewInlineBuffer(attachment);
      const inlineBytes = attachmentPreviewInlineBytes(attachment);

      if (inlineBuffer && inlineBytes) {
        const blobUrl = URL.createObjectURL(new Blob([inlineBuffer], { type: mimeType }));
        setInlineAudio((current) => ({
          ...current,
          [attachment.id]: { kind: "ready", url: blobUrl, mimeType, revokeOnDispose: true },
        }));
        return;
      }

      if (directUrl) {
        setInlineAudio((current) => ({
          ...current,
          [attachment.id]: { kind: "ready", url: directUrl, mimeType, revokeOnDispose: false },
        }));
        return;
      }

      setInlineAudio((current) => ({
        ...current,
        [attachment.id]: {
          kind: "error",
          receipt: buildAttachmentsRendererFailureReceipt(
            "Load audio preview",
            "No inline audio source is available for this attachment.",
          ),
        },
      }));
    } catch (error) {
      setInlineAudio((current) => ({
        ...current,
        [attachment.id]: {
          kind: "error",
          receipt: buildAttachmentsRendererFailureReceipt(
            "Load audio preview",
            error instanceof Error ? error.message : "Could not load audio preview.",
          ),
        },
      }));
    }
  }

  function toggleInlineAudio(attachment: AfpAttachment) {
    const current = inlineAudio()[attachment.id];
    if (current) {
      releaseInlineAudioState(current);
      setInlineAudio((existing) => {
        const next = { ...existing };
        delete next[attachment.id];
        return next;
      });
      setBuffering(attachment.id, false);
      return;
    }
    void ensureInlineAudio(attachment);
  }

  async function openPreview(attachment: AfpAttachment) {
    setPreview({ attId: attachment.id, state: { kind: "loading" } });
    try {
      let previewAttachment = attachment;
      let bytes: ArrayBuffer;
      try {
        bytes = await readAttachmentPreviewBytes(previewAttachment);
      } catch (initialError) {
        // Stored Wedding artifacts can outlive their short-lived signed URL.
        // Refresh only through the authenticated, tenant-scoped file library.
        const library = await fetchFileLibrary({ query: attachment.name, limit: 50 });
        const refreshed = library.items.find((item) => item.id === attachment.id);
        if (!refreshed?.download_url) throw initialError;
        previewAttachment = {
          ...attachment,
          storage: { ...attachment.storage, download_url: refreshed.download_url },
        };
        bytes = await readAttachmentPreviewBytes(previewAttachment);
      }

      const mime = attachment.mime_type ?? "";
      const lowerName = attachment.name?.toLowerCase() ?? "";

      if (mime === "application/pdf" || lowerName.endsWith(".pdf")) {
        const blob = new Blob([bytes], { type: "application/pdf" });
        const blobUrl = URL.createObjectURL(blob);
        setPreview({ attId: attachment.id, state: { kind: "pdf", url: blobUrl, name: attachment.name } });
        return;
      }

      if (mime === "text/csv" || mime === "application/csv" || lowerName.endsWith(".csv")) {
        const text = new TextDecoder().decode(bytes);
        const rows = text
          .split("\n")
          .filter((row) => row.trim().length > 0)
          .map((row) => row.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "")));
        setPreview({ attId: attachment.id, state: { kind: "csv", rows, name: attachment.name } });
        return;
      }

      if (mime.includes("officedocument.wordprocessingml.document") || lowerName.endsWith(".docx")) {
        const mammoth = await import("mammoth");
        const result = await mammoth.convertToHtml({ arrayBuffer: bytes });
        setPreview({ attId: attachment.id, state: { kind: "html", content: sanitizeMarkdownHtml(result.value), name: attachment.name } });
        return;
      }

      if (mime === "application/msword" || lowerName.endsWith(".doc")) {
        const directUrl = attachmentPreviewDownloadUrl(previewAttachment);
        if (!directUrl) throw new Error("This legacy Word file needs a downloadable source before it can be previewed.");
        setPreview({ attId: attachment.id, state: { kind: "office", url: directUrl, name: attachment.name } });
        return;
      }

      const text = new TextDecoder().decode(bytes);
      setPreview({ attId: attachment.id, state: { kind: "text", content: text, name: attachment.name } });
    } catch (error) {
      setPreview({
        attId: attachment.id,
        state: {
          kind: "error",
          receipt: buildAttachmentsRendererFailureReceipt(
            "Preview attachment",
            error instanceof Error ? error.message : "Preview failed",
          ),
        },
      });
    }
  }

  function closePreview() {
    const previewValue = preview();
    if (previewValue?.state.kind === "pdf" && previewValue.state.url.startsWith("blob:")) URL.revokeObjectURL(previewValue.state.url);
    setPreview(null);
  }

  onCleanup(() => {
    for (const state of Object.values(inlineAudio())) {
      releaseInlineAudioState(state);
    }
  });

  return (
    <div class="space-y-2">
      <p class={ATTACHMENTS_HEADER_CLASS}>{rendererState().headerText}</p>
      <Show when={rendererState().showAttachments} fallback={<p class="text-sm text-on-surface-variant">{ATTACHMENTS_EMPTY_TEXT}</p>}>
        <div class="space-y-2">
          <For each={rendererState().items}>
            {({ attachment, cardState }) => (
              <div class={ATTACHMENTS_CARD_CLASS}>
                <div class="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div class="min-w-0">
                    <p class="break-words font-medium text-on-surface">{cardState.name}</p>
                    <p class="mt-0.5 break-words text-xs text-on-surface-variant">{cardState.metaText}</p>
                  </div>
                  <div class="flex flex-wrap items-center gap-2 sm:shrink-0">
                    <Show when={cardState.showAudioButton}>
                      <button
                        type="button"
                        onClick={() => toggleInlineAudio(attachment)}
                        class={ATTACHMENTS_AUDIO_BUTTON_CLASS}
                      >
                        {cardState.audioButtonText}
                      </button>
                    </Show>
                    <Show when={cardState.showPreviewButton}>
                      <button
                        type="button"
                        disabled={cardState.loadingPreview}
                        onClick={() => openPreview(attachment)}
                        class={ATTACHMENTS_PREVIEW_BUTTON_CLASS}
                      >
                        {cardState.previewButtonText}
                      </button>
                    </Show>
                    <span class={ATTACHMENTS_STATUS_CHIP_CLASS}>{ATTACHMENTS_ENCRYPTED_LABEL}</span>
                  </div>
                </div>
                <div class={ATTACHMENTS_META_GRID_CLASS}>
                  <div class={ATTACHMENTS_META_CARD_CLASS}>
                    <div class={ATTACHMENTS_META_LABEL_CLASS}>{ATTACHMENTS_STORAGE_LABEL}</div>
                    <div class="mt-0.5">{cardState.backendText}</div>
                  </div>
                  <div class={ATTACHMENTS_META_CARD_CLASS}>
                    <div class={ATTACHMENTS_META_LABEL_CLASS}>{ATTACHMENTS_ENCRYPTION_LABEL}</div>
                    <div class="mt-0.5">{cardState.encryptionText}</div>
                  </div>
                  <Show when={cardState.showSha}>
                    <div class={ATTACHMENTS_META_CARD_CLASS}>
                      <div class={ATTACHMENTS_META_LABEL_CLASS}>{ATTACHMENTS_HASH_LABEL}</div>
                      <div class="mt-0.5 break-all font-mono text-[9px]">{cardState.shaText}</div>
                    </div>
                  </Show>
                </div>
                <Show when={cardState.showInlineAudio}>
                  <div class={ATTACHMENTS_AUDIO_PANEL_CLASS}>
                    <Show
                      when={cardState.inlineAudioState?.kind === "ready"}
                      fallback={
                        <div class={ATTACHMENTS_AUDIO_ERROR_CLASS}>
                          <p class="font-medium">
                            {(cardState.inlineAudioState as { receipt: AttachmentsRendererFailureReceipt }).receipt.title}
                          </p>
                          <p>
                            {(cardState.inlineAudioState as { receipt: AttachmentsRendererFailureReceipt }).receipt.summary}
                          </p>
                          <p class="opacity-80">
                            {(cardState.inlineAudioState as { receipt: AttachmentsRendererFailureReceipt }).receipt.nextStep}
                          </p>
                        </div>
                      }
                    >
                      <div class="relative">
                        <audio
                          controls
                          preload="none"
                          class="w-full"
                          src={(cardState.inlineAudioState as { url: string }).url}
                          onWaiting={() => setBuffering(attachment.id, true)}
                          onPlaying={() => setBuffering(attachment.id, false)}
                          onCanPlay={() => setBuffering(attachment.id, false)}
                        >
                          {ATTACHMENTS_AUDIO_BROWSER_FALLBACK}
                        </audio>
                        <Show when={cardState.showBuffering}>
                          <div class="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-sky-700/80">
                            <GenesisLogoAnimation size={16} mode="idle" />
                            <span>{ATTACHMENTS_BUFFERING_LABEL}</span>
                          </div>
                        </Show>
                      </div>
                    </Show>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={previewModalState()} keyed>
        {(modalState) => (
          <div
            class={ATTACHMENTS_MODAL_OVERLAY_CLASS}
            onClick={(event) => {
              if (event.target === event.currentTarget) closePreview();
            }}
          >
            <div class={ATTACHMENTS_MODAL_SHELL_CLASS}>
              <div class={ATTACHMENTS_MODAL_HEADER_CLASS}>
                <p class="min-w-0 break-words text-sm font-medium text-on-surface">{modalState.titleText}</p>
                <button type="button" onClick={closePreview} class={ATTACHMENTS_MODAL_CLOSE_CLASS}>
                  {ATTACHMENTS_CLOSE_LABEL}
                </button>
              </div>

              <div class={ATTACHMENTS_MODAL_BODY_CLASS}>
                <Show when={modalState.kind === "loading"}>
                  <p class="animate-pulse text-sm text-on-surface-variant">{ATTACHMENTS_DECRYPTING_LABEL}</p>
                </Show>

                <Show when={modalState.kind === "error"}>
                  <div class={ATTACHMENTS_MODAL_ERROR_CLASS}>
                    <p class="font-medium">{(modalState.previewValue.state as { receipt: AttachmentsRendererFailureReceipt }).receipt.title}</p>
                    <p class="mt-1">{(modalState.previewValue.state as { receipt: AttachmentsRendererFailureReceipt }).receipt.summary}</p>
                    <p class="mt-1 opacity-80">{(modalState.previewValue.state as { receipt: AttachmentsRendererFailureReceipt }).receipt.nextStep}</p>
                  </div>
                </Show>

                <Show when={modalState.kind === "pdf"}>
                  <iframe
                    src={(modalState.previewValue.state as { url: string }).url}
                    class="min-h-[65vh] w-full rounded-lg border-0"
                    title={ATTACHMENTS_PDF_TITLE}
                  />
                </Show>

                <Show when={modalState.kind === "csv"}>
                  <div class="overflow-auto">
                    <table class="w-full border-collapse text-xs">
                      <thead>
                        <tr>
                          <For each={(modalState as { header: string[] }).header}>
                            {(cell) => (
                              <th class="border border-white/20 bg-white/10 px-3 py-1.5 text-left font-semibold text-on-surface">
                                {cell}
                              </th>
                            )}
                          </For>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={(modalState as { body: string[][] }).body}>
                          {(row, index) => (
                            <tr class={index() % 2 === 0 ? "" : "bg-white/5"}>
                              <For each={row}>
                                {(cell) => (
                                  <td class="border border-white/20 px-3 py-1 text-on-surface-variant">
                                    {cell}
                                  </td>
                                )}
                              </For>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                    <p class="mt-2 text-right font-mono text-[9px] text-outline">
                      {(modalState as { footerText: string }).footerText}
                    </p>
                  </div>
                </Show>

                <Show when={modalState.kind === "text"}>
                  <pre class="whitespace-pre-wrap font-mono text-xs leading-relaxed text-on-surface-variant">
                    {(modalState.previewValue.state as { content: string }).content}
                  </pre>
                </Show>
                <Show when={modalState.kind === "html"}>
                  <div class="md-prose rounded-lg bg-white p-4 text-sm leading-6 text-on-surface" innerHTML={(modalState.previewValue.state as { content: string }).content} />
                </Show>
                <Show when={modalState.kind === "office"}>
                  <object data={(modalState.previewValue.state as { url: string }).url} class="min-h-[65vh] w-full rounded-lg bg-white" aria-label="Word document preview">
                    <a class="text-primary underline" href={(modalState.previewValue.state as { url: string }).url} target="_blank" rel="noreferrer">Open the original Word document</a>
                  </object>
                </Show>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
