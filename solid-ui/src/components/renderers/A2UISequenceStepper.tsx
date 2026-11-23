// @locs-version: 1.0
import { createMemo, For, Show } from "solid-js";

export type SequenceStepItem = {
  number: number;
  title: string;
  subtitle?: string;
  body: string;
  status: "complete" | "active" | "pending";
};

type SequenceStepperProps = {
  title?: string;
  eyebrow?: string;
  description?: string;
  steps: SequenceStepItem[];
};

type SequenceHeaderState = {
  eyebrow: string;
  showEyebrow: boolean;
  title: string;
  showTitle: boolean;
  description: string;
  showDescription: boolean;
};

type SequenceStepViewItem = {
  number: number;
  title: string;
  subtitle: string;
  showSubtitle: boolean;
  body: string;
  markerClass: string;
  connectorClass: string;
  cardClass: string;
  showConnector: boolean;
};

type SequenceStepperState = {
  header: SequenceHeaderState;
  steps: SequenceStepViewItem[];
};

const COMPLETE_MARKER_CLASS =
  "border-emerald-300/60 bg-emerald-400/15 text-emerald-100 shadow-[0_0_0_6px_rgba(16,185,129,0.08)]";
const ACTIVE_MARKER_CLASS =
  "border-sky-300/60 bg-sky-400/15 text-sky-100 shadow-[0_0_0_6px_rgba(56,189,248,0.08)]";
const DEFAULT_MARKER_CLASS = "border-white/20 bg-white/8 text-on-surface";

const COMPLETE_CONNECTOR_CLASS = "bg-emerald-300/70";
const ACTIVE_CONNECTOR_CLASS = "bg-sky-300/70";
const DEFAULT_CONNECTOR_CLASS = "bg-white/10";

const COMPLETE_CARD_CLASS = "border-emerald-300/20 bg-emerald-400/6";
const ACTIVE_CARD_CLASS = "border-sky-300/20 bg-sky-400/6";
const DEFAULT_CARD_CLASS = "border-white/12 bg-white/5";

function markerClass(status: SequenceStepItem["status"]): string {
  switch (status) {
    case "complete":
      return COMPLETE_MARKER_CLASS;
    case "active":
      return ACTIVE_MARKER_CLASS;
    default:
      return DEFAULT_MARKER_CLASS;
  }
}

function connectorClass(status: SequenceStepItem["status"]): string {
  switch (status) {
    case "complete":
      return COMPLETE_CONNECTOR_CLASS;
    case "active":
      return ACTIVE_CONNECTOR_CLASS;
    default:
      return DEFAULT_CONNECTOR_CLASS;
  }
}

function stepCardClass(status: SequenceStepItem["status"]): string {
  switch (status) {
    case "complete":
      return COMPLETE_CARD_CLASS;
    case "active":
      return ACTIVE_CARD_CLASS;
    default:
      return DEFAULT_CARD_CLASS;
  }
}

function headerState(props: SequenceStepperProps): SequenceHeaderState {
  const eyebrow = props.eyebrow ?? "";
  const title = props.title ?? "";
  const description = props.description ?? "";
  return {
    eyebrow,
    showEyebrow: Boolean(eyebrow),
    title,
    showTitle: Boolean(title),
    description,
    showDescription: Boolean(description),
  };
}

function stepViewItems(steps: SequenceStepItem[]): SequenceStepViewItem[] {
  return steps.map((step, index) => {
    const subtitle = step.subtitle ?? "";
    return {
      number: step.number,
      title: step.title,
      subtitle,
      showSubtitle: Boolean(subtitle),
      body: step.body,
      markerClass: markerClass(step.status),
      connectorClass: connectorClass(step.status),
      cardClass: stepCardClass(step.status),
      showConnector: index < steps.length - 1,
    };
  });
}

function sequenceStepperState(props: SequenceStepperProps): SequenceStepperState {
  return {
    header: headerState(props),
    steps: stepViewItems(props.steps),
  };
}

export function A2UISequenceStepper(props: SequenceStepperProps) {
  const viewState = createMemo(() => sequenceStepperState(props));

  return (
    <div class="space-y-4">
      <Show when={viewState().header.showEyebrow}>
        <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-on-surface-variant/70">
          {viewState().header.eyebrow}
        </p>
      </Show>
      <Show when={viewState().header.showTitle}>
        <h3 class="text-base font-semibold text-on-surface">{viewState().header.title}</h3>
      </Show>
      <Show when={viewState().header.showDescription}>
        <p class="max-w-3xl text-sm leading-6 text-on-surface-variant">
          {viewState().header.description}
        </p>
      </Show>

      <div class="flex flex-col gap-3 md:flex-row md:items-stretch md:overflow-x-auto md:pb-1">
        <For each={viewState().steps}>
          {(step) => (
            <div class="flex items-start gap-3 md:min-w-[16rem] md:flex-1 md:flex-col md:gap-4">
              <div class="relative flex shrink-0 items-center md:w-full">
                <div
                  class={`relative z-10 flex h-11 w-11 items-center justify-center rounded-2xl border text-sm font-semibold ${step.markerClass}`}
                >
                  {step.number}
                </div>
                <Show when={step.showConnector}>
                  <div class="ml-3 h-10 w-px overflow-hidden rounded-full bg-white/8 md:absolute md:left-[calc(50%+1.75rem)] md:right-[-0.75rem] md:top-1/2 md:ml-0 md:h-px md:w-auto md:-translate-y-1/2">
                    <div class={`h-full w-full ${step.connectorClass}`} />
                  </div>
                </Show>
              </div>

              <article
                class={`min-w-0 flex-1 rounded-[1.35rem] border p-4 shadow-[0_10px_30px_rgba(15,23,42,0.08)] ${step.cardClass}`}
              >
                <Show when={step.showSubtitle}>
                  <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/65">
                    {step.subtitle}
                  </p>
                </Show>
                <h4 class="mt-1 text-sm font-semibold leading-5 text-on-surface">{step.title}</h4>
                <p class="mt-2 text-sm leading-6 text-on-surface-variant">{step.body}</p>
              </article>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
