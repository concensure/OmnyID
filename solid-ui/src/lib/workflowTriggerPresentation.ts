// @locs-version: 1.0
export function triggerFamilyFromKind(
  triggerKind: string,
): "manual" | "schedule" | "event" | "hybrid" | "delayed_continuation" | "replay" {
  if (triggerKind === "replay") return "replay";
  if (triggerKind === "manual" || triggerKind === "dry_run") return "manual";
  if (triggerKind === "cron" || triggerKind === "once" || triggerKind === "schedule") return "schedule";
  if (triggerKind === "delay_until" || triggerKind === "delay_for" || triggerKind === "wake_request") return "delayed_continuation";
  if (triggerKind === "schedule_plus_condition" || triggerKind === "event_then_delay" || triggerKind === "event_plus_approval_plus_time" || triggerKind === "hybrid") return "hybrid";
  return "event";
}

export function triggerProvenanceChipClass(
  family: ReturnType<typeof triggerFamilyFromKind>,
): string {
  if (family === "schedule") return "border-teal-200/80 bg-teal-50/90 text-teal-700";
  if (family === "event") return "border-sky-200/80 bg-sky-50/90 text-sky-700";
  if (family === "hybrid") return "border-violet-200/80 bg-violet-50/90 text-violet-700";
  if (family === "delayed_continuation") return "border-indigo-200/80 bg-indigo-50/90 text-indigo-700";
  if (family === "replay") return "border-slate-200/80 bg-slate-50/90 text-slate-600";
  return "border-slate-200/70 bg-slate-50/90 text-slate-700";
}
