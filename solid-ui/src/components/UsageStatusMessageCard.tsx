// @locs-version: 1.0
export type UsageStatusMessageCardProps = {
  tone: "warning" | "danger" | "info";
  title?: string;
  summary: string;
  detail?: string | null;
};

export default function UsageStatusMessageCard(props: UsageStatusMessageCardProps) {
  const toneClass = () => {
    if (props.tone === "danger") return "border-red-200/60 bg-red-50/80 text-red-700";
    if (props.tone === "info") return "border-sky-300/40 bg-sky-50/60 text-on-surface-variant";
    return "border-amber-300/40 bg-amber-50/60 text-on-surface-variant";
  };

  return (
    <div class={`mt-4 rounded-2xl border p-4 text-sm ${toneClass()}`}>
      {props.title ? <p class="font-semibold">{props.title}</p> : null}
      <p class={props.title ? "mt-1" : undefined}>{props.summary}</p>
      {props.detail ? <p class="mt-1 text-xs opacity-80">{props.detail}</p> : null}
    </div>
  );
}
