// @locs-version: 1.0
import { createSignal, Show } from "solid-js";

import {
  parseWeddingDateInput,
} from "@/lib/weddingDateCaptureState";

export function WeddingDateEntryControl(props: {
  onSave: (date: string) => Promise<void> | void;
  locale?: string | null;
  compact?: boolean;
  startOpen?: boolean;
  hideTrigger?: boolean;
  actionLabel?: string;
}) {
  const [open, setOpen] = createSignal(Boolean(props.startOpen));
  const [calendarDate, setCalendarDate] = createSignal("");
  const [notice, setNotice] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);
  const parsedDate = () => parseWeddingDateInput(calendarDate());

  async function saveDate() {
    const date = parsedDate();
    if (!date || saving()) {
      setNotice("Pick a date first.");
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      await props.onSave(date);
      setNotice("Wedding date saved.");
      setOpen(false);
    } catch {
      setNotice("We couldn't save that date yet. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="min-w-0">
      <Show when={!props.hideTrigger}><button
        type="button"
        class="min-h-11 shrink-0 rounded-lg bg-wedding-primary px-4 py-2 text-sm font-semibold text-wedding-page transition hover:bg-wedding-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-primary focus-visible:ring-offset-2"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open()}
      >
        {props.actionLabel ?? "Add wedding date"}
      </button></Show>
      <Show when={open()}>
        <div class={`mt-3 rounded-xl border border-wedding-border bg-wedding-card p-3 shadow-wedding-card ${props.compact ? "max-w-md" : "max-w-xl"}`}>
          <label class="block min-w-0 text-xs font-semibold text-wedding-ink/75">
            Pick from calendar
            <input
              type="date"
              value={calendarDate()}
              onInput={(event) => setCalendarDate(event.currentTarget.value)}
              class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3 text-sm text-wedding-ink outline-none transition focus:border-wedding-primary focus:ring-2 focus:ring-wedding-primary/15"
            />
          </label>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!parsedDate() || saving()}
              onClick={() => void saveDate()}
              class="min-h-11 rounded-lg bg-wedding-primary px-3 py-2 text-xs font-semibold text-wedding-page transition hover:bg-wedding-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving() ? "Saving…" : "Save date"}
            </button>
            <button
              type="button"
              class="min-h-11 rounded-lg border border-wedding-secondary bg-white px-3 py-2 text-xs font-semibold text-wedding-secondary transition hover:bg-wedding-slate"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <Show when={notice()}>
              {(message) => <p class="text-xs font-medium text-wedding-ink/70">{message()}</p>}
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
