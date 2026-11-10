import { createEffect, createSignal, on, onCleanup, onMount, Show } from "solid-js";

import { readSession, type SendAfpMessageInput } from "@/lib/api";
import { WeddingTaskOwnerPicker } from "@/components/WeddingTaskOwnerPicker";
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
import { runWeddingTaskAssignment } from "@/lib/weddingTaskAssignmentExecutionState";

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
  createEffect(on(
    () => `${props.responseWorkspaceId}:${props.task.id}:${props.task.assignee ?? ""}`,
    () => setDraft(savedOwner()),
  ));

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
    const contact = loadContacts(props.contactUserId ?? readSession()?.user?.id ?? null).find(
      (item) => item.name.trim().toLowerCase() === ownerLabel.toLowerCase(),
    );
    const result = await runWeddingTaskAssignment({
      saveProjection: async (projection) => props.saveProjection!(projection),
      projection: input,
      weddingPlanId: props.weddingPlanId ?? "",
      responseWorkspaceId: props.responseWorkspaceId,
      task: props.task,
      assignee: ownerLabel,
      assigneeEmail: ownerLabel === "You" ? "" : contact?.email?.trim() ?? "",
    });
    setNotice(result.notice);
    setSaving(false);
  }

  return (
    <div class="flex min-w-[11rem] items-end sm:min-h-16" aria-label={`Owner for ${props.task.title}`}>
      <div class="flex w-full min-w-0 items-end gap-1.5">
        <label class="min-w-0 flex-1 text-xs font-semibold text-wedding-ink/70">
          Owner
          <div class="mt-1"><WeddingTaskOwnerPicker compact value={draft()} onChange={(value) => { setDraft(value); setNotice(null); }} people={props.people} weddingPlanId={props.weddingPlanId ?? ""} responseWorkspaceId={props.responseWorkspaceId} contactUserId={props.contactUserId} saveProjection={props.saveProjection} /></div>
        </label>
        <button type="button" disabled={!draft().trim() || saving()} class="min-h-11 rounded-lg border border-wedding-secondary bg-white px-3 text-xs font-semibold text-wedding-secondary disabled:opacity-45" onClick={() => void saveOwner()}>
          {saving() ? "Saving" : "Assign"}
        </button>
      </div>
      <Show when={notice()}>{(message) => <p class="sr-only" role="status">{message()}</p>}</Show>
    </div>
  );
}
