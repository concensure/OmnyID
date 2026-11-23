// @locs-version: 1.0
import { For, Show, createMemo } from "solid-js";
import type { JSXElement } from "solid-js";

import type { SavedWorkflow } from "@/lib/api";
import {
  workflowRailBadgeLabel,
  workflowRailBranchFamilyTitle,
  workflowRailBranchOriginLabel,
  workflowCompiledContractStatusLabel,
  workflowCompiledContractTooltip,
  workflowRailDescriptionFallback,
  workflowRailFamilyToggleLabel,
  workflowRailMoreSiblingsLabel,
  workflowRailNodeCountLabel,
  workflowRailSiblingSummaryLabel,
} from "@/lib/workflowDeploymentHelpers";
import { isRecord } from "@/lib/eventDetail";
import { workflowGraphMetadata } from "@/lib/workflowGraphMetadata";

type WorkflowRailCardProps = {
  branchOriginParentWorkflowId?: string;
  familyCollapsed: boolean;
  isBranchChild: boolean;
  isBranchFamilyRoot: boolean;
  isSelected: boolean;
  nodeCount: number;
  onLoadWorkflow: (workflowId: string) => void | Promise<void>;
  onToggleFamily: () => void;
  selectedWorkflowId: string | null;
  siblingCount: number;
  siblings: SavedWorkflow[];
  workflow: SavedWorkflow;
};

type WorkflowRailBadgeItem = {
  className: string;
  label: string;
};

type WorkflowRailSiblingItem = {
  isSelected: boolean;
  title: string;
  workflowId: string;
};

type WorkflowRailCardState = {
  badgeItems: WorkflowRailBadgeItem[];
  branchOriginLabel: string | null;
  cardClass: string;
  contractStatusLabel: string;
  contractStatusTitle: string;
  descriptionText: string;
  moreSiblingsLabel: string | null;
  nodeCountLabel: string;
  selectedWorkflowId: string | null;
  shellClass: string;
  showFamilyToggle: boolean;
  siblingItems: WorkflowRailSiblingItem[];
  siblingSummaryLabel: string | null;
  title: string;
  toggleFamilyLabel: string;
  workflowId: string;
};

type WorkflowRailSectionId = "badges" | "content" | "siblings";

const WORKFLOW_RAIL_BRANCH_SHELL_CLASS = "ml-4 border-l-2 border-emerald-200/80 pl-3";
const WORKFLOW_RAIL_CARD_BASE_CLASS = "w-full rounded-[20px] border p-4 text-left transition";
const WORKFLOW_RAIL_CARD_SELECTED_CLASS = "border-primary/40 bg-primary/10 shadow-soft";
const WORKFLOW_RAIL_CARD_IDLE_CLASS = "border-white/35 bg-white/35 hover:bg-white/50";
const WORKFLOW_RAIL_BADGE_ROW_CLASS = "mb-2 flex items-center justify-between gap-2";
const WORKFLOW_RAIL_BADGES_CLASS = "flex flex-wrap items-center gap-2";
const WORKFLOW_RAIL_FAMILY_TOGGLE_CLASS =
  "rounded-full border border-emerald-200/80 bg-white/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700 transition hover:bg-white";
const WORKFLOW_RAIL_CONTENT_BUTTON_CLASS = "w-full text-left";
const WORKFLOW_RAIL_TITLE_ROW_CLASS = "flex items-center justify-between gap-3";
const WORKFLOW_RAIL_TITLE_CLASS = "text-sm font-semibold text-on-surface";
const WORKFLOW_RAIL_FLAG_ROW_CLASS = "flex items-center gap-2";
const WORKFLOW_RAIL_DESCRIPTION_CLASS = "mt-2 line-clamp-2 text-xs leading-5 text-on-surface-variant";
const WORKFLOW_RAIL_BRANCH_ORIGIN_CLASS = "mt-2 text-[11px] uppercase tracking-[0.14em] text-emerald-700";
const WORKFLOW_RAIL_SIBLING_SUMMARY_CLASS = "mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-600";
const WORKFLOW_RAIL_META_ROW_CLASS = "mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-on-surface-variant";
const WORKFLOW_RAIL_SIBLINGS_SHELL_CLASS = "mt-3 border-t border-white/30 pt-3";
const WORKFLOW_RAIL_SIBLINGS_TITLE_CLASS = "text-[10px] font-semibold uppercase tracking-[0.16em] text-on-surface-variant";
const WORKFLOW_RAIL_SIBLINGS_ROW_CLASS = "mt-2 flex flex-wrap gap-2";
const WORKFLOW_RAIL_MORE_SIBLINGS_CLASS =
  "rounded-full border border-emerald-200/80 bg-white/80 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700";

