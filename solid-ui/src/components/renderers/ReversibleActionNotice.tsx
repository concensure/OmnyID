// @locs-version: 1.0
import { Show, createMemo } from "solid-js";

type ReversibleNoticeTone = "applied" | "rejected" | "neutral" | "primary";

const REVERSIBLE_NOTICE_TONES: Record<
  ReversibleNoticeTone,
  { container: string; dot: string; action: string }
> = {
  applied: {
    container: "border-emerald-400/30 bg-emerald-400/8 text-emerald-300",
    dot: "bg-emerald-400",
    action: "bg-emerald-400/15 text-emerald-200",
  },
  rejected: {
    container: "border-slate-400/30 bg-slate-400/8 text-slate-300",
    dot: "bg-slate-400",
    action: "bg-white/10 text-on-surface",
  },
  neutral: {
    container: "border-slate-400/30 bg-slate-400/8 text-slate-300",
    dot: "bg-slate-400",
    action: "bg-white/10 text-on-surface",
  },
  primary: {
    container: "border-primary/30 bg-primary/8 text-primary",
    dot: "bg-primary",
    action: "bg-primary/10 text-primary",
  },
};

const REVERSIBLE_NOTICE_BASE_CLASS = "space-y-1 rounded-xl border px-4 py-3 text-sm font-medium";
const REVERSIBLE_NOTICE_ACTION_BASE_CLASS =
  "rounded-full px-3 py-0.5 text-xs font-medium transition hover:opacity-80";

export function ReversibleActionNotice(props: {
  status: "applied" | "rejected";
  summary: string;
  detail?: string | null;
  class?: string;
  detailClass?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionClass?: string;
  tone?: "applied" | "rejected" | "neutral" | "primary";
}) {
  const noticeState = createMemo(() => {
    const tone: ReversibleNoticeTone = props.tone ?? props.status;
    const toneStyles = REVERSIBLE_NOTICE_TONES[tone];
    const detailText = props.detail?.trim() ?? "";
    const actionLabel = props.actionLabel?.trim() ?? "";
    const showAction = actionLabel.length > 0 && Boolean(props.onAction);

    return {
      summary: props.summary,
      detailText,
      showDetail: detailText.length > 0,
      containerClass: `${REVERSIBLE_NOTICE_BASE_CLASS} ${toneStyles.container} ${props.class ?? ""}`.trim(),
      dotClass: toneStyles.dot,
      actionLabel,
      showAction,
      actionClass: `${REVERSIBLE_NOTICE_ACTION_BASE_CLASS} ${props.actionClass ?? toneStyles.action}`.trim(),
      detailClass: `pl-4 text-xs font-normal opacity-80 ${props.detailClass ?? ""}`.trim(),
      onAction: props.onAction,
    };
  });

  return (
    <div class={noticeState().containerClass}>
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <span class={`h-2 w-2 rounded-full ${noticeState().dotClass}`} />
          <span>{noticeState().summary}</span>
        </div>
        <Show when={noticeState().showAction}>
          <button
            type="button"
            onClick={() => noticeState().onAction?.()}
            class={noticeState().actionClass}
          >
            {noticeState().actionLabel}
          </button>
        </Show>
      </div>
      <Show when={noticeState().showDetail}>
        <p class={noticeState().detailClass}>{noticeState().detailText}</p>
      </Show>
    </div>
  );
}
