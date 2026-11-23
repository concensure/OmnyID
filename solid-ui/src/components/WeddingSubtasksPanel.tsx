// @locs-version: 1.0
import { createMemo, createSignal, For, Show } from "solid-js";

import { WeddingTaskCompletionButton } from "@/components/WeddingTaskCompletionButton";
import { WeddingTaskResponsibilityFields } from "@/components/WeddingTaskResponsibilityFields";
import type { SendAfpMessageInput } from "@/lib/api";
import { loadWeddingTaskCompletion } from "@/lib/weddingTaskCompletionLocalState";
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import { weddingTaskDateToAfpSendInput } from "@/lib/weddingTaskDateProjectionState";
import {
  buildWeddingSubtasks,
  weddingSubtaskCreateInput,
  weddingSubtaskRemoveInput,
  weddingSubtaskResearchInput,
  type WeddingSubtask,
} from "@/lib/weddingSubtaskState";

function subtaskId(parentId: string): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `afp-wedding-subtask:${parentId}:${suffix}`;
}

export function WeddingSubtasksPanel(props: {
  parent: WeddingPlanningTaskItem;
  state: WeddingResponseWorkspaceViewState;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: (() => void) | null;
  contactUserId?: string | null;
}) {
  const [title, setTitle] = createSignal("");
  const [savingId, setSavingId] = createSignal<string | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [removedIds, setRemovedIds] = createSignal<Set<string>>(new Set());
  const [added, setAdded] = createSignal<WeddingSubtask[]>([]);
  const [dateOverrides, setDateOverrides] = createSignal<Record<string, string>>({});
  const [confirmRemoveId, setConfirmRemoveId] = createSignal<string | null>(null);
  const weddingPlanId = () => props.state.workspace.metadata.weddingPlanId;
  const workspaceId = () => props.state.workspace.metadata.responseWorkspaceId;
  const subtasks = createMemo(() => [
    ...buildWeddingSubtasks(props.parent, props.state.afpMessages),
    ...added(),
  ].filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
    .filter((item) => !removedIds().has(item.id)));

  async function save(input: SendAfpMessageInput, id: string, success: string): Promise<boolean> {
    if (!props.saveProjection || savingId()) {
      setNotice("This action needs an online Wedding workspace.");
      return false;
    }
    setSavingId(id);
    setNotice(null);
    try {
      await props.saveProjection(input);
      setNotice(success);
      props.onRefreshWorkspace?.();
      return true;
    } catch {
      setNotice("That subtask could not be saved. Please try again.");
      return false;
    } finally {
      setSavingId(null);
    }
  }

  async function addSubtask(): Promise<void> {
    const id = subtaskId(props.parent.id);
    const input = weddingSubtaskCreateInput({
      id,
      parent: props.parent,
      title: title(),
      weddingPlanId: weddingPlanId(),
      responseWorkspaceId: workspaceId(),
    });
    if (!input) {
      setNotice("Enter a subtask of 180 characters or fewer.");
      return;
    }
    if (await save(input, id, "Subtask added.")) {
      setAdded((items) => [...items, {
        id,
        parentTaskId: props.parent.id,
        title: title().trim(),
        kind: props.parent.kind,
        dueAt: props.parent.dueAt ?? null,
        dueLabel: props.parent.dueLabel ?? null,
        priority: props.parent.priority ?? "normal",
        assignee: props.parent.assignee ?? null,
        source: "manual",
        notes: "User-added subtask. It is not researched automatically.",
        metadata: { wedding_subtask: true, parent_task_id: props.parent.id, auto_research_eligible: false },
        removed: false,
        autoResearchEligible: false,
        origin: "user",
      }]);
      setTitle("");
    }
  }

  async function removeSubtask(subtask: WeddingSubtask): Promise<void> {
    if (await save(weddingSubtaskRemoveInput(subtask), subtask.id, "Subtask removed.")) {
      setRemovedIds((ids) => new Set([...ids, subtask.id]));
      setConfirmRemoveId(null);
    }
  }

  async function saveDate(subtask: WeddingSubtask, dueDate: string): Promise<void> {
    const input = weddingTaskDateToAfpSendInput({
      taskId: subtask.id,
      title: subtask.title,
      dueDate,
      weddingPlanId: weddingPlanId(),
      responseWorkspaceId: workspaceId(),
      parentTaskId: subtask.parentTaskId,
    });
    if (!input) return;
    if (await save(input, subtask.id, "Subtask deadline updated.")) {
      setDateOverrides((values) => ({ ...values, [subtask.id]: dueDate }));
    }
  }

  return (
    <section class="mt-4 rounded-xl border border-wedding-border bg-wedding-page p-3" aria-label={`Subtasks for ${props.parent.title}`}>
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p class="text-sm font-semibold text-wedding-ink">Subtasks</p>
          <p class="mt-1 text-xs leading-5 text-wedding-ink/65">Break this down without triggering automatic research. Choose Research only when you want it.</p>
        </div>
        <span class="rounded-full bg-white px-2 py-1 text-xs font-semibold text-wedding-ink">{subtasks().length}</span>
      </div>
      <div class="mt-3 flex flex-col gap-2 sm:flex-row">
        <input value={title()} onInput={(event) => setTitle(event.currentTarget.value)} maxlength={180} placeholder="Add a subtask" class="min-h-11 min-w-0 flex-1 rounded-lg border border-wedding-border bg-white px-3 text-sm" />
        <button type="button" disabled={!title().trim() || Boolean(savingId())} onClick={() => void addSubtask()} class="min-h-11 rounded-lg bg-wedding-primary px-4 text-sm font-semibold text-white disabled:opacity-50">Add subtask</button>
      </div>
      <Show when={notice()}>{(message) => <p class="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-wedding-ink/70" role="status">{message()}</p>}</Show>
      <ul class="mt-3 space-y-3">
        <For each={subtasks()}>{(subtask) => {
          const completed = () => loadWeddingTaskCompletion({ taskId: subtask.id, weddingPlanId: weddingPlanId(), responseWorkspaceId: workspaceId() })?.completed ?? false;
          return (
            <li class="rounded-xl border border-wedding-border bg-white p-3">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2"><p class="break-words text-sm font-semibold text-wedding-ink">{subtask.title}</p><span class="rounded-full bg-wedding-slate px-2 py-1 text-[11px] font-semibold text-wedding-ink">{subtask.origin === "suggested" ? "Suggested" : "Added"}</span></div>
                  <label class="mt-3 block max-w-xs text-xs font-semibold text-wedding-ink">Due date<input type="date" value={dateOverrides()[subtask.id] ?? subtask.dueAt?.slice(0, 10) ?? ""} disabled={savingId() === subtask.id} onChange={(event) => void saveDate(subtask, event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3 text-sm font-normal" /></label>
                </div>
                <div class="grid min-w-0 grid-cols-2 gap-2 sm:w-[15rem]">
                  <WeddingTaskCompletionButton task={subtask} weddingPlanId={weddingPlanId()} responseWorkspaceId={workspaceId()} saveProjection={props.saveProjection} onRefreshWorkspace={props.onRefreshWorkspace} completed={completed()} />
                  <button type="button" disabled={Boolean(savingId())} onClick={() => void save(weddingSubtaskResearchInput(subtask), subtask.id, "Research requested for this subtask.")} class="min-h-11 rounded-lg border border-wedding-primary px-3 text-xs font-semibold text-wedding-primary">Research</button>
                </div>
              </div>
              <WeddingTaskResponsibilityFields task={subtask} state={props.state} saveProjection={props.saveProjection} onRefreshWorkspace={props.onRefreshWorkspace} contactUserId={props.contactUserId} />
              <Show when={confirmRemoveId() === subtask.id} fallback={<button type="button" class="min-h-11 text-xs font-semibold text-rose-800 underline" onClick={() => setConfirmRemoveId(subtask.id)}>Remove subtask</button>}>
                <div class="rounded-lg border border-rose-200 bg-rose-50 p-3"><p class="text-sm font-semibold text-rose-950">Remove this subtask?</p><p class="mt-1 text-xs text-rose-900">Its task history remains in the ledger, but it will no longer appear in this list.</p><div class="mt-3 grid grid-cols-2 gap-2"><button type="button" class="min-h-11 rounded-lg border border-rose-300 bg-white text-sm font-semibold text-rose-950" onClick={() => setConfirmRemoveId(null)}>Cancel</button><button type="button" class="min-h-11 rounded-lg bg-rose-800 text-sm font-semibold text-white" onClick={() => void removeSubtask(subtask)}>Confirm remove</button></div></div>
              </Show>
            </li>
          );
        }}</For>
      </ul>
    </section>
  );
}