function workflowRailBadgeClass(tone: "emerald" | "violet" | "sky" | "amber"): string {
  if (tone === "violet") {
    return "rounded-full bg-violet-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700";
  }
  if (tone === "sky") {
    return "rounded-full bg-sky-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700";
  }
  if (tone === "amber") {
    return "rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700";
  }
  return "rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700";
}

function workflowRailSiblingButtonClass(isSelected: boolean): string {
  return `rounded-full border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition ${
    isSelected
      ? "border-emerald-300 bg-emerald-100 text-emerald-800"
      : "border-emerald-200/80 bg-white/80 text-emerald-700 hover:bg-white"
  }`;
}

function workflowRailCardState(props: WorkflowRailCardProps): WorkflowRailCardState {
  const metadata = workflowGraphMetadata(props.workflow);
  const familyAsset = isRecord(metadata?.workflow_family_asset);
  const familyInstance = isRecord(metadata?.workflow_family_instance);

  const badgeItems: WorkflowRailBadgeItem[] = [];
  if (props.isBranchFamilyRoot) {
    badgeItems.push({
      className: workflowRailBadgeClass("emerald"),
      label: workflowRailBadgeLabel("family_root"),
    });
  }
  if (props.isBranchChild) {
    badgeItems.push({
      className: workflowRailBadgeClass("emerald"),
      label: workflowRailBadgeLabel("branch_child"),
    });
  }
  if (familyAsset) {
    badgeItems.push({
      className: workflowRailBadgeClass("violet"),
      label: workflowRailBadgeLabel("family_asset"),
    });
  }
  if (familyInstance) {
    badgeItems.push({
      className: workflowRailBadgeClass("sky"),
      label: workflowRailBadgeLabel("family_instance"),
    });
  }
  if (props.branchOriginParentWorkflowId) {
    badgeItems.push({
      className: workflowRailBadgeClass("emerald"),
      label: workflowRailBadgeLabel("branch"),
    });
  }
  if (props.workflow.favorite) {
    badgeItems.push({
      className: workflowRailBadgeClass("amber"),
      label: workflowRailBadgeLabel("favorite"),
    });
  }

  return {
    badgeItems,
    branchOriginLabel: props.branchOriginParentWorkflowId
      ? workflowRailBranchOriginLabel(String(props.branchOriginParentWorkflowId))
      : null,
    cardClass: `${WORKFLOW_RAIL_CARD_BASE_CLASS} ${
      props.isSelected ? WORKFLOW_RAIL_CARD_SELECTED_CLASS : WORKFLOW_RAIL_CARD_IDLE_CLASS
    }`,
    contractStatusLabel: workflowCompiledContractStatusLabel(props.workflow),
    contractStatusTitle: workflowCompiledContractTooltip(props.workflow),
    descriptionText: props.workflow.description ?? workflowRailDescriptionFallback(),
    moreSiblingsLabel:
      props.siblings.length > 3 ? workflowRailMoreSiblingsLabel(props.siblings.length - 3) : null,
    nodeCountLabel: workflowRailNodeCountLabel(props.nodeCount),
    selectedWorkflowId: props.selectedWorkflowId,
    shellClass: props.isBranchChild ? WORKFLOW_RAIL_BRANCH_SHELL_CLASS : "",
    showFamilyToggle: props.isBranchFamilyRoot,
    siblingItems: props.siblings.slice(0, 3).map((sibling) => ({
      isSelected: props.selectedWorkflowId === sibling.workflow_id,
      title: sibling.title,
      workflowId: sibling.workflow_id,
    })),
    siblingSummaryLabel:
      props.siblingCount > 0
        ? workflowRailSiblingSummaryLabel(
            props.siblingCount,
            props.isBranchFamilyRoot && props.familyCollapsed,
          )
        : null,
    title: props.workflow.title,
    toggleFamilyLabel: workflowRailFamilyToggleLabel(props.familyCollapsed),
    workflowId: props.workflow.workflow_id,
  };
}

type WorkflowRailBadgeSectionProps = {
  onToggleFamily: () => void;
  state: WorkflowRailCardState;
};

