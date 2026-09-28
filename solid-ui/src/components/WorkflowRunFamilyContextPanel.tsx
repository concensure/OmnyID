// @locs-version: 1.0
import { For, Show, createMemo, type JSXElement } from "solid-js";

type WorkflowRunFamilyContextPanelProps = {
  familyId: string | null;
  familyWorkflowId: string | null;
  semanticRole: string | null;
  values: Array<{ key: string; value: string }>;
};

type WorkflowFamilyBadgeItem = {
  label: string;
};

type WorkflowFamilyValueItem = {
  label: string;
};

type WorkflowRunFamilyContextPanelState = {
  badgeItems: WorkflowFamilyBadgeItem[];
  valueItems: WorkflowFamilyValueItem[];
};

const WORKFLOW_FAMILY_PANEL_CLASS = "mt-3 rounded-2xl border border-violet-200/70 bg-violet-50/80 px-3 py-3";
const WORKFLOW_FAMILY_TITLE_CLASS = "text-xs font-semibold uppercase tracking-[0.16em] text-violet-700";
const WORKFLOW_FAMILY_BADGE_ROW_CLASS = "mt-2 flex flex-wrap gap-2";
const WORKFLOW_FAMILY_BADGE_CLASS =
  "rounded-full border border-violet-200/70 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700";
const WORKFLOW_FAMILY_VALUE_CLASS =
  "rounded-full border border-violet-200/70 bg-white/85 px-2.5 py-1 text-[10px] font-medium text-violet-800";

function workflowRunFamilyContextPanelState(
  props: WorkflowRunFamilyContextPanelProps,
): WorkflowRunFamilyContextPanelState {
  const badgeItems: WorkflowFamilyBadgeItem[] = [];

  if (props.familyId) {
    badgeItems.push({ label: `family ${props.familyId}` });
  }

  if (props.semanticRole) {
    badgeItems.push({ label: `role ${props.semanticRole.replaceAll("_", " ")}` });
  }

  if (props.familyWorkflowId) {
    badgeItems.push({ label: `source ${props.familyWorkflowId}` });
  }

  return {
    badgeItems,
    valueItems: props.values.map((entry) => ({ label: `${entry.key}=${entry.value}` })),
  };
}

function WorkflowFamilyContextBadgeSection(props: { badgeItems: WorkflowFamilyBadgeItem[] }) {
  return (
    <div class={WORKFLOW_FAMILY_BADGE_ROW_CLASS}>
      <For each={props.badgeItems}>
        {(badge) => <span class={WORKFLOW_FAMILY_BADGE_CLASS}>{badge.label}</span>}
      </For>
    </div>
  );
}

function WorkflowFamilyContextValueSection(props: { valueItems: WorkflowFamilyValueItem[] }) {
  return (
    <div class={WORKFLOW_FAMILY_BADGE_ROW_CLASS}>
      <For each={props.valueItems}>
        {(entry) => <span class={WORKFLOW_FAMILY_VALUE_CLASS}>{entry.label}</span>}
      </For>
    </div>
  );
}

export function WorkflowRunFamilyContextPanel(props: WorkflowRunFamilyContextPanelProps) {
  const panelState = createMemo(() => workflowRunFamilyContextPanelState(props));
  const visibleSections = createMemo(() => {
    const state = panelState();
    const sections: JSXElement[] = [<p class={WORKFLOW_FAMILY_TITLE_CLASS}>Workflow family context</p>];

    if (state.badgeItems.length > 0) {
      sections.push(<WorkflowFamilyContextBadgeSection badgeItems={state.badgeItems} />);
    }

    if (state.valueItems.length > 0) {
      sections.push(<WorkflowFamilyContextValueSection valueItems={state.valueItems} />);
    }

    return sections;
  });

  return (
    <div class={WORKFLOW_FAMILY_PANEL_CLASS}>
      <For each={visibleSections()}>{(section) => section}</For>
    </div>
  );
}
