// @locs-version: 1.0
import {
  approvalDecisionResultSummary,
  approvalStatusLabel,
} from "afp-ts/continuity";
import { Show } from "solid-js";

type ApprovalDecisionContext =
  | "generic"
  | "queued_execution"
  | "shell_command"
  | "outbound_send"
  | "export_generation"
  | "change_proposal"
  | "change_set";

const APPROVAL_NOTICE_TONE_CLASS = {
  approved: "border-emerald-400/30 bg-emerald-400/8 text-emerald-300",
  rejected: "border-red-400/30 bg-red-400/8 text-red-300",
} as const;
const APPROVAL_NOTICE_BASE_CLASS = "space-y-2 rounded-xl border px-4 py-3 text-sm font-medium";
const APPROVAL_NOTICE_HEADER_CLASS = "flex flex-wrap items-center gap-2";
const APPROVAL_NOTICE_SUMMARY_CLASS = "text-xs opacity-80";
const APPROVAL_NOTICE_DETAIL_BASE_CLASS = "font-mono text-xs opacity-70";

export function ApprovalDecisionNotice(props: {
  decision: "approved" | "rejected";
  context?: ApprovalDecisionContext;
  detail?: string | null;
  class?: string;
  detailClass?: string;
}) {
  const decision = () => props.decision;
  const context = () => props.context;
  const detailText = () => props.detail ?? null;
  const className = () => props.class ?? "";
  const detailClassName = () => props.detailClass ?? "";
  const noticeState = () => {
    const currentDecision = decision();
    const detail = detailText();
    return {
      statusLabelText: approvalStatusLabel(currentDecision),
      resultSummaryText: approvalDecisionResultSummary({
        decision: currentDecision,
        context: context(),
      }),
      showDetailText: Boolean(detail),
      detailText: detail,
      noticeClass: `${APPROVAL_NOTICE_BASE_CLASS} ${APPROVAL_NOTICE_TONE_CLASS[currentDecision]} ${className()}`.trim(),
      detailTextClass: `${APPROVAL_NOTICE_DETAIL_BASE_CLASS} ${detailClassName()}`.trim(),
    };
  };

  return (
    <div class={noticeState().noticeClass}>
      <div class={APPROVAL_NOTICE_HEADER_CLASS}>
        <span>{noticeState().statusLabelText}</span>
        <Show when={noticeState().showDetailText}>
          <span class={noticeState().detailTextClass}>
            {noticeState().detailText}
          </span>
        </Show>
      </div>
      <p class={APPROVAL_NOTICE_SUMMARY_CLASS}>
        {noticeState().resultSummaryText}
      </p>
    </div>
  );
}
