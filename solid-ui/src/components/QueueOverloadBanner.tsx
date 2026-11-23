// @locs-version: 1.0
import { For, Show } from "solid-js";

const QUEUE_OVERLOAD_ACTION_CLASS =
  "rounded-full border border-amber-300/60 bg-amber-100/80 px-3 py-1 text-[10px] font-medium text-amber-800 transition hover:bg-amber-100";
const AUTO_TRIAGE_ACTION_CLASS =
  "rounded-full border border-indigo-300/60 bg-indigo-50/80 px-3 py-1 text-[10px] font-medium text-indigo-700 transition hover:bg-indigo-100/80";
const AUTO_TRIAGE_TITLE =
  "Ask the agent to sort and prioritise the queue - removes the need to decide what to decide";
const QUEUE_OVERLOAD_BANNER_CLASS =
  "flex items-start gap-3 rounded-2xl border border-amber-200/60 bg-amber-50/70 px-4 py-3 backdrop-blur-sm";
const QUEUE_OVERLOAD_ICON_CLASS = "mt-0.5 flex-shrink-0 text-lg leading-none";
const QUEUE_OVERLOAD_CONTENT_CLASS = "min-w-0 flex-1";
const QUEUE_OVERLOAD_SUMMARY_CLASS = "text-xs font-semibold text-amber-800";
const QUEUE_OVERLOAD_DETAIL_CLASS = "mt-0.5 text-[11px] text-amber-700/80";
const QUEUE_OVERLOAD_ACTION_ROW_CLASS = "mt-2 flex flex-wrap gap-2";
const FILTER_BY_MOOD_LABEL = "Filter by mood";
const DISMISS_LOW_IMPACT_LABEL = "Dismiss low-impact";
const AUTO_TRIAGE_LABEL = "Auto-triage";
const QUEUE_OVERLOAD_DETAIL_TEXT =
  "Set your mood to filter quick wins, or dismiss low-impact items to reduce load.";

export function QueueOverloadBanner(props: {
  totalMinutes: number;
  count: number;
  onFilterMood: () => void;
  onDismissLow: () => void;
  onAutoTriage?: () => void;
}) {
  const totalMinutes = () => props.totalMinutes;
  const count = () => props.count;
  const onFilterMood = () => props.onFilterMood;
  const onDismissLow = () => props.onDismissLow;
  const onAutoTriage = () => props.onAutoTriage;
  const bannerState = () => {
    const totalDecisionMinutes = totalMinutes();
    const decisionCount = count();
    const autoTriageAction = onAutoTriage();
    const items = [
      {
        key: "filter_mood",
        label: FILTER_BY_MOOD_LABEL,
        className: QUEUE_OVERLOAD_ACTION_CLASS,
        onClick: onFilterMood(),
        title: undefined as string | undefined,
      },
      {
        key: "dismiss_low",
        label: DISMISS_LOW_IMPACT_LABEL,
        className: QUEUE_OVERLOAD_ACTION_CLASS,
        onClick: onDismissLow(),
        title: undefined as string | undefined,
      },
    ];
    if (autoTriageAction) {
      items.push({
        key: "auto_triage",
        label: AUTO_TRIAGE_LABEL,
        className: AUTO_TRIAGE_ACTION_CLASS,
        onClick: autoTriageAction,
        title: AUTO_TRIAGE_TITLE,
      });
    }
    return {
      showBanner: decisionCount > 5 || totalDecisionMinutes > 60,
      summaryText: `Heavy queue - ${decisionCount} decisions - ~${totalDecisionMinutes} min total`,
      actionItems: items,
    };
  };

  return (
    <Show when={bannerState().showBanner}>
      <div class={QUEUE_OVERLOAD_BANNER_CLASS}>
        <span class={QUEUE_OVERLOAD_ICON_CLASS}>!</span>
        <div class={QUEUE_OVERLOAD_CONTENT_CLASS}>
          <p class={QUEUE_OVERLOAD_SUMMARY_CLASS}>
            {bannerState().summaryText}
          </p>
          <p class={QUEUE_OVERLOAD_DETAIL_CLASS}>
            {QUEUE_OVERLOAD_DETAIL_TEXT}
          </p>
          <div class={QUEUE_OVERLOAD_ACTION_ROW_CLASS}>
            <For each={bannerState().actionItems}>
              {(item) => (
                <button
                  type="button"
                  class={item.className}
                  onClick={item.onClick}
                  title={item.title}
                >
                  {item.label}
                </button>
              )}
            </For>
          </div>
        </div>
      </div>
    </Show>
  );
}
