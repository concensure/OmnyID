// @locs-version: 1.0
import { createSignal, Show } from "solid-js";

import {
  parseWeddingDateInput,
  weddingDatePlaceholder,
} from "@/lib/weddingDateCaptureState";

export function WeddingDateEntryControl(props: {
  onSave: (date: string) => Promise<void> | void;
  locale?: string | null;
  compact?: boolean;
}) {
  const [open, setOpen] = createSignal(false);
  const [textDate, setTextDate] = createSignal("");
  const [calendarDate, setCalendarDate] = createSignal("");
  const [notice, setNotice] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);
  const placeholder = () => weddingDatePlaceholder(props.locale);
  const parsedDate = () => parseWeddingDateInput(textDate()) ?? parseWeddingDateInput(calendarDate());

  async function saveDate() {
    const date = parsedDate();
    if (!date || saving()) {
      setNotice("Enter a date first, for example 18/09/2027.");
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      await props.onSave(date);
      setNotice("Wedding date saved.");
      setOpen(false);
    } catch {
      setNotice("The date stayed here, but could not be saved to wedding memory yet.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="min-w-0">
      <button
        type="button"
        class="shrink-0 rounded-full bg-rose-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open()}
      >
        Add wedding date
      </button>
      <Show when={open()}>
        <div class={`mt-3 rounded-2xl border border-rose-100 bg-white/90 p-3 shadow-sm ${props.compact ? "max-w-md" : "max-w-xl"}`}>
          <div class="grid gap-2 sm:grid-cols-[1fr_auto]">
            <label class="min-w-0 text-xs font-semibold text-rose-950/75">
              Type the date
              <input
                type="text"
                inputMode="numeric"
                value={textDate()}
                placeholder={placeholder()}
                onInput={(event) => setTextDate(event.currentTarget.value)}
                class="mt-1 w-full rounded-full border border-rose-100 bg-white px-3 py-2 text-sm text-rose-950 outline-none transition placeholder:text-rose-900/35 focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
              />
            </label>
            <label class="text-xs font-semibold text-rose-950/75">
              Pick from calendar
              <input
                type="date"
                value={calendarDate()}
                onInput={(event) => {
                  setCalendarDate(event.currentTarget.value);
                  setTextDate(event.currentTarget.value);
                }}
                class="mt-1 min-h-10 rounded-full border border-rose-100 bg-white px-3 text-sm text-rose-950 outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
              />
            </label>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!parsedDate() || saving()}
              onClick={() => void saveDate()}
              class="rounded-full bg-rose-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving() ? "Saving..." : "Save date"}
            </button>
            <button
              type="button"
              class="rounded-full border border-rose-100 bg-white px-3 py-2 text-xs font-semibold text-rose-950/75 transition hover:bg-rose-50"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <Show when={notice()}>
              {(message) => <p class="text-xs font-medium text-rose-950/70">{message()}</p>}
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
