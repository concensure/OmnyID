// @locs-version: 1.0
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";

import { executeUiCommand, type SendAfpMessageInput } from "@/lib/api";
import {
  buildWeddingInspirationItem,
  buildWeddingInspirationState,
  weddingInspirationItemsToAfpSendInput,
  type WeddingInspirationItem,
  type WeddingInspirationState,
} from "@/lib/weddingInspirationState";
import { buildWeddingExperienceModelState } from "@/lib/weddingExperienceModelState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";

const MAX_INSPIRATION_FILE_BYTES = 20 * 1024 * 1024;
const MAX_INSPIRATION_BATCH_SIZE = 50;

function fileToDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  });
}

function titleForFile(file: File): string {
  const lower = file.name.toLowerCase();
  if (lower.includes("dress") || lower.includes("gown")) return "Dress inspiration";
  if (lower.includes("venue") || lower.includes("garden") || lower.includes("hall")) return "Venue inspiration";
  if (lower.includes("table") || lower.includes("reception")) return "Reception inspiration";
  if (lower.includes("flower") || lower.includes("floral")) return "Decor inspiration";
  if (lower.includes("photo") || lower.includes("portfolio")) return "Photography inspiration";
  return "Wedding inspiration";
}

function kindForFile(file: File): "image" | "screenshot" | "pdf" | "voice_note" {
  const lower = `${file.name} ${file.type}`.toLowerCase();
  if (lower.includes("screenshot")) return "screenshot";
  if (file.type.includes("pdf")) return "pdf";
  if (file.type.startsWith("audio/")) return "voice_note";
  return "image";
}

function supportedFile(file: File): boolean {
  return file.type.startsWith("image/") || file.type.startsWith("audio/") || file.type.includes("pdf");
}

function validWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function sourceLabel(item: WeddingInspirationItem): string {
  if (item.kind === "url") return "Link";
  if (item.kind === "thought") return "Note";
  if (item.kind === "voice_note") return "Voice note";
  if (item.kind === "pdf") return "Document";
  if (item.kind === "email") return "Email";
  return "Image";
}

