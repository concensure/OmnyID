// @locs-version: 1.0
import { For, Show, createMemo, type JSXElement } from "solid-js";
import type { JSX } from "solid-js";

type WorkflowRunDetailHeaderPanelProps = {
  contractDetail: string | null;
  contractHeadline: string | null;
  explanationChipClass: string | null;
  explanationChipLabel: string | null;
  executionMode: string;
  onClear: () => void;
  onCopyCoreReviewLink: () => void;
  onCopyShareLink: () => void;
  onCopyWorkflowLink: () => void;
  remainingLabel: string | null;
  replayOfRunId: string | null;
  runId: string;
  sharedReviewControls: JSX.Element | null;
  status: string;
  statusChipClass: string;
};

type HeaderBadgeItem = {
  className: string;
  label: string;
  title?: string;
};

type HeaderActionItem = {
  className: string;
  label: string;
  onClick: () => void;
};

type WorkflowRunDetailHeaderPanelState = {
  actionItems: HeaderActionItem[];
  badgeItems: HeaderBadgeItem[];
  contractDetail: string | null;
  identifierText: string;
  sharedReviewControls: JSX.Element | null;
  statusChipClass: string;
  statusText: string;
  supportingText: string;
};

const DETAIL_HEADER_SHELL_CLASS = "flex items-start justify-between gap-3";
const DETAIL_HEADER_ACTIONS_CLASS = "flex flex-wrap items-center justify-end gap-2";
const DETAIL_HEADER_TITLE_CLASS = "text-sm font-semibold text-violet-900";
const DETAIL_HEADER_IDENTIFIER_CLASS = "text-xs uppercase tracking-[0.18em] text-violet-700";
const DETAIL_HEADER_BADGE_ROW_CLASS = "mt-1 flex flex-wrap items-center gap-2";
const DETAIL_HEADER_STATUS_CHIP_CLASS = "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]";
const DETAIL_HEADER_SUPPORTING_TEXT_CLASS = "text-[11px] text-violet-700/80";
const DETAIL_HEADER_DETAIL_TEXT_CLASS = "mt-2 max-w-3xl text-xs text-violet-800/85";
const DETAIL_HEADER_WORKFLOW_LINK_BUTTON_CLASS =
  "rounded-full border border-slate-200/70 bg-white/85 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-white";
const DETAIL_HEADER_SHARE_LINK_BUTTON_CLASS =
  "rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-xs font-medium text-sky-700 transition hover:bg-sky-100";
const DETAIL_HEADER_CORE_REVIEW_BUTTON_CLASS =
  "rounded-full border border-sky-200/70 bg-white/80 px-3 py-1 text-xs font-medium text-sky-700 transition hover:bg-white";
const DETAIL_HEADER_CLEAR_BUTTON_CLASS =
  "rounded-full border border-violet-200/70 bg-white/80 px-3 py-1 text-xs font-medium text-violet-700 transition hover:bg-white";
const DETAIL_HEADER_REPLAY_BADGE_CLASS =
  "rounded-full border border-amber-200/70 bg-amber-50/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700";
const DETAIL_HEADER_REMAINING_BADGE_CLASS =
  "rounded-full border border-sky-200/70 bg-sky-50/80 px-2 py-0.5 text-[10px] font-medium text-sky-700";
const DETAIL_HEADER_CONTRACT_BADGE_CLASS =
  "rounded-full border border-emerald-200/70 bg-emerald-50/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700";

