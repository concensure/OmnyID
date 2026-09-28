// @locs-version: 1.0
export type WorkflowTimelineTriggerFamily =
  | "manual"
  | "schedule"
  | "event"
  | "hybrid"
  | "delayed_continuation"
  | "replay";

export function workflowTimelineTriggerFamily(triggerKind: string): WorkflowTimelineTriggerFamily {
  if (triggerKind === "manual") return "manual";
  if (triggerKind === "replay") return "replay";
  if (triggerKind.startsWith("schedule")) return "schedule";
  if (triggerKind.startsWith("event")) return "event";
  if (triggerKind.startsWith("wait_resume") || triggerKind.startsWith("continuation")) {
    return "delayed_continuation";
  }
  return "hybrid";
}

export function workflowTimelineTriggerChipClass(family: WorkflowTimelineTriggerFamily): string {
  switch (family) {
    case "manual":
      return "border-slate-200/70 bg-slate-50/90 text-slate-700";
    case "schedule":
      return "border-sky-200/70 bg-sky-50/80 text-sky-700";
    case "event":
      return "border-emerald-200/70 bg-emerald-50/80 text-emerald-700";
    case "delayed_continuation":
      return "border-amber-200/70 bg-amber-50/80 text-amber-700";
    case "replay":
      return "border-indigo-200/70 bg-indigo-50/80 text-indigo-700";
    default:
      return "border-violet-200/70 bg-violet-50/80 text-violet-700";
  }
}

export function workflowTimelineTriggerChipShellClass(
  family: WorkflowTimelineTriggerFamily,
): string {
  return `rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${workflowTimelineTriggerChipClass(
    family,
  )}`;
}

export function workflowTimelineTriggerLabel(triggerKind: string): string {
  const family = workflowTimelineTriggerFamily(triggerKind);
  return family === "manual" || family === "replay"
    ? triggerKind
    : `${family} / ${triggerKind}`;
}

export function workflowTimelineTriggerTitle(triggerKind: string): string {
  const family = workflowTimelineTriggerFamily(triggerKind);
  return `Activated by ${family} trigger (kind: ${triggerKind})`;
}

export function workflowTimelineTriggerChipPresentation(
  triggerKind: string,
): { className: string; label: string; title: string } {
  const family = workflowTimelineTriggerFamily(triggerKind);
  return {
    className: workflowTimelineTriggerChipShellClass(family),
    label: workflowTimelineTriggerLabel(triggerKind),
    title: workflowTimelineTriggerTitle(triggerKind),
  };
}

export function workflowTimelineTriggerChipPresentationClassDisplayValue(
  presentation: { className: string; label: string; title: string },
): string {
  return presentation.className;
}

export function workflowTimelineTriggerChipPresentationTitleDisplayValue(
  presentation: { className: string; label: string; title: string },
): string {
  return presentation.title;
}

export function workflowTimelineTriggerChipPresentationLabelDisplayValue(
  presentation: { className: string; label: string; title: string },
): string {
  return presentation.label;
}

export function workflowTimelineTriggerChipDisplayLabel(label: string): string {
  return label;
}

export function workflowTimelineTriggerChipDisplayTitle(title: string): string {
  return title;
}

export function workflowTimelineTriggerChipDisplayClass(className: string): string {
  return className;
}

export function workflowTimelineRuntimeTriggerKindDisplayValue(
  triggerKind: string | null | undefined,
): string | null | undefined {
  return triggerKind;
}

export function workflowTimelineRuntimeTriggerKindInputDisplayValue(
  triggerKind: string | null | undefined,
): string | null | undefined {
  return triggerKind;
}

export function workflowTimelineOptionalTriggerChipDisplayValue(
  presentation: { className: string; label: string; title: string } | null,
): { className: string; label: string; title: string } | null {
  return presentation;
}

export function workflowTimelineTriggerChipInputDisplayValue(
  presentation: { className: string; label: string; title: string } | null,
): { className: string; label: string; title: string } | null {
  return presentation;
}

export function workflowTimelineOptionalTriggerChipPresentation(
  triggerKind: string | null | undefined,
): { className: string; label: string; title: string } | null {
  if (!triggerKind) {
    return null;
  }
  return workflowTimelineTriggerChipPresentation(triggerKind);
}
