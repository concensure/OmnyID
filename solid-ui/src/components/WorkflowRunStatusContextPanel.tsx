// @locs-version: 1.0
import { createMemo, For } from "solid-js";
import type { JSXElement } from "solid-js";
import { workflowStatusContextDecisionLineItems } from "@/lib/workflowApprovalPanelState";

type WorkflowRunStatusContextPanelProps = {
  approvalDecisionConsequence: string | null;
  approvalDecisionLabel: string | null;
  approvalDecisionNote: string | null;
  approvalDecisionPointId: string | null;
  approvalReason: string | null;
  pausedAtLabel: string | null;
  showWaitReason: boolean;
  showWaitResumeKind: boolean;
  skillCapsuleOutcomeKind: string | null;
  skillCapsuleReceiptStatus: string | null;
  waitReason: string | null;
  waitResumeFamily: string | null;
  waitResumeKind: string | null;
};

type WorkflowStatusContextLineItem = {
  className: string;
  key: string;
  label: string;
};

type WorkflowRunStatusContextPanelState = {
  lineItems: WorkflowStatusContextLineItem[];
  showLines: boolean;
};

type WorkflowRunStatusContextSectionId = "lines";

const WORKFLOW_STATUS_LINE_PAUSED_CLASS =
  "mt-3 text-xs font-medium uppercase tracking-[0.14em] text-amber-700";
const WORKFLOW_STATUS_LINE_APPROVAL_REASON_CLASS =
  "mt-2 text-sm text-amber-900";
const WORKFLOW_STATUS_LINE_WAIT_REASON_CLASS =
  "mt-2 text-sm text-sky-900";
const WORKFLOW_STATUS_LINE_SKILL_CAPSULE_CLASS =
  "mt-2 text-xs uppercase tracking-[0.14em] text-violet-700";
const WORKFLOW_STATUS_LINE_DECISION_CLASS =
  "mt-2 text-xs uppercase tracking-[0.14em] text-amber-700";
const WORKFLOW_STATUS_LINE_WAIT_RESUME_KIND_CLASS =
  "mt-2 text-xs uppercase tracking-[0.14em] text-sky-700";

function workflowRunStatusContextPanelState(
  props: WorkflowRunStatusContextPanelProps,
): WorkflowRunStatusContextPanelState {
  const lineItems: WorkflowStatusContextLineItem[] = [
    ...(props.pausedAtLabel
      ? [{ className: WORKFLOW_STATUS_LINE_PAUSED_CLASS, key: "paused", label: `Paused at ${props.pausedAtLabel}` }]
      : []),
    ...(props.approvalReason
      ? [{ className: WORKFLOW_STATUS_LINE_APPROVAL_REASON_CLASS, key: "approval_reason", label: props.approvalReason }]
      : []),
    ...(props.showWaitReason && props.waitReason
      ? [{ className: WORKFLOW_STATUS_LINE_WAIT_REASON_CLASS, key: "wait_reason", label: props.waitReason }]
      : []),
    ...(props.skillCapsuleOutcomeKind
      ? [{
        className: WORKFLOW_STATUS_LINE_SKILL_CAPSULE_CLASS,
        key: "skill_outcome",
        label: `Skill capsule outcome ${props.skillCapsuleOutcomeKind.replaceAll("_", " ")}`,
      }]
      : []),
    ...(props.skillCapsuleReceiptStatus
      ? [{
        className: WORKFLOW_STATUS_LINE_SKILL_CAPSULE_CLASS,
        key: "skill_receipt",
        label: `Skill capsule receipt ${props.skillCapsuleReceiptStatus.replaceAll("_", " ")}`,
      }]
      : []),
    ...workflowStatusContextDecisionLineItems({
      approvalDecisionPointId: props.approvalDecisionPointId,
      approvalDecisionLabel: props.approvalDecisionLabel,
      approvalDecisionConsequence: props.approvalDecisionConsequence,
      approvalDecisionNote: props.approvalDecisionNote,
      decisionClassName: WORKFLOW_STATUS_LINE_DECISION_CLASS,
      detailClassName: WORKFLOW_STATUS_LINE_APPROVAL_REASON_CLASS,
    }),
    ...(props.showWaitResumeKind && (props.waitResumeFamily || props.waitResumeKind)
      ? [{
        className: WORKFLOW_STATUS_LINE_WAIT_RESUME_KIND_CLASS,
        key: "wait_resume_kind",
        label: `${(props.waitResumeFamily ?? "timer").replaceAll("_", " ")}${props.waitResumeKind ? ` - ${props.waitResumeKind.replaceAll("_", " ")}` : ""}`,
      }]
      : []),
  ];

  return {
    lineItems,
    showLines: lineItems.length > 0,
  };
}

function WorkflowRunStatusContextLinesSection(props: {
  state: WorkflowRunStatusContextPanelState;
}): JSXElement {
  return (
    <>
      <For each={props.state.lineItems}>
        {(item) => <p class={item.className}>{item.label}</p>}
      </For>
    </>
  );
}

export function WorkflowRunStatusContextPanel(props: WorkflowRunStatusContextPanelProps) {
  const panelState = createMemo(() => workflowRunStatusContextPanelState(props));

  const visibleSections = createMemo<WorkflowRunStatusContextSectionId[]>(() => {
    const sections: WorkflowRunStatusContextSectionId[] = [];
    if (panelState().showLines) {
      sections.push("lines");
    }
    return sections;
  });

  return (
    <>
      <For each={visibleSections()}>
        {(sectionId) => {
          const state = panelState();
          if (sectionId === "lines") {
            return <WorkflowRunStatusContextLinesSection state={state} />;
          }
          return null;
        }}
      </For>
    </>
  );
}