function workflowRunDetailHeaderPanelState(
  props: WorkflowRunDetailHeaderPanelProps,
): WorkflowRunDetailHeaderPanelState {
  const badgeItems: HeaderBadgeItem[] = [];
  const explanationChipLabel = props.explanationChipLabel;
  const explanationChipClass = props.explanationChipClass;
  const replayOfRunId = props.replayOfRunId;
  const remainingLabel = props.remainingLabel;
  const contractHeadline = props.contractHeadline;
  const contractDetail = props.contractDetail;

  if (explanationChipLabel && explanationChipClass) {
    badgeItems.push({
      className: `rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${explanationChipClass}`,
      label: explanationChipLabel,
    });
  }

  if (replayOfRunId) {
    badgeItems.push({
      className: DETAIL_HEADER_REPLAY_BADGE_CLASS,
      label: "replay source",
      title: `Replay of ${replayOfRunId}`,
    });
  }

  if (remainingLabel) {
    badgeItems.push({
      className: DETAIL_HEADER_REMAINING_BADGE_CLASS,
      label: remainingLabel,
    });
  }

  if (contractHeadline) {
    badgeItems.push({
      className: DETAIL_HEADER_CONTRACT_BADGE_CLASS,
      label: contractHeadline,
      title: contractDetail ?? contractHeadline,
    });
  }

  return {
    actionItems: [
      {
        className: DETAIL_HEADER_WORKFLOW_LINK_BUTTON_CLASS,
        label: "Workflow link",
        onClick: props.onCopyWorkflowLink,
      },
      {
        className: DETAIL_HEADER_SHARE_LINK_BUTTON_CLASS,
        label: "Share link",
        onClick: props.onCopyShareLink,
      },
      {
        className: DETAIL_HEADER_CORE_REVIEW_BUTTON_CLASS,
        label: "Core review link",
        onClick: props.onCopyCoreReviewLink,
      },
      {
        className: DETAIL_HEADER_CLEAR_BUTTON_CLASS,
        label: "Clear",
        onClick: props.onClear,
      },
    ],
    badgeItems,
    contractDetail,
    identifierText: `${props.runId} - ${props.executionMode}`,
    sharedReviewControls: props.sharedReviewControls,
    statusChipClass: `${DETAIL_HEADER_STATUS_CHIP_CLASS} ${props.statusChipClass}`,
    statusText: props.status.replaceAll("_", " "),
    supportingText:
      "Workflow link is clean. Share link can preserve this full workspace or just this run review.",
  };
}

function WorkflowDetailHeaderIdentitySection(props: {
  panelState: WorkflowRunDetailHeaderPanelState;
}) {
  return (
    <div>
      <p class={DETAIL_HEADER_TITLE_CLASS}>Run detail</p>
      <div class={DETAIL_HEADER_BADGE_ROW_CLASS}>
        <p class={DETAIL_HEADER_IDENTIFIER_CLASS}>{props.panelState.identifierText}</p>
        <span class={props.panelState.statusChipClass}>{props.panelState.statusText}</span>
        <For each={props.panelState.badgeItems}>
          {(badge) => (
            <span class={badge.className} title={badge.title}>
              {badge.label}
            </span>
          )}
        </For>
      </div>
      <Show when={props.panelState.contractDetail}>
        {(detail) => <p class={DETAIL_HEADER_DETAIL_TEXT_CLASS}>{detail()}</p>}
      </Show>
    </div>
  );
}

function WorkflowDetailHeaderActionsSection(props: {
  panelState: WorkflowRunDetailHeaderPanelState;
}) {
  return (
    <div class={DETAIL_HEADER_ACTIONS_CLASS}>
      <For each={props.panelState.actionItems.slice(0, 1)}>
        {(action) => (
          <button type="button" class={action.className} onClick={action.onClick}>
            {action.label}
          </button>
        )}
      </For>
      <Show when={props.panelState.sharedReviewControls}>{props.panelState.sharedReviewControls}</Show>
      <For each={props.panelState.actionItems.slice(1)}>
        {(action) => (
          <button type="button" class={action.className} onClick={action.onClick}>
            {action.label}
          </button>
        )}
      </For>
      <span class={DETAIL_HEADER_SUPPORTING_TEXT_CLASS}>{props.panelState.supportingText}</span>
    </div>
  );
}

export function WorkflowRunDetailHeaderPanel(props: WorkflowRunDetailHeaderPanelProps) {
  const panelState = createMemo(() => workflowRunDetailHeaderPanelState(props));
  const visibleSections = createMemo(() => {
    const state = panelState();
    return [
      <WorkflowDetailHeaderIdentitySection panelState={state} />,
      <WorkflowDetailHeaderActionsSection panelState={state} />,
    ] satisfies JSXElement[];
  });

  return (
    <div class={DETAIL_HEADER_SHELL_CLASS}>
      <For each={visibleSections()}>{(section) => section}</For>
    </div>
  );
}
