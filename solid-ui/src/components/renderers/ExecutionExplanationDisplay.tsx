// @locs-version: 1.0
import { Show, createMemo } from "solid-js";
import type { WorkflowExecutionExplanationChip } from "@/lib/workflowExecutionExplanationChip";

export type ExecutionExplanationChip = WorkflowExecutionExplanationChip;

const EXECUTION_BADGE_BASE_CLASS = "rounded-full border px-2 py-0.5 text-[10px] font-medium";
const EXECUTION_TEXT_BASE_CLASS = "text-[11px] leading-4 text-on-surface-variant";

export function ExecutionExplanationBadge(props: {
  chip: ExecutionExplanationChip | null | undefined;
  class?: string;
}) {
  const badgeState = createMemo(() => {
    const chip = props.chip;
    return {
      chip,
      showBadge: Boolean(chip),
      className: `${props.class ?? EXECUTION_BADGE_BASE_CLASS} ${chip?.className ?? ""}`.trim(),
      label: chip?.label ?? "",
    };
  });

  return (
    <Show when={badgeState().showBadge}>
      <span class={badgeState().className}>{badgeState().label}</span>
    </Show>
  );
}

export function ExecutionExplanationText(props: {
  text: string | null | undefined;
  hiddenWhen?: string | null | undefined;
  class?: string;
}) {
  const textState = createMemo(() => {
    const text = props.text?.trim() ?? "";
    const hiddenWhen = props.hiddenWhen?.trim() ?? "";
    return {
      text,
      showText: text.length > 0 && hiddenWhen.length === 0,
      className: props.class ?? EXECUTION_TEXT_BASE_CLASS,
    };
  });

  return (
    <Show when={textState().showText}>
      <p class={textState().className}>{textState().text}</p>
    </Show>
  );
}
