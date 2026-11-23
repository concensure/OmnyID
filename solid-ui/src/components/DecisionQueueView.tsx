import { RunbookPanel } from "./RunbookPanel";
﻿// @locs-version: 1.0
import { createMemo, createSignal, onMount } from "solid-js";
import type { DashboardBootstrap } from "@/lib/api";
import { DecisionQueueWorkspace } from "@/components/DecisionQueueWorkspace";
import { QueueDensityToggle } from "@/components/QueueDensityToggle";
import { WeddingNavigationArrivalBanner } from "@/components/WeddingNavigationArrivalBanner";
import { decisionOsQueueBootstrapState } from "@/lib/decisionOsQueueBootstrapState";
import {
  loadDecisionQueueDensity,
  queueDensityIsCompact,
  saveDecisionQueueDensity,
  type QueueDensity,
} from "@/lib/queueDensityLocalState";
import { consumeWeddingNavigationIntent } from "@/lib/weddingNavigationLocalState";
import {
  buildWeddingNavigationArrivalBannerState,
  weddingArrivalActionDestinationView,
  type WeddingArrivalAction,
} from "@/lib/weddingNavigationArrivalViewState";
import type { ViewName } from "@/lib/viewNames";

const DECISION_QUEUE_VIEW_CLASS =
  "view-enter min-w-0 space-y-4 rounded-[24px] border border-indigo-100/80 bg-[linear-gradient(135deg,rgba(238,242,255,0.96),rgba(255,255,255,0.96))] p-3 shadow-[0_22px_70px_-36px_rgba(67,56,202,0.24)] backdrop-blur-sm sm:rounded-[32px] sm:p-5";
const DECISION_QUEUE_VIEW_HEADER_CLASS = "flex min-w-0 flex-wrap items-center justify-between gap-3";
const DECISION_QUEUE_VIEW_KICKER_CLASS =
  "font-mono text-[10px] uppercase tracking-[0.18em] text-indigo-700/65";
const DECISION_QUEUE_VIEW_TITLE_CLASS = "mt-1 break-words text-lg font-semibold text-on-surface";
const DECISION_QUEUE_VIEW_SUBTITLE_CLASS = "mt-2 break-words text-sm text-indigo-900/65";
const DECISION_QUEUE_VIEW_KICKER_TEXT = "Decision Queue";
const DECISION_QUEUE_VIEW_TITLE_TEXT = "Approvals and actions requiring judgment";
const DECISION_QUEUE_VIEW_SUBTITLE_TEXT =
  "Continuity-backed queue with synthesized reasoning and source context.";

export function DecisionQueueView(props: {
  bootstrap: DashboardBootstrap | null;
  onNavigate?: (view: ViewName) => void;
}) {
  const bootstrap = createMemo(() => props.bootstrap);
  const decisionQueueState = createMemo(() => decisionOsQueueBootstrapState(bootstrap()));
  const [density, setDensity] = createSignal<QueueDensity>(loadDecisionQueueDensity());
  const [weddingNavigationIntent, setWeddingNavigationIntent] = createSignal<ReturnType<typeof consumeWeddingNavigationIntent>>(null);
  const weddingArrivalBanner = createMemo(() =>
    buildWeddingNavigationArrivalBannerState(weddingNavigationIntent()),
  );

  onMount(() => {
    const intent = consumeWeddingNavigationIntent();
    if (intent?.view === "decision_queue") setWeddingNavigationIntent(intent);
  });

  function selectDensityMode(mode: QueueDensity) {
    setDensity(mode);
    saveDecisionQueueDensity(mode);
  }

  function runWeddingArrivalAction(action: WeddingArrivalAction) {
    const destination = weddingArrivalActionDestinationView(action);
    if (destination) props.onNavigate?.(destination);
  }

  const viewState = createMemo(() => {
    const currentDensity = density();
    return {
      density: currentDensity,
      densityTone: "indigo" as const,
      workspaceQueueState: decisionQueueState(),
      workspaceCompactMode: queueDensityIsCompact(currentDensity),
    };
  });

  return (
    <div class={DECISION_QUEUE_VIEW_CLASS}>
      <div class={DECISION_QUEUE_VIEW_HEADER_CLASS}>
        <div class="min-w-0">
          <p class={DECISION_QUEUE_VIEW_KICKER_CLASS}>{DECISION_QUEUE_VIEW_KICKER_TEXT}</p>
          <h1 class={DECISION_QUEUE_VIEW_TITLE_CLASS}>{DECISION_QUEUE_VIEW_TITLE_TEXT}</h1>
          <p class={DECISION_QUEUE_VIEW_SUBTITLE_CLASS}>{DECISION_QUEUE_VIEW_SUBTITLE_TEXT}</p>
        </div>
        <QueueDensityToggle
          density={viewState().density}
          onSelect={selectDensityMode}
          tone={viewState().densityTone}
        />
      </div>

      <WeddingNavigationArrivalBanner
        state={weddingArrivalBanner()}
        onAction={runWeddingArrivalAction}
        onDismiss={() => setWeddingNavigationIntent(null)}
      />

      <RunbookPanel mode="questions" />
      <DecisionQueueWorkspace
        queueState={viewState().workspaceQueueState}
        compact={viewState().workspaceCompactMode}
      />
    </div>
  );
}
