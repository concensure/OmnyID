// @locs-version: 1.0
type CognitiveBentoRowProps = {
  completedToday: number;
  timeSavedMinutes: number;
  visibleCount: number;
  totalMinutes: number;
  positiveOutcomeRate: number | null;
};

export function CognitiveBentoRow(props: CognitiveBentoRowProps) {
  const overloaded = () => props.totalMinutes > 60;
  const loadColor = () => overloaded() ? "text-rose-600" : props.totalMinutes > 35 ? "text-amber-600" : "text-emerald-600";
  const loadLabel = () => overloaded() ? "Heavy" : props.totalMinutes > 35 ? "Moderate" : "Light";

  const metricCell = (label: string, value: string, sub: string, color: string) => (
    <div class="flex flex-col justify-center gap-0.5 rounded-xl border border-white/60 bg-white/50 px-3 py-2.5 min-w-0">
      <span class="font-mono text-[9px] uppercase tracking-[0.15em] text-on-surface-variant/50 truncate">{label}</span>
      <span class={`text-lg font-bold leading-tight ${color}`}>{value}</span>
      <span class="text-[9px] text-on-surface-variant/50 truncate">{sub}</span>
    </div>
  );

  return (
    <div class="grid grid-cols-4 gap-2">
      {metricCell("Done today", String(props.completedToday), "decisions", "text-emerald-600")}
      {metricCell("Time saved", `${props.timeSavedMinutes}m`, "reclaimed", "text-primary")}
      {metricCell("Queue load", loadLabel(), `~${props.totalMinutes} min`, loadColor())}
      {props.positiveOutcomeRate !== null
        ? metricCell("Outcome rate", `${Math.round(props.positiveOutcomeRate * 100)}%`, "positive this week", props.positiveOutcomeRate >= 0.65 ? "text-emerald-600" : "text-amber-600")
        : metricCell("Pending", String(props.visibleCount), "to review", "text-on-surface-variant")}
    </div>
  );
}
