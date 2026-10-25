import { createSignal, For, Show } from "solid-js";

import type { SendAfpMessageInput } from "@/lib/api";
import { weddingCustomTaskToAfpSendInput } from "@/lib/weddingCustomTaskState";
import { WEDDING_JOURNEY_STAGES, type WeddingJourneyStageId } from "@/lib/weddingJourneyStageState";

export function WeddingTaskComposer(props: {
  weddingPlanId: string;
  responseWorkspaceId: string;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: (() => void) | null;
}) {
  const [open, setOpen] = createSignal(false);
  const [title, setTitle] = createSignal("");
  const [stage, setStage] = createSignal<WeddingJourneyStageId>("plan_budget");
  const [dueDate, setDueDate] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal<string | null>(null);

  async function save(): Promise<void> {
    const input = weddingCustomTaskToAfpSendInput({
      title: title(), stage: stage(), dueDate: dueDate(),
      weddingPlanId: props.weddingPlanId, responseWorkspaceId: props.responseWorkspaceId,
    });
    if (!input || !props.saveProjection) {
      setNotice(props.saveProjection ? "Add a title before saving." : "Task saving is unavailable in this view.");
      return;
    }
    setBusy(true);
    try {
      await props.saveProjection(input);
      setTitle(""); setDueDate(""); setOpen(false);
      setNotice("Task added to the wedding plan.");
      props.onRefreshWorkspace?.();
    } catch {
      setNotice("The task could not be saved. Try again.");
    } finally { setBusy(false); }
  }

  return (
    <section class="mt-4 rounded-xl border border-wedding-border bg-wedding-page p-3" aria-label="Add a wedding task">
      <button type="button" class="min-h-11 rounded-lg bg-wedding-primary px-4 text-sm font-semibold text-white" aria-expanded={open()} onClick={() => setOpen((value) => !value)}>{open() ? "Cancel" : "Add task"}</button>
      <Show when={open()}>
        <div class="mt-3 grid gap-3 sm:grid-cols-3">
          <label class="text-sm font-semibold text-wedding-ink sm:col-span-3">Task
            <input class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3 font-normal" value={title()} onInput={(event) => setTitle(event.currentTarget.value)} placeholder="What needs to be done?" />
          </label>
          <label class="text-sm font-semibold text-wedding-ink sm:col-span-2">Stage
            <select class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3 font-normal" value={stage()} onChange={(event) => setStage(event.currentTarget.value as WeddingJourneyStageId)}>
              <For each={WEDDING_JOURNEY_STAGES}>{(item) => <option value={item.id}>{item.label}</option>}</For>
            </select>
          </label>
          <label class="text-sm font-semibold text-wedding-ink">Deadline
            <input type="date" class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3 font-normal" value={dueDate()} onInput={(event) => setDueDate(event.currentTarget.value)} />
          </label>
          <button type="button" disabled={busy() || !title().trim()} onClick={() => void save()} class="min-h-11 rounded-lg bg-wedding-secondary px-4 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-3">{busy() ? "Saving…" : "Save task"}</button>
        </div>
      </Show>
      <Show when={notice()}>{(message) => <p class="mt-2 text-sm text-wedding-ink/70" role="status">{message()}</p>}</Show>
    </section>
  );
}
