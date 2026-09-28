// @locs-version: 1.0
import { For, Show, createMemo, type JSXElement } from "solid-js";

type WorkflowRunBranchFocusPanelProps = {
  branch: any;
};

type BranchBadgeItem = {
  className: string;
  label: string;
  style?: Record<string, string>;
};

type BranchPolicyBadgeItem = {
  label: string;
};

type BranchPolicyActionItem = {
  label: string;
  onClick: () => void;
};

type BranchLogEntryState = {
  text: string;
  title: string;
  toneClass: string;
};

type BranchPolicyDeltaState = {
  actionItems: BranchPolicyActionItem[];
  badgeItems: BranchPolicyBadgeItem[];
  detailText: string;
  showSection: boolean;
};

type WorkflowRunBranchFocusPanelState = {
  badgeItems: BranchBadgeItem[];
  calloutText: string | null;
  clearBranch: () => void;
  logEntries: BranchLogEntryState[];
  policyDeltaState: BranchPolicyDeltaState;
  sourceTargetText: string;
  timelineEmpty: boolean;
};

const BRANCH_FOCUS_PANEL_CLASS = "mt-4 rounded-[20px] border border-violet-200/70 bg-white/80 p-4";
const BRANCH_FOCUS_HEADER_CLASS = "flex flex-wrap items-start justify-between gap-3";
const BRANCH_FOCUS_TITLE_CLASS = "text-xs font-semibold uppercase tracking-[0.18em] text-violet-700";
const BRANCH_FOCUS_SOURCE_TARGET_CLASS = "mt-1 text-sm font-semibold text-violet-900";
const BRANCH_FOCUS_CLEAR_BUTTON_CLASS =
  "rounded-full border border-violet-200/70 bg-violet-50/80 px-3 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-100";
const BRANCH_FOCUS_BADGE_ROW_CLASS = "mt-3 flex flex-wrap gap-2";
const BRANCH_FOCUS_CONDITION_BADGE_CLASS =
  "rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700";
const BRANCH_FOCUS_RELATED_STEPS_BADGE_CLASS =
  "rounded-full border border-violet-200/70 bg-violet-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700";
const BRANCH_FOCUS_CALLOUT_CLASS = "mt-3 text-sm text-violet-900";
const BRANCH_FOCUS_POLICY_PANEL_CLASS = "mt-3 rounded-2xl border border-sky-200/70 bg-sky-50/75 px-3 py-3";
const BRANCH_FOCUS_POLICY_BADGE_ROW_CLASS = "flex flex-wrap items-center gap-2";
const BRANCH_FOCUS_POLICY_BADGE_CLASS =
  "rounded-full border border-sky-200/70 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700";
const BRANCH_FOCUS_POLICY_TEXT_CLASS = "mt-2 text-sm text-sky-900";
const BRANCH_FOCUS_POLICY_ACTION_ROW_CLASS = "mt-3 flex flex-wrap gap-2";
const BRANCH_FOCUS_POLICY_ACTION_CLASS =
  "rounded-full border border-sky-200/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700 transition hover:bg-white";
const BRANCH_FOCUS_EMPTY_TIMELINE_CLASS = "mt-2 text-xs text-on-surface-variant";
const BRANCH_FOCUS_LOG_SECTION_CLASS = "mt-4 space-y-2";
const BRANCH_FOCUS_LOG_TITLE_CLASS = "text-xs font-semibold uppercase tracking-[0.18em] text-violet-700";

function workflowRunBranchFocusPanelState(
  props: WorkflowRunBranchFocusPanelProps,
): WorkflowRunBranchFocusPanelState {
  const branch = props.branch;
  const badgeItems: BranchBadgeItem[] = [];

  if (branch.conditionLabel) {
    badgeItems.push({
      className: BRANCH_FOCUS_CONDITION_BADGE_CLASS,
      label: branch.conditionLabel,
    });
  }

  badgeItems.push({
    className: "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
    label: branch.visual.legend,
    style: {
      border: `1px solid ${branch.visual.badgeBorder}`,
      "background-color": branch.visual.badgeFill,
      color: branch.visual.badgeText,
    },
  });

  badgeItems.push({
    className: BRANCH_FOCUS_RELATED_STEPS_BADGE_CLASS,
    label: branch.relatedStepsLabel,
  });

  const policyDelta = branch.policyDelta;
  const policyDeltaState: BranchPolicyDeltaState = {
    actionItems: [],
    badgeItems: [],
    detailText: "",
    showSection: Boolean(policyDelta),
  };

  if (policyDelta) {
    policyDeltaState.badgeItems = [
      {
        label:
          policyDelta.source === "replay_policy_delta" ? "Replay branch delta" : "Branch policy delta",
      },
      { label: `${policyDelta.relation} node` },
      {
        label: `${policyDelta.changes.length} field${policyDelta.changes.length === 1 ? "" : "s"}`,
      },
    ];
    policyDeltaState.detailText = `${branch.policyDeltaNodeLabel} influenced this branch with ${branch.policyDeltaSummary}.`;
    policyDeltaState.actionItems = [
      {
        label: "review node delta",
        onClick: branch.onReviewNodeDelta,
      },
    ];

    if (policyDelta.deploymentId) {
      policyDeltaState.actionItems.push({
        label: "review snapshot",
        onClick: () => branch.onReviewSnapshot(policyDelta.deploymentId),
      });
    }
  }

  return {
    badgeItems,
    calloutText: branch.calloutText ?? null,
    clearBranch: branch.onClear,
    logEntries: branch.logEntries.map((entry: any) => ({
      text: entry.text,
      title: entry.title,
      toneClass: entry.toneClass,
    })),
    policyDeltaState,
    sourceTargetText: `${branch.sourceLabel} -> ${branch.targetLabel}`,
    timelineEmpty: Boolean(branch.timelineEmpty),
  };
}

