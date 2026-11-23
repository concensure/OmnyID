// @locs-version: 1.0
import { For, Show } from "solid-js";
import type { DecisionWhyBullet } from "@/lib/decisionOsContinuityDecisionBuilders";

const CONTEXT_PANEL_EMPTY_STATE_CLASS =
  "flex flex-1 flex-col items-center justify-center px-6 py-10 text-center";
const CONTEXT_PANEL_EMPTY_STATE_ICON_CLASS = "mb-2 text-4xl";
const CONTEXT_PANEL_EMPTY_STATE_TITLE_CLASS = "text-sm font-medium text-on-surface";
const CONTEXT_PANEL_EMPTY_STATE_DETAIL_CLASS =
  "text-xs leading-relaxed text-on-surface-variant/60";
const CONTEXT_PANEL_EMPTY_STATE_HINT_CLASS = "mt-2 text-[9px] text-on-surface-variant/30";
const WHY_MATTERS_FALLBACK_TEXT_CLASS =
  "mt-2 text-[11px] font-medium leading-relaxed text-on-surface";
const WHY_MATTERS_LIST_CLASS = "mt-2 space-y-1";
const WHY_MATTERS_ITEM_CLASS = "flex items-start gap-1.5 text-[11px] leading-relaxed text-on-surface";
const DECISION_WHY_ICON_LABEL = {
  "!": "!",
  "-": "\u2022",
  "*": "\u2726",
  "#": "#",
  "->": "\u2192",
  P: "\u2316",
} as const;

function humanizeDecisionWhyIcon(icon?: string): string | null {
  const normalizedIcon = (icon ?? "").trim();
  const mappedIcon =
    DECISION_WHY_ICON_LABEL[normalizedIcon as keyof typeof DECISION_WHY_ICON_LABEL];
  return mappedIcon ?? (normalizedIcon || null);
}

export function ContextPanelEmptyState(props: {
  icon: string;
  title: string;
  detail: string;
  hint?: string;
}) {
  const iconText = () => props.icon;
  const titleText = () => props.title;
  const detailText = () => props.detail;
  const hintText = () => props.hint ?? null;
  const showHint = () => Boolean(hintText());

  return (
    <div class={CONTEXT_PANEL_EMPTY_STATE_CLASS}>
      <span class={CONTEXT_PANEL_EMPTY_STATE_ICON_CLASS}>{iconText()}</span>
      <p class={CONTEXT_PANEL_EMPTY_STATE_TITLE_CLASS}>{titleText()}</p>
      <p class={CONTEXT_PANEL_EMPTY_STATE_DETAIL_CLASS}>{detailText()}</p>
      <Show when={showHint()}>
        <p class={CONTEXT_PANEL_EMPTY_STATE_HINT_CLASS}>{hintText()}</p>
      </Show>
    </div>
  );
}

export function WhyMattersSection(props: {
  bullets?: DecisionWhyBullet[] | null;
  fallbackText?: string | null;
  accent?: "primary" | "surface";
  title?: string;
}) {
  const accent = () => props.accent ?? "primary";
  const isPrimaryAccent = () => accent() === "primary";
  const sectionClass = () =>
    `rounded-xl px-3 py-2.5 ${
      isPrimaryAccent()
        ? "border border-primary/20 bg-primary/[0.05]"
        : "border border-black/[0.06] bg-white/70"
    }`;
  const sectionHeadingClass = () =>
    `font-mono text-[8px] uppercase tracking-[0.15em] ${
      isPrimaryAccent() ? "text-primary/60" : "text-on-surface-variant/50"
    }`;
  const bulletIconClass = () =>
    `mt-0.5 inline-flex h-4 min-w-4 flex-shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold ${
      isPrimaryAccent()
        ? "border-primary/20 bg-white/70 text-primary/80"
        : "border-black/10 bg-black/[0.03] text-on-surface-variant/70"
    }`;
  const sectionState = () => {
    const bulletItems = props.bullets ?? [];
    const fallbackText = props.fallbackText ?? null;
    return {
      titleText: props.title ?? "Why this matters",
      bulletViewItems: bulletItems.map((bullet) => {
        const iconText = humanizeDecisionWhyIcon(bullet.icon);
        return {
          text: bullet.text,
          iconText,
          showIcon: Boolean(iconText),
        };
      }),
      showSection: bulletItems.length > 0 || Boolean(fallbackText),
      showBulletList: bulletItems.length > 0,
      showFallbackText: bulletItems.length === 0 && Boolean(fallbackText),
      fallbackText,
    };
  };

  return (
    <Show when={sectionState().showSection}>
      <div class={sectionClass()}>
        <p class={sectionHeadingClass()}>
          {sectionState().titleText}
        </p>
        <Show when={sectionState().showBulletList}>
          <ul class={WHY_MATTERS_LIST_CLASS}>
            <For each={sectionState().bulletViewItems}>
              {(bullet) => (
                <li class={WHY_MATTERS_ITEM_CLASS}>
                  <Show when={bullet.showIcon}>
                    <span class={bulletIconClass()}>
                      {bullet.iconText}
                    </span>
                  </Show>
                  <span>{bullet.text}</span>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show when={sectionState().showFallbackText}>
          <p class={WHY_MATTERS_FALLBACK_TEXT_CLASS}>{sectionState().fallbackText}</p>
        </Show>
      </div>
    </Show>
  );
}