export function WeddingInspirationPanel(props: {
  state: WeddingResponseWorkspaceViewState;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: () => void;
}) {
  let fileInputRef: HTMLInputElement | undefined;
  const [localItems, setLocalItems] = createSignal<WeddingInspirationItem[]>([]);
  const [dragActive, setDragActive] = createSignal(false);
  const [urlValue, setUrlValue] = createSignal("");
  const [noteValue, setNoteValue] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [experienceFeedback, setExperienceFeedback] = createSignal<"yes" | "mostly" | "not_really" | null>(null);
  const [correction, setCorrection] = createSignal("");
  const [correctionRunning, setCorrectionRunning] = createSignal(false);
  let correctionTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => {
    if (correctionTimer) clearTimeout(correctionTimer);
  });
  const combinedState = createMemo<WeddingInspirationState>(() =>
    buildWeddingInspirationState([...localItems(), ...props.state.inspiration.items]),
  );
  // Build from the combined local + saved evidence so the agent's working model
  // responds immediately to a second photo or every new note, before refresh returns.
  const experienceModel = () => buildWeddingExperienceModelState(combinedState(), {
    evidenceWeight: experienceFeedback() === "mostly" ? 0.8 : 1,
  });

  function validateExperience(option: string): void {
    if (option === "Yes") {
      setExperienceFeedback("yes");
      setNotice("Thanks — we’ll keep using this direction when planning.");
      return;
    }
    if (option === "Mostly") {
      setExperienceFeedback("mostly");
      setNotice("Got it — OmnyID will use the current preference evidence at 80% weight while you add more clues.");
      return;
    }
    setExperienceFeedback("not_really");
    setNotice("Tell OmnyID what feels off so it can revise the working direction.");
  }

  function requestCorrection(value: string): void {
    if (correctionTimer) clearTimeout(correctionTimer);
    const clean = value.trim();
    if (!clean) return;
    correctionTimer = setTimeout(() => {
      setCorrectionRunning(true);
      void executeUiCommand({
        query: `Revise the wedding inspiration direction using this correction from the couple: ${clean}`,
        browser_intent: "wedding_inspiration_correction",
      })
        .then((response) => {
          setNotice(response.summary || "Thanks — OmnyID is revising the working direction from your note.");
        })
        .catch(() => {
          setNotice("Your correction is still here. Connect an AI model to have OmnyID revise the direction.");
        })
        .finally(() => setCorrectionRunning(false));
    }, 550);
  }

  async function addFiles(files: FileList | File[]) {
    const incoming = Array.from(files).slice(0, MAX_INSPIRATION_BATCH_SIZE);
    const entries = incoming.filter((file) => supportedFile(file) && file.size <= MAX_INSPIRATION_FILE_BYTES);
    if (entries.length === 0) {
      setNotice("No files were added. Choose images, PDFs, or voice notes under 20 MB each.");
      return;
    }
    const created = await Promise.all(entries.map(async (file, index) => {
      const previewUrl = file.type.startsWith("image/") ? await fileToDataUrl(file) : null;
      return buildWeddingInspirationItem({
        title: titleForFile(file),
        kind: kindForFile(file),
        fileName: file.name,
        mimeType: file.type,
        previewUrl,
        note: file.name.toLowerCase().includes("pinterest") ? "Pinterest screenshot" : null,
        uploadedBy: "couple",
        createdAt: new Date(Date.now() + index).toISOString(),
      });
    }));
    setLocalItems((current) => [...created, ...current]);
    const skipped = incoming.length - entries.length;
    setNotice(`${created.length} item${created.length === 1 ? "" : "s"} added to Inspiration.${skipped > 0 ? ` ${skipped} file${skipped === 1 ? "" : "s"} skipped because it was too large or not supported.` : ""} Save them to keep them with this wedding.`);
  }

  function addUrl() {
    const url = urlValue().trim();
    if (!url) return;
    if (!validWebUrl(url)) {
      setNotice("Paste a normal website link that starts with http or https.");
      return;
    }
    setLocalItems((current) => [
      buildWeddingInspirationItem({
        title: "Wedding inspiration link",
        kind: "url",
        sourceUrl: url,
        note: noteValue(),
        uploadedBy: "couple",
      }),
      ...current,
    ]);
    setUrlValue("");
    setNoteValue("");
    setNotice("Link added to Inspiration. Save it to keep it with this wedding.");
  }

  function addThought() {
    const note = noteValue().trim();
    if (!note) return;
    setLocalItems((current) => [
      buildWeddingInspirationItem({
        title: "Wedding thought",
        kind: "thought",
        note,
        uploadedBy: "couple",
      }),
      ...current,
    ]);
    setNoteValue("");
    setNotice("Thought added to Inspiration. Save it to keep it with this wedding.");
  }

  async function saveInspiration() {
    const items = localItems();
    if (items.length === 0) {
      setNotice("Add something first, then save it to this wedding.");
      return;
    }
    if (!props.saveProjection) {
      setNotice("Inspiration is ready here. Sign in or connect saving to keep it with this wedding.");
      return;
    }
    setSaving(true);
    try {
      await props.saveProjection(weddingInspirationItemsToAfpSendInput({
        items,
        metadata: props.state.workspace.metadata,
      }));
      const savedState = buildWeddingInspirationState(items);
      setLocalItems([]);
      setNotice("Inspiration saved with this wedding. OmnyID kept the planning clues for future recommendations.");
      props.onRefreshWorkspace?.();
    } catch {
      setNotice("Inspiration is ready, but it could not be saved yet.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section class="w-full max-w-none min-w-0 rounded-[24px] border border-rose-100/80 bg-rose-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-5 xl:p-6">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-lg font-bold tracking-tight text-rose-950">Inspiration</p>
          <p class="mt-1 text-sm leading-6 text-rose-950/75">
            Add photos, screenshots, links, notes, PDFs, emails, or voice notes. OmnyID turns them into wedding preferences.
          </p>
        </div>
        <button
          type="button"
          disabled={saving()}
          onClick={() => void saveInspiration()}
          class="rounded-full bg-rose-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving() ? "Saving..." : "Save to wedding"}
        </button>
      </div>

      <div
        class={`mt-3 rounded-2xl border border-dashed px-3 py-5 text-center transition ${dragActive() ? "border-rose-400 bg-white" : "border-rose-200 bg-white/70"}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          const files = event.dataTransfer?.files;
          if (files) void addFiles(files);
        }}
      >
        <p class="text-sm font-semibold text-rose-950">Add to our wedding</p>
        <p class="mt-1 text-xs leading-5 text-rose-950/65">
          Drag photos here, or choose several from your camera roll.
        </p>
        <button
          type="button"
          class="mt-3 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-950 transition hover:bg-white"
          onClick={() => fileInputRef?.click()}
        >
          Choose photos or files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,audio/*"
          class="hidden"
          onChange={(event) => {
            const files = event.currentTarget.files;
            if (files) void addFiles(files);
            event.currentTarget.value = "";
          }}
        />
      </div>

      <div class="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
        <input
          type="url"
          value={urlValue()}
          onInput={(event) => setUrlValue(event.currentTarget.value)}
          placeholder="Paste a venue, vendor, Pinterest, or album link"
          class="min-h-10 rounded-2xl border border-rose-100 bg-white/85 px-3 text-sm text-rose-950 outline-none transition placeholder:text-rose-950/40 focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
        />
        <input
          type="text"
          value={noteValue()}
          onInput={(event) => setNoteValue(event.currentTarget.value)}
          placeholder="What do you like about it?"
          class="min-h-10 rounded-2xl border border-rose-100 bg-white/85 px-3 text-sm text-rose-950 outline-none transition placeholder:text-rose-950/40 focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
        />
        <div class="flex gap-2">
          <button
            type="button"
            class="rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-950 transition hover:bg-rose-50"
            onClick={addUrl}
          >
            Add link
          </button>
          <button
            type="button"
            class="rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-950 transition hover:bg-rose-50"
            onClick={addThought}
          >
            Add note
          </button>
        </div>
      </div>

      <Show when={notice()}>
        {(message) => <p class="mt-2 text-xs leading-5 text-rose-950/65">{message()}</p>}
      </Show>

      <Show when={combinedState().insight} fallback={
        <p class="mt-3 rounded-2xl border border-rose-100 bg-white/70 px-3 py-2 text-sm leading-6 text-rose-950/70">
          {combinedState().items.length === 0 ? combinedState().emptyLabel : "Add a few more examples and OmnyID will start spotting patterns."}
        </p>
      }>
        {(insight) => (
          <div class="mt-3 rounded-2xl border border-rose-100 bg-white/75 p-3">
            <p class="text-sm font-semibold text-rose-950">{insight().title}</p>
            <p class="mt-1 text-sm leading-6 text-rose-950/75">{insight().detail}</p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <For each={insight().evidenceLabels}>
                {(label) => <span class="rounded-full bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-950/75">{label}</span>}
              </For>
            </div>
          </div>
        )}
      </Show>

      <div class="mt-3 rounded-2xl border border-rose-100 bg-white/75 p-3">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="text-sm font-semibold text-rose-950">{experienceModel().title}</p>
            <p class="mt-1 text-sm leading-6 text-rose-950/75">
              {experienceModel().summaryLabel}
            </p>
          </div>
          <span class="rounded-full bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-950/70">
            {experienceModel().confidenceLabel}
          </span>
        </div>
        <Show when={experienceModel().traits.length > 0} fallback={
          <p class="mt-2 text-xs leading-5 text-rose-950/65">{experienceModel().emptyLabel}</p>
        }>
          <div class="mt-3 grid gap-2 md:grid-cols-2">
            <For each={experienceModel().traits.slice(0, 4)}>
              {(trait) => (
                <article class="rounded-2xl border border-rose-100 bg-rose-50/60 p-3">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="text-sm font-semibold text-rose-950">{trait.label}</p>
                    <span class="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-rose-950/65">{trait.confidence}</span>
                  </div>
                  <p class="mt-1 text-xs leading-5 text-rose-950/70">{trait.plainMeaning}</p>
                  <Show when={trait.evidenceLabels[0]}>
                    {(label) => <p class="mt-2 text-[11px] leading-5 text-rose-950/55">Clue: {label()}</p>}
                  </Show>
                </article>
              )}
            </For>
          </div>
        </Show>
        <Show when={experienceModel().recommendationConstraints.length > 0}>
          <div class="mt-3 rounded-2xl border border-rose-100 bg-white/75 p-3">
            <p class="text-xs font-semibold uppercase tracking-[0.12em] text-rose-950/55">Use this when choosing</p>
            <ul class="mt-2 space-y-1.5">
              <For each={experienceModel().recommendationConstraints.slice(0, 3)}>
                {(constraint) => (
                  <li class="text-xs leading-5 text-rose-950/70">
                    <span class="font-semibold text-rose-950">{constraint.label}:</span> {constraint.reason}
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
        <Show when={experienceModel().validationPrompt}>
          {(prompt) => (
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <p class="mr-1 text-xs font-semibold text-rose-950/70">{prompt().question}</p>
              <For each={prompt().options}>
                {(option) => (
                  <button
                    type="button"
                    class="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-950 transition hover:bg-rose-50"
                    data-magic-action={option === "Not really" ? "dismiss" : "star"}
                    data-magic-icon={option === "Not really" ? "discard" : "star"}
                    data-magic-label={option}
                    data-magic-id={`wedding:inspiration:validate:${option.toLowerCase().replace(/\W+/g, "-")}`}
                    onClick={() => validateExperience(option)}
                  >
                    {option}
                  </button>
                )}
              </For>
            </div>
          )}
        </Show>
        <Show when={experienceFeedback() === "not_really"}>
          <div class="mt-3">
            <label class="text-xs font-semibold text-rose-950/70" for="wedding-inspiration-correction">How should this feel instead?</label>
            <textarea
              id="wedding-inspiration-correction"
              value={correction()}
              onInput={(event) => {
                const value = event.currentTarget.value;
                setCorrection(value);
                requestCorrection(value);
              }}
              placeholder="For example: warmer, more relaxed, and less formal."
              class="mt-1 min-h-20 w-full rounded-2xl border border-rose-100 bg-white px-3 py-2 text-sm text-rose-950 outline-none transition placeholder:text-rose-950/40 focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
            />
            <Show when={correctionRunning()}>
              <p class="mt-1 text-xs text-rose-950/65">Updating the working direction…</p>
            </Show>
          </div>
        </Show>
      </div>

      <Show when={combinedState().tagCounts.length > 0}>
        <div class="mt-3 flex flex-wrap gap-1.5">
          <For each={combinedState().tagCounts.slice(0, 10)}>
            {(entry) => (
              <span class="rounded-full border border-rose-100 bg-white/80 px-2 py-1 text-xs text-rose-950/75">
                {entry.tag} - {entry.count}
              </span>
            )}
          </For>
        </div>
      </Show>

      <div class="mt-3 grid gap-2 sm:grid-cols-2">
        <For each={combinedState().items.slice(0, 12)}>
          {(item) => (
            <article class="overflow-hidden rounded-2xl border border-rose-100 bg-white/80">
              <Show when={item.previewUrl}>
                {(url) => <img src={url()} alt={item.title} class="h-36 w-full object-contain bg-rose-50" />}
              </Show>
              <div class="p-3">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <p class="text-sm font-semibold text-rose-950">{item.title}</p>
                  <Show when={sourceLabel(item) !== "Image"}><span class="rounded-full bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-950/70">{sourceLabel(item)}</span></Show>
                </div>
                <Show when={item.note}>
                  {(note) => <p class="mt-1 text-xs leading-5 text-rose-950/65">{note()}</p>}
                </Show>
              </div>
            </article>
          )}
        </For>
      </div>
    </section>
  );
}
