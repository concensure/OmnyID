import { createEffect, createSignal, onCleanup, onMount } from "solid-js";

import type { SendAfpMessageInput } from "@/lib/api";
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import {
  loadWeddingTaskCompletion,
  saveWeddingTaskCompletion,
  WEDDING_TASK_COMPLETION_EVENT,
  type WeddingTaskCompletionRecord,
} from "@/lib/weddingTaskCompletionLocalState";
import { weddingTaskCompletionToAfpSendInput } from "@/lib/weddingTaskCompletionProjectionState";

export function WeddingTaskCompletionButton(props: {
  task: WeddingPlanningTaskItem;
  weddingPlanId: string;
  responseWorkspaceId: string;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: (() => void) | null;
  compact?: boolean;
}) {
  const projectedDone = () => /done|complete|accepted/i.test(`${props.task.reviewStatus ?? ""} ${props.task.approvalState ?? ""}`);
  const read = () => loadWeddingTaskCompletion({ taskId: props.task.id, weddingPlanId: props.weddingPlanId, responseWorkspaceId: props.responseWorkspaceId });
  const [done, setDone] = createSignal(read()?.completed ?? projectedDone());
  const [busy, setBusy] = createSignal(false);
  createEffect(() => { props.task.id; setDone(read()?.completed ?? projectedDone()); });
  onMount(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<WeddingTaskCompletionRecord>).detail;
      if (detail?.taskId === props.task.id && detail.weddingPlanId === props.weddingPlanId && detail.responseWorkspaceId === props.responseWorkspaceId) setDone(detail.completed);
    };
    window.addEventListener(WEDDING_TASK_COMPLETION_EVENT, listener);
    onCleanup(() => window.removeEventListener(WEDDING_TASK_COMPLETION_EVENT, listener));
  });
  async function toggle(): Promise<void> {
    const record = saveWeddingTaskCompletion({ taskId: props.task.id, weddingPlanId: props.weddingPlanId, responseWorkspaceId: props.responseWorkspaceId, completed: !done() });
    if (!record) return;
    setDone(record.completed);
    const input = weddingTaskCompletionToAfpSendInput({ record, title: props.task.title });
    if (!input || !props.saveProjection) return;
    setBusy(true);
    try { await props.saveProjection(input); } finally { setBusy(false); }
  }
  return <button type="button" aria-pressed={done()} disabled={busy()} onClick={() => void toggle()} class={`${props.compact ? "min-h-10 px-3 text-xs" : "min-h-11 px-4 text-sm"} shrink-0 rounded-lg border border-wedding-secondary bg-white font-semibold text-wedding-secondary disabled:opacity-50`}>{done() ? "Move back to to-do" : "Mark done"}</button>;
}