function WorkflowBranchFocusHeaderSection(props: {
  clearBranch: () => void;
  sourceTargetText: string;
}) {
  return (
    <div class={BRANCH_FOCUS_HEADER_CLASS}>
      <div>
        <p class={BRANCH_FOCUS_TITLE_CLASS}>Branch focus</p>
        <p class={BRANCH_FOCUS_SOURCE_TARGET_CLASS}>{props.sourceTargetText}</p>
      </div>
      <button type="button" class={BRANCH_FOCUS_CLEAR_BUTTON_CLASS} onClick={props.clearBranch}>
        Clear branch
      </button>
    </div>
  );
}

function WorkflowBranchFocusBadgeSection(props: { badgeItems: BranchBadgeItem[] }) {
  return (
    <div class={BRANCH_FOCUS_BADGE_ROW_CLASS}>
      <For each={props.badgeItems}>
        {(badge) => (
          <span class={badge.className} style={badge.style}>
            {badge.label}
          </span>
        )}
      </For>
    </div>
  );
}

function WorkflowBranchFocusPolicySection(props: { policyDeltaState: BranchPolicyDeltaState }) {
  return (
    <div class={BRANCH_FOCUS_POLICY_PANEL_CLASS}>
      <div class={BRANCH_FOCUS_POLICY_BADGE_ROW_CLASS}>
        <For each={props.policyDeltaState.badgeItems}>
          {(badge) => <span class={BRANCH_FOCUS_POLICY_BADGE_CLASS}>{badge.label}</span>}
        </For>
      </div>
      <p class={BRANCH_FOCUS_POLICY_TEXT_CLASS}>{props.policyDeltaState.detailText}</p>
      <div class={BRANCH_FOCUS_POLICY_ACTION_ROW_CLASS}>
        <For each={props.policyDeltaState.actionItems}>
          {(action) => (
            <button type="button" class={BRANCH_FOCUS_POLICY_ACTION_CLASS} onClick={action.onClick}>
              {action.label}
            </button>
          )}
        </For>
      </div>
    </div>
  );
}

function WorkflowBranchFocusLogSection(props: { logEntries: BranchLogEntryState[] }) {
  return (
    <div class={BRANCH_FOCUS_LOG_SECTION_CLASS}>
      <p class={BRANCH_FOCUS_LOG_TITLE_CLASS}>Execution log</p>
      <For each={props.logEntries}>
        {(entry) => (
          <div class={`rounded-2xl border px-3 py-3 ${entry.toneClass}`}>
            <p class="text-[11px] font-semibold uppercase tracking-[0.14em]">{entry.title}</p>
            <p class="mt-1 text-sm">{entry.text}</p>
          </div>
        )}
      </For>
    </div>
  );
}

export function WorkflowRunBranchFocusPanel(props: WorkflowRunBranchFocusPanelProps) {
  const panelState = createMemo(() => workflowRunBranchFocusPanelState(props));
  const visibleSections = createMemo(() => {
    const state = panelState();
    const sections: JSXElement[] = [
      <WorkflowBranchFocusHeaderSection
        clearBranch={state.clearBranch}
        sourceTargetText={state.sourceTargetText}
      />,
      <WorkflowBranchFocusBadgeSection badgeItems={state.badgeItems} />,
      <WorkflowBranchFocusLogSection logEntries={state.logEntries} />,
    ];

    if (state.calloutText) {
      sections.splice(2, 0, <p class={BRANCH_FOCUS_CALLOUT_CLASS}>{state.calloutText}</p>);
    }

    if (state.policyDeltaState.showSection) {
      sections.splice(2, 0, <WorkflowBranchFocusPolicySection policyDeltaState={state.policyDeltaState} />);
    }

    if (state.timelineEmpty) {
      sections.splice(
        sections.length - 1,
        0,
        <p class={BRANCH_FOCUS_EMPTY_TIMELINE_CLASS}>
          This branch was not directly traversed in the timeline. That usually means the route was skipped before the target node executed.
        </p>,
      );
    }

    return sections;
  });

  return (
    <div class={BRANCH_FOCUS_PANEL_CLASS}>
      <For each={visibleSections()}>{(section) => section}</For>
    </div>
  );
}
