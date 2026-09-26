// @locs-version: 1.0
import { For, Show, createSignal } from "solid-js";
import { API_BASE, type AttachmentIngestCapabilities } from "../lib/api";
import { classifyKnowledgeAttachmentSupport } from "../lib/knowledgeAttachmentExtract";
import {
  type ConvertibleFormat,
  FORMAT_LABEL,
  convertFile,
  detectFormat,
  supportedTargets,
  triggerDownload,
} from "../lib/fileConversion";

// Re-export for easy import by SearchBar
export type { ConvertibleFormat };

const FORMAT_ICON: Record<string, string> = {
  pdf: "ðŸ“„", docx: "ðŸ“", pptx: "ðŸ“Š", html: "ðŸŒ", txt: "ðŸ“ƒ", md: "ðŸ“ƒ",
};

/** Pill + format-picker + convert button for one attached file. */
function FilePill(props: {
  file: File;
  capabilities?: AttachmentIngestCapabilities | null;
  onRemove: () => void;
}) {
  const fmt = () => detectFormat(props.file);
  const knowledgeSupport = () => classifyKnowledgeAttachmentSupport(props.file, props.capabilities);
  const targets = () => supportedTargets(fmt());
  const [target, setTarget] = createSignal<ConvertibleFormat | "">("");
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal<string | null>(null);
  const [done, setDone] = createSignal(false);

  async function convert() {
    const t = target();
    if (!t) return;
    setBusy(true);
    setErr(null);
    setDone(false);
    try {
      const result = await convertFile(props.file, t as ConvertibleFormat, API_BASE);
      triggerDownload(result);
      setDone(true);
      setTimeout(() => setDone(false), 3500);
    } catch (e) {
      setErr((e as Error).message ?? "Conversion failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="flex flex-col gap-0.5">
      <div
        class={`flex items-center gap-1.5 rounded-xl border px-2 py-1 text-xs backdrop-blur-sm transition ${
          done()
            ? "border-green-300 bg-green-50"
              : err()
                ? "border-red-200 bg-red-50"
                : knowledgeSupport().mode === "not_supported_yet"
                  ? "border-amber-200 bg-amber-50"
                  : targets().length === 0
                ? "border-amber-200 bg-amber-50"
                : "border-outline/20 bg-white/60"
        }`}
      >
        {/* Icon based on format */}
        <span class="text-[13px] leading-none select-none" aria-hidden>
          {FORMAT_ICON[fmt() ?? ""] ?? "ðŸ“Ž"}
        </span>

        {/* Filename */}
        <span
          class="max-w-[128px] truncate font-medium text-on-surface"
          title={props.file.name}
        >
          {props.file.name}
        </span>

        {/* Size */}
        <span class="text-on-surface-variant/45 flex-shrink-0">
          {formatBytes(props.file.size)}
        </span>

        <span
          class={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
            knowledgeSupport().mode === "inline_text"
              ? "bg-emerald-100 text-emerald-700"
              : knowledgeSupport().mode === "server_processing"
                ? "bg-sky-100 text-sky-700"
                : "bg-amber-100 text-amber-700"
          }`}
          title={knowledgeSupport().description}
        >
          {knowledgeSupport().label}
        </span>

        <Show when={targets().length > 0} fallback={
          <span class="text-amber-600 text-[10px]" title="No conversions available for this format">
            unsupported
          </span>
        }>
          <span class="text-outline/40">â†’</span>

          {/* Target format picker */}
          <select
            value={target()}
            disabled={busy()}
            onChange={(e) => { setTarget(e.currentTarget.value as ConvertibleFormat); setErr(null); }}
            class="rounded border border-outline/20 bg-transparent px-1 py-0 text-[11px] text-on-surface-variant outline-none focus:border-primary cursor-pointer disabled:opacity-50"
          >
            <option value="">Convert toâ€¦</option>
            <For each={targets()}>
              {(t) => <option value={t}>{FORMAT_LABEL[t]}</option>}
            </For>
          </select>

          {/* Convert button */}
          <Show when={target()}>
            <button
              type="button"
              disabled={busy()}
              onClick={convert}
              class="rounded-lg bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary transition hover:bg-primary/20 active:scale-95 disabled:opacity-50 flex-shrink-0"
              title={`Convert to ${FORMAT_LABEL[target() as ConvertibleFormat]}`}
            >
              {busy() ? "â€¦" : done() ? "âœ“ Done" : "â†“ Get"}
            </button>
          </Show>
        </Show>

        {/* Remove button */}
        <button
          type="button"
          onClick={props.onRemove}
          class="ml-auto flex-shrink-0 text-on-surface-variant/40 transition hover:text-red-400"
          title="Remove attachment"
          aria-label="Remove"
        >
          Ã—
        </button>
      </div>

      {/* Error displayed as a full-width line below the pill (not just a tooltip) */}
      <Show when={err()}>
        <p class="px-2 text-[10px] text-red-500 leading-tight">{err()}</p>
      </Show>
      <Show when={knowledgeSupport().mode !== "inline_text"}>
        <p class="px-2 text-[10px] leading-tight text-on-surface-variant/65">
          {knowledgeSupport().description}
        </p>
      </Show>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

/** Strip of attached file pills rendered above the SearchBar input area. */
export function FileAttachmentStrip(props: {
  files: File[];
  capabilities?: AttachmentIngestCapabilities | null;
  onRemove: (index: number) => void;
}) {
  return (
    <Show when={props.files.length > 0}>
      <div class="flex flex-wrap gap-1.5 px-1 pb-1 pt-0.5">
        <For each={props.files}>
          {(file, i) => (
            <FilePill file={file} capabilities={props.capabilities} onRemove={() => props.onRemove(i())} />
          )}
        </For>
      </div>
    </Show>
  );
}
