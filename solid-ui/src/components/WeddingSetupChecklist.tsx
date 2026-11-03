// @locs-version: 1.0
// @module-id: ui.wedding-setup-checklist
// @primary-capability: wedding-first-details-setup
// @stability: beta
import { For, Show, createSignal } from "solid-js";

export type WeddingSetupChecklistItem = {
  id: string;
  label: string;
  detail: string;
  complete: boolean;
  destination: string;
};

function isoToday(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function WeddingSetupChecklist(props: {
  items: WeddingSetupChecklistItem[];
  initialDate: string;
  onNavigate: (destination: string) => void;
  onSaveDate: (date: string) => Promise<void>;
}) {
  const [dateOpen, setDateOpen] = createSignal(false);
  const [dateDraft, setDateDraft] = createSignal("");
  const [notice, setNotice] = createSignal("");

  const incompleteCount = () => props.items.filter((item) => !item.complete).length;

  function openDate() {
    setDateDraft(/^\d{4}-\d{2}-\d{2}$/.test(props.initialDate) ? props.initialDate : "");
    setNotice("");
    setDateOpen(true);
  }

  async function saveDate() {
    const date = dateDraft();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setNotice("Choose a valid wedding date first.");
      return;
    }
    await props.onSaveDate(date);
    setNotice("Wedding date saved. Your countdown and timeline now use this date.");
    setDateOpen(false);
  }

  return (
    <section class="rounded-[24px] border border-rose-100/80 bg-white/80 p-4 shadow-card phone:hidden sm:rounded-[28px] sm:p-5">
      <div class="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p class="text-lg font-semibold text-rose-950">Finish setting up your plan</p>
          <p class="mt-1 text-base leading-7 text-rose-900/70">
            Add each detail here once. OmnyID will keep your timeline, budget, guests, and helpers connected.
          </p>
        </div>
        <span class="w-fit rounded-full bg-rose-50 px-2 py-1 text-sm font-semibold text-rose-900">
          {incompleteCount()} to add
        </span>
      </div>
      <div class="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <For each={props.items}>
          {(item) => (
            <button
              type="button"
              disabled={item.complete}
              onClick={() => item.id === "date" ? openDate() : props.onNavigate(item.destination)}
              class={`min-w-0 rounded-2xl border px-4 py-3 text-left transition ${
                item.complete
                  ? "cursor-default border-emerald-100 bg-emerald-50/75 text-emerald-950"
                  : "border-rose-100 bg-rose-50/70 text-rose-950 hover:border-rose-200 hover:bg-rose-50"
              }`}
            >
              <span class="block text-sm font-semibold">{item.complete ? "Done" : "Add"}</span>
              <span class="mt-1 block break-words text-base font-semibold">{item.label}</span>
              <span class="mt-1 block text-sm leading-6 opacity-70">{item.detail}</span>
            </button>
          )}
        </For>
      </div>
      <Show when={dateOpen()}>
        <div class="mt-3 rounded-2xl border border-rose-200 bg-white p-4" role="group" aria-label="Set wedding date">
          <label for="wedding-setup-date" class="block text-base font-semibold text-rose-950">Wedding date</label>
          <p class="mt-1 text-sm leading-6 text-rose-900/70">Choose the date here; you can change it later from Plan.</p>
          <div class="mt-3 flex flex-wrap items-end gap-3">
            <input id="wedding-setup-date" type="date" min={isoToday()} value={dateDraft()} onInput={(event) => { setDateDraft(event.currentTarget.value); setNotice(""); }} class="min-h-12 rounded-xl border border-rose-200 bg-white px-3 text-base text-rose-950 outline-none focus:border-rose-400" />
            <button type="button" onClick={() => void saveDate()} class="min-h-12 rounded-xl bg-rose-800 px-5 text-base font-semibold text-white hover:bg-rose-900">Save date</button>
            <button type="button" onClick={() => setDateOpen(false)} class="min-h-12 rounded-xl border border-rose-200 px-5 text-base font-semibold text-rose-900 hover:bg-rose-50">Cancel</button>
          </div>
        </div>
      </Show>
      <Show when={notice()}>
        <p class="mt-3 text-sm font-medium text-rose-800" role="status">{notice()}</p>
      </Show>
    </section>
  );
}
