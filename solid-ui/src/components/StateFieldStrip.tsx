// @locs-version: 1.0
import { For, Show, createMemo } from "solid-js";
import {
  decisionOsDestinationLabel,
  openDecisionOsStateFieldTarget,
} from "@/lib/decisionosNavigation";
import {
  type DecisionOsStateFieldItem,
} from "@/lib/decisionosContinuity";

const STATE_FIELD_STRIP_SECTION_CLASS =
  "rounded-[24px] border border-slate-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(248,250,252,0.92))] p-3 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.24)]";
const STATE_FIELD_STRIP_HEADER_CLASS = "flex items-center justify-between gap-3";
const STATE_FIELD_STRIP_EYEBROW_CLASS =
  "font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500";
const STATE_FIELD_STRIP_TITLE_CLASS = "mt-1 text-sm font-semibold text-on-surface";
const STATE_FIELD_STRIP_COUNT_CLASS =
  "rounded-full border border-slate-200/80 bg-white/75 px-3 py-1 text-[10px] font-medium text-slate-600";
const STATE_FIELD_CARD_CLASS =
  "rounded-2xl border p-3 text-left transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-black/10";
const ACTIVE_STATE_FIELD_TONE_CLASS =
  "border-emerald-200/80 bg-emerald-50/80 text-emerald-950";
const MONITOR_STATE_FIELD_TONE_CLASS =
  "border-slate-200/80 bg-white/80 text-slate-800";
const STATE_FIELD_STATUS_CLASS =
  "rounded-full border border-current/15 bg-white/70 px-2.5 py-1 text-[10px] font-medium opacity-90";

type StateFieldStripProps = {
  summary: {
    fields: DecisionOsStateFieldItem[];
    count: number;
    hasVisible: boolean;
    leadingField: DecisionOsStateFieldItem | null;
  };
  compact?: boolean;
};

function decisionOsStateFieldStripSummaryForCount(
  count: number,
): {
  eyebrow: string;
  title: string;
  countLabel: string;
} {
  return {
    eyebrow: "State Fields",
    title: "Stable continuity lanes currently active",
    countLabel: `${count} visible lane${count === 1 ? "" : "s"}`,
  };
}

function decisionOsStateFieldStatusLabel(
  field: Pick<DecisionOsStateFieldItem, "status">,
): string {
  return field.status === "active" ? "active" : "monitor";
}

function decisionOsStateFieldToneClass(
  field: Pick<DecisionOsStateFieldItem, "status">,
): string {
  if (field.status === "active") {
    return ACTIVE_STATE_FIELD_TONE_CLASS;
  }
  return MONITOR_STATE_FIELD_TONE_CLASS;
}

function decisionOsStateFieldDestinationView(
  field: Pick<DecisionOsStateFieldItem, "surface_hint">,
): "decision_queue" | "response_queue" | "context_panel" | "home" {
  switch (field.surface_hint) {
    case "decision_queue":
    case "response_queue":
    case "context_panel":
      return field.surface_hint;
    default:
      return "home";
  }
}

export function StateFieldStrip(props: StateFieldStripProps) {
  const summary = () => props.summary;
  const compact = () => props.compact ?? false;
  const stripState = createMemo(() => {
    const stripSummary = decisionOsStateFieldStripSummaryForCount(summary().count);
    const isCompact = compact();
    return {
      eyebrow: stripSummary.eyebrow,
      title: stripSummary.title,
      countLabel: stripSummary.countLabel,
      visibleFieldItems: summary().fields,
      showStrip: summary().count > 0,
      fieldGridClass: `mt-3 grid gap-2 ${isCompact ? "md:grid-cols-2" : "lg:grid-cols-3"}`,
    };
  });

  return (
    <Show when={stripState().showStrip}>
      <section class={STATE_FIELD_STRIP_SECTION_CLASS}>
        <div class={STATE_FIELD_STRIP_HEADER_CLASS}>
          <div>
            <p class={STATE_FIELD_STRIP_EYEBROW_CLASS}>{stripState().eyebrow}</p>
            <h3 class={STATE_FIELD_STRIP_TITLE_CLASS}>{stripState().title}</h3>
          </div>
          <span class={STATE_FIELD_STRIP_COUNT_CLASS}>
            {stripState().countLabel}
          </span>
        </div>

        <div class={stripState().fieldGridClass}>
          <For each={stripState().visibleFieldItems}>
            {(field) => {
              const cardState = {
                label: field.label,
                reason: field.reason,
                recommendedAction: field.recommended_action,
                statusText: decisionOsStateFieldStatusLabel(field),
                toneClass: decisionOsStateFieldToneClass(field),
                destinationText: decisionOsDestinationLabel(
                  decisionOsStateFieldDestinationView(field),
                ),
              };
              const openStateField = () => openDecisionOsStateFieldTarget(field);

              return (
                <button
                  type="button"
                  onClick={openStateField}
                  class={`${STATE_FIELD_CARD_CLASS} ${cardState.toneClass}`}
                >
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="text-sm font-semibold">{cardState.label}</p>
                      <p class="mt-1 text-[11px] leading-5 opacity-80">{cardState.reason}</p>
                    </div>
                    <span class={STATE_FIELD_STATUS_CLASS}>{cardState.statusText}</span>
                  </div>
                  <div class="mt-3 flex items-center justify-between gap-3">
                    <p class="text-[10px] font-medium opacity-80">{cardState.recommendedAction}</p>
                    <span class={STATE_FIELD_STATUS_CLASS}>{cardState.destinationText}</span>
                  </div>
                </button>
              );
            }}
          </For>
        </div>
      </section>
    </Show>
  );
}
