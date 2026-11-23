// @locs-version: 1.0
import { For } from "solid-js";
import {
  approvalDecisionActionTitle,
  approvalDecisionLabel,
} from "afp-ts/continuity";

type ApprovalDecisionContext =
  | "generic"
  | "export_generation"
  | "outbound_send"
  | "change_proposal"
  | "change_set";

const DEFAULT_APPROVE_BUTTON_CLASS =
  "rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50";
const DEFAULT_REJECT_BUTTON_CLASS =
  "rounded-xl border border-outline-variant bg-surface px-4 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-low disabled:opacity-50";
const APPROVAL_DECISION_BUTTONS_CONTAINER_CLASS = "flex gap-2";
const APPROVAL_DECISION_BUSY_LABEL = "Processing...";

export function ApprovalDecisionButtons(props: {
  onApprove: () => void;
  onReject: () => void;
  showReject?: boolean;
  busy?: boolean;
  approveDisabled?: boolean;
  rejectDisabled?: boolean;
  approveContext?: ApprovalDecisionContext;
  busyLabel?: string;
  class?: string;
  approveClass?: string;
  rejectClass?: string;
}) {
  const approveContext = () => props.approveContext;
  const busyLabel = () => props.busyLabel ?? APPROVAL_DECISION_BUSY_LABEL;
  const showReject = () => props.showReject ?? true;
  const busy = () => props.busy ?? false;
  const approveDisabled = () => props.approveDisabled ?? false;
  const rejectDisabled = () => props.rejectDisabled ?? false;
  const containerClass = () => props.class ?? APPROVAL_DECISION_BUTTONS_CONTAINER_CLASS;
  const approveButtonClass = () => props.approveClass ?? DEFAULT_APPROVE_BUTTON_CLASS;
  const rejectButtonClass = () => props.rejectClass ?? DEFAULT_REJECT_BUTTON_CLASS;
  const buttonState = () => {
    const busyState = busy();
    const approveLabelText = approvalDecisionLabel("approved", approveContext());
    const buttonItems = [
      {
        key: "approve",
        title: approvalDecisionActionTitle("approved", approveContext()),
        label: busyState ? busyLabel() : approveLabelText,
        className: approveButtonClass(),
        disabled: busyState || approveDisabled(),
        onClick: props.onApprove,
      },
    ];
    if (showReject()) {
      buttonItems.push({
        key: "reject",
        title: approvalDecisionActionTitle("rejected"),
        label: approvalDecisionLabel("rejected"),
        className: rejectButtonClass(),
        disabled: busyState || rejectDisabled(),
        onClick: props.onReject,
      });
    }

    return {
      busyState,
      containerClass: containerClass(),
      buttonItems,
    };
  };

  return (
    <div class={buttonState().containerClass}>
      <For each={buttonState().buttonItems}>
        {(item) => (
          <button
            type="button"
            disabled={item.disabled}
            onClick={item.onClick}
            title={item.title}
            class={item.className}
          >
            {item.label}
          </button>
        )}
      </For>
    </div>
  );
}
