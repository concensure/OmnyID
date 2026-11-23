// @locs-version: 1.0
import { For, Show, createMemo } from "solid-js";
import type { JSXElement } from "solid-js";

import type { RunTimelineFilterMode } from "@/lib/workflowGraphTypes";

type WorkflowRunTimelineReviewHeaderProps = {
  deploymentRecordSelected: boolean;
  focusedEdge: boolean;
  focusedTimelineNodeLabel: string | null;
  setRunTimelineFilterMode: (mode: RunTimelineFilterMode) => void;
  timelineDeploymentContextCount: number;
  timelineFilterMode: RunTimelineFilterMode;
  timelineFilterSummaryLabel: string;
  timelineReplayDriftCount: number;
  unfilteredCount: number;
};

type TimelineFilterActionItem = {
  className: string;
  label: string;
  onClick: () => void;
};

type TimelineReviewNoticeItem = {
  text: string;
};

type WorkflowRunTimelineReviewHeaderState = {
  filterActionItems: TimelineFilterActionItem[];
  noticeItems: TimelineReviewNoticeItem[];
  reviewSummaryText: string;
  showFocusedEdgeLabel: boolean;
};

type WorkflowRunTimelineReviewHeaderSectionId = "focused-edge" | "panel";

const TIMELINE_REVIEW_SHELL_CLASS = "mt-3 space-y-2";
const TIMELINE_REVIEW_FOCUSED_EDGE_LABEL_CLASS = "break-words text-xs font-semibold uppercase tracking-[0.18em] text-violet-700";
const TIMELINE_REVIEW_PANEL_CLASS = "min-w-0 rounded-2xl border border-violet-200/70 bg-violet-100/60 px-3 py-3";
const TIMELINE_REVIEW_HEADER_CLASS = "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between";
const TIMELINE_REVIEW_TITLE_CLASS = "text-xs font-semibold uppercase tracking-[0.16em] text-violet-700";
const TIMELINE_REVIEW_SUMMARY_CLASS = "mt-1 break-words text-sm text-violet-900";
const TIMELINE_REVIEW_ACTION_ROW_CLASS = "flex flex-col gap-2 sm:flex-row sm:flex-wrap";
const TIMELINE_REVIEW_NOTICE_CLASS = "mt-2 break-words text-xs text-violet-700/80";

function timelineFilterButtonClass(
  currentMode: RunTimelineFilterMode,
  mode: RunTimelineFilterMode,
): string {
  const baseClass = "rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition sm:py-1";

  if (mode === "all") {
    return currentMode === mode
      ? `${baseClass} border-violet-300 bg-white text-violet-800`
      : `${baseClass} border-violet-200/70 bg-white/75 text-violet-700 hover:bg-white`;
  }

  if (mode === "deployment_context") {
    return currentMode === mode
      ? `${baseClass} border-sky-300 bg-sky-50 text-sky-800`
      : `${baseClass} border-sky-200/70 bg-white/75 text-sky-700 hover:bg-white`;
  }

  return currentMode === mode
    ? `${baseClass} border-amber-300 bg-amber-50 text-amber-800`
    : `${baseClass} border-amber-200/70 bg-white/75 text-amber-700 hover:bg-white`;
}