function WorkflowRailBadgeSection(props: WorkflowRailBadgeSectionProps): JSXElement {
  const state = props.state;
  return (
    <div class={WORKFLOW_RAIL_BADGE_ROW_CLASS}>
      <div class={WORKFLOW_RAIL_BADGES_CLASS}>
        <For each={state.badgeItems.slice(0, 4)}>
          {(badge) => <span class={badge.className}>{badge.label}</span>}
        </For>
      </div>
      <Show when={state.showFamilyToggle}>
        <button
          type="button"
          class={WORKFLOW_RAIL_FAMILY_TOGGLE_CLASS}
          onClick={props.onToggleFamily}
        >
          {state.toggleFamilyLabel}
        </button>
      </Show>
    </div>
  );
}

type WorkflowRailContentSectionProps = {
  onLoadWorkflow: (workflowId: string) => void | Promise<void>;
  state: WorkflowRailCardState;
};

function WorkflowRailContentSection(props: WorkflowRailContentSectionProps): JSXElement {
  return (
    <button
      type="button"
      class={WORKFLOW_RAIL_CONTENT_BUTTON_CLASS}
      onClick={() => void props.onLoadWorkflow(props.state.workflowId)}
    >
      <div class={WORKFLOW_RAIL_TITLE_ROW_CLASS}>
        <p class={WORKFLOW_RAIL_TITLE_CLASS}>{props.state.title}</p>
        <div class={WORKFLOW_RAIL_FLAG_ROW_CLASS}>
          <For each={props.state.badgeItems.slice(4)}>
            {(badge) => <span class={badge.className}>{badge.label}</span>}
          </For>
        </div>
      </div>
      <p class={WORKFLOW_RAIL_DESCRIPTION_CLASS}>{props.state.descriptionText}</p>
      <Show when={props.state.branchOriginLabel}>
        {(label) => <p class={WORKFLOW_RAIL_BRANCH_ORIGIN_CLASS}>{label()}</p>}
      </Show>
      <Show when={props.state.siblingSummaryLabel}>
        {(label) => <p class={WORKFLOW_RAIL_SIBLING_SUMMARY_CLASS}>{label()}</p>}
      </Show>
      <div class={WORKFLOW_RAIL_META_ROW_CLASS}>
        <span>{props.state.nodeCountLabel}</span>
        <span title={props.state.contractStatusTitle}>{props.state.contractStatusLabel}</span>
      </div>
    </button>
  );
}

type WorkflowRailSiblingsSectionProps = {
  onLoadWorkflow: (workflowId: string) => void | Promise<void>;
  state: WorkflowRailCardState;
};

function WorkflowRailSiblingsSection(props: WorkflowRailSiblingsSectionProps): JSXElement {
  return (
    <div class={WORKFLOW_RAIL_SIBLINGS_SHELL_CLASS}>
      <p class={WORKFLOW_RAIL_SIBLINGS_TITLE_CLASS}>{workflowRailBranchFamilyTitle()}</p>
      <div class={WORKFLOW_RAIL_SIBLINGS_ROW_CLASS}>
        <For each={props.state.siblingItems}>
          {(sibling) => (
            <button
              type="button"
              class={workflowRailSiblingButtonClass(sibling.isSelected)}
              onClick={() => void props.onLoadWorkflow(sibling.workflowId)}
            >
              {sibling.title}
            </button>
          )}
        </For>
        <Show when={props.state.moreSiblingsLabel}>
          {(label) => <span class={WORKFLOW_RAIL_MORE_SIBLINGS_CLASS}>{label()}</span>}
        </Show>
      </div>
    </div>
  );
}

export function WorkflowRailCard(props: WorkflowRailCardProps) {
  const cardState = createMemo(() => workflowRailCardState(props));

  const visibleSections = createMemo<WorkflowRailSectionId[]>(() => {
    const sections: WorkflowRailSectionId[] = ["badges", "content"];
    if (cardState().siblingItems.length > 0) {
      sections.push("siblings");
    }
    return sections;
  });

  return (
    <div class={cardState().shellClass}>
      <div class={cardState().cardClass}>
        <For each={visibleSections()}>
          {(sectionId) => {
            const state = cardState();
            if (sectionId === "badges") {
              return <WorkflowRailBadgeSection onToggleFamily={props.onToggleFamily} state={state} />;
            }
            if (sectionId === "content") {
              return <WorkflowRailContentSection onLoadWorkflow={props.onLoadWorkflow} state={state} />;
            }
            return <WorkflowRailSiblingsSection onLoadWorkflow={props.onLoadWorkflow} state={state} />;
          }}
        </For>
      </div>
    </div>
  );
}
