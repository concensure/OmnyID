import { createEffect, createMemo, createSignal, createUniqueId, For, onCleanup, onMount, Show } from "solid-js";

import { readSession, type SendAfpMessageInput } from "@/lib/api";
import { loadContacts } from "@/lib/contactsLocalState";
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import {
  dispatchWeddingTaskResponsibilityChange,
  loadWeddingHelperLocalState,
  saveWeddingHelperLocalState,
  WEDDING_TASK_RESPONSIBILITY_EVENT,
  weddingHelperResponsibilityToAfpSendInput,
  type WeddingTaskResponsibilityChange,
} from "@/lib/weddingHelpersPanelState";

export function WeddingTaskOwnerControl(props: {
  task: WeddingPlanningTaskItem;
  responseWorkspaceId: string;
  weddingPlanId?: string | null;
  people?: readonly string[] | null;
  contactUserId?: string | null;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown> | unknown) | null;
  onRefreshWorkspace?: (() => void) | null;
}) {
  const savedOwner = () => loadWeddingHelperLocalState(props.responseWorkspaceId).taskAssignees[props.task.id]
    ?? props.task.assignee?.trim()
    ?? "You";
  const [draft, setDraft] = createSignal(savedOwner());
  const [saving, setSaving] = createSignal(false);
  const [notice, setNotice] = createSignal<string | null>(null);
  const controlId = createUniqueId();
  const listId = () => `wedding-owner-${controlId}`;
  const people = createMemo(() => {
    const local = loadWeddingHelperLocalState(props.responseWorkspaceId);
    const contacts = loadContacts(props.contactUserId ?? readSession()?.user?.id ?? null).map((contact) => contact.name);
    return [...new Set(["You", ...(props.people ?? []), ...local.customHelpers, ...contacts]
      .map((name) => name.trim()).filter(Boolean))];
  });
  createEffect(() => {
    props.task.assignee;
    props.responseWorkspaceId;
    setDraft(savedOwner());
  });

  onMount(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<WeddingTaskResponsibilityChange>).detail;
      if (detail?.workspaceId === props.responseWorkspaceId && detail.taskId === props.task.id) setDraft(detail.ownerLabel);
    };
    window.addEventListener(WEDDING_TASK_RESPONSIBILITY_EVENT, listener);
    onCleanup(() => window.removeEventListener(WEDDING_TASK_RESPONSIBILITY_EVENT, listener));
  });

  async function saveOwner(): Promise<void> {
    const ownerLabel = draft().trim();
    if (!ownerLabel || saving()) return;
    const current = loadWeddingHelperLocalState(props.responseWorkspaceId);
    saveWeddingHelperLocalState(props.responseWorkspaceId, {
      ...current,
      taskAssignees: { ...current.taskAssignees, [props.task.id]: ownerLabel },
      customHelpers: ownerLabel === "You" ? current.customHelpers : [...new Set([...current.customHelpers, ownerLabel])],
    });
    dispatchWeddingTaskResponsibilityChange({ workspaceId: props.responseWorkspaceId, taskId: props.task.id, ownerLabel });
    const input = weddingHelperResponsibilityToAfpSendInput({
      task: props.task,
      metadata: { wedding_plan_id: props.weddingPlanId, response_workspace_id: props.responseWorkspaceId },
      ownerLabel,
      consultedLabel: current.taskConsultedPeople[props.task.id],
      lastContactDate: current.taskLastContactDates[props.task.id],
      status: "open",
    });
    if (!input || !props.saveProjection) {
      setNotice("Owner saved on this device.");
      return;
    }
    setSaving(true);
    try {
      await props.saveProjection(input);
      setNotice(`${ownerLabel} is assigned.`);
      props.onRefreshWorkspace?.();
    } catch {
      setNotice("Owner saved here. Account sync will retry when available.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="min-w-[11rem]" aria-label={`Owner for ${props.task.title}`}>
      <div class="flex min-w-0 items-end gap-1.5">
        <label class="min-w-0 flex-1 text-xs font-semibold text-wedding-ink/70">
          Owner
          <input
            type="text"
            list={listId()}
            value={draft()}
            onInput={(event) => { setDraft(event.currentTarget.value); setNotice(null); }}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveOwner(); } }}
            class="mt-1 min-h-10 w-full rounded-lg border border-wedding-border bg-white px-2 text-sm font-normal text-wedding-ink"
          />
          <datalist id={listId()}><For each={people()}>{(person) => <option value={person} />}</For></datalist>
        </label>
        <button type="button" disabled={!draft().trim() || saving()} class="min-h-10 rounded-lg border border-wedding-secondary bg-white px-3 text-xs font-semibold text-wedding-secondary disabled:opacity-45" onClick={() => void saveOwner()}>
          {saving() ? "Saving" : "Assign"}
        </button>
      </div>
      <Show when={notice()}>{(message) => <p class="sr-only" role="status">{message()}</p>}</Show>
    </div>
  );
}