function workflowRunTimelineReviewHeaderState(
  props: WorkflowRunTimelineReviewHeaderProps,
): WorkflowRunTimelineReviewHeaderState {
  const timelineFilterMode = props.timelineFilterMode;
  const filterActionItems: TimelineFilterActionItem[] = [
    {
      className: timelineFilterButtonClass(timelineFilterMode, "all"),
      label: `all ${props.unfilteredCount}`,
      onClick: () => props.setRunTimelineFilterMode("all"),
    },
    {
      className: timelineFilterButtonClass(timelineFilterMode, "deployment_context"),
      label: `deployment context ${props.timelineDeploymentContextCount}`,
      onClick: () => props.setRunTimelineFilterMode("deployment_context"),
    },
    {
      className: timelineFilterButtonClass(timelineFilterMode, "replay_drift"),
      label: `replay drift ${props.timelineReplayDriftCount}`,
      onClick: () => props.setRunTimelineFilterMode("replay_drift"),
    },
  ];

  let reviewSummaryText = `${props.unfilteredCount} step${props.unfilteredCount === 1 ? "" : "s"} in this run`;
  if (timelineFilterMode === "replay_drift") {
    reviewSummaryText += " reviewed for replay drift";
  } else if (timelineFilterMode === "deployment_context") {
    reviewSummaryText += " reviewed for deployment context";
  }

  const noticeItems: TimelineReviewNoticeItem[] = [];
  if (props.focusedEdge && timelineFilterMode !== "all") {
    noticeItems.push({
      text: `Branch focus is cleared while reviewing ${props.timelineFilterSummaryLabel} so the full run context stays visible.`,
    });
  }
  if (props.focusedTimelineNodeLabel) {
    noticeItems.push({
      text: `Timeline review is focused on ${props.focusedTimelineNodeLabel}. Clear the node chip above to return to all nodes in this run.`,
    });
  }
  if (props.deploymentRecordSelected) {
    noticeItems.push({
      text: "Deployment-linked timeline chips highlight the matching snapshot in deployment history below.",
    });
  }
  if (timelineFilterMode === "replay_drift" && props.timelineReplayDriftCount === 0) {
    noticeItems.push({
      text: "No steps in this view carry replay drift metadata yet.",
    });
  } else if (timelineFilterMode === "deployment_context" && props.timelineDeploymentContextCount === 0) {
    noticeItems.push({
      text: "No steps in this view carry deployment context metadata yet.",
    });
  }

  return {
    filterActionItems,
    noticeItems,
    reviewSummaryText,
    showFocusedEdgeLabel: props.focusedEdge,
  };
}

type WorkflowTimelineReviewFocusedEdgeSectionProps = {
  state: WorkflowRunTimelineReviewHeaderState;
};

function WorkflowTimelineReviewFocusedEdgeSection(
  props: WorkflowTimelineReviewFocusedEdgeSectionProps,
): JSXElement {
  return (
    <p class={TIMELINE_REVIEW_FOCUSED_EDGE_LABEL_CLASS}>Filtered timeline for selected branch</p>
  );
}

type WorkflowTimelineReviewPanelSectionProps = {
  state: WorkflowRunTimelineReviewHeaderState;
};

function WorkflowTimelineReviewPanelSection(
  props: WorkflowTimelineReviewPanelSectionProps,
): JSXElement {
  return (
    <div class={TIMELINE_REVIEW_PANEL_CLASS}>
      <div class={TIMELINE_REVIEW_HEADER_CLASS}>
        <div>
          <p class={TIMELINE_REVIEW_TITLE_CLASS}>Timeline review</p>
          <p class={TIMELINE_REVIEW_SUMMARY_CLASS}>{props.state.reviewSummaryText}</p>
        </div>
        <div class={TIMELINE_REVIEW_ACTION_ROW_CLASS}>
          <For each={props.state.filterActionItems}>
            {(action) => (
              <button type="button" class={action.className} onClick={action.onClick}>
                {action.label}
              </button>
            )}
          </For>
        </div>
      </div>
      <For each={props.state.noticeItems}>
        {(notice) => <p class={TIMELINE_REVIEW_NOTICE_CLASS}>{notice.text}</p>}
      </For>
    </div>
  );
}

export function WorkflowRunTimelineReviewHeader(props: WorkflowRunTimelineReviewHeaderProps) {
  const headerState = createMemo(() => workflowRunTimelineReviewHeaderState(props));

  const visibleSections = createMemo<WorkflowRunTimelineReviewHeaderSectionId[]>(() => {
    const sections: WorkflowRunTimelineReviewHeaderSectionId[] = ["panel"];
    if (headerState().showFocusedEdgeLabel) {
      sections.unshift("focused-edge");
    }
    return sections;
  });

  return (
    <div class={TIMELINE_REVIEW_SHELL_CLASS}>
      <For each={visibleSections()}>
        {(sectionId) => {
          const state = headerState();
          if (sectionId === "focused-edge") {
            return <WorkflowTimelineReviewFocusedEdgeSection state={state} />;
          }
          return <WorkflowTimelineReviewPanelSection state={state} />;
        }}
      </For>
    </div>
  );
}
