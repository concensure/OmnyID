// @locs-version: 1.0
import { Show } from "solid-js";
import UsageRuntimeRemediationEmptyState from "@/components/UsageRuntimeRemediationEmptyState";
import UsageRuntimeRemediationRow from "@/components/UsageRuntimeRemediationRow";
import type { OperatorRuntimeRemediationFilter } from "@/lib/operatorRuntimeRemediationLocalState";

type RuntimeRemediationRecoveryAction = {
  filter: OperatorRuntimeRemediationFilter;
  label: string;
};

type RuntimeRemediationRowModel = {
  entry: unknown;
  rowModel: unknown;
  receiptMetaLine: string;
  executionModeLabel: string;
  artifactSummaryLine: string | null;
  pressureLine: string | null;
  completedAtLabel: string | null;
  outcomeNoteDraft: string;
  proofReferenceDraft: string;
};

export type UsageRuntimeRemediationFeedProps = {
  rows: RuntimeRemediationRowModel[];
  emptyMessage: string;
  totalCount: number;
  issueReceiptBusy: boolean;
  recoveryActions: RuntimeRemediationRecoveryAction[];
  onIssueReceipt: () => void;
  onSelectFilter: (filter: OperatorRuntimeRemediationFilter) => void;
  onPinSummary: (receiptId: string | null) => void;
  onCopyCommand: (command: string | null | undefined) => void;
  onOutcomeDraftChange: (receiptId: string, value: string) => void;
  onProofDraftChange: (receiptId: string, value: string) => void;
  onCompleteReceipt: (receiptId: string) => void;
  onClearDraft: (receiptId: string) => void;
};

export default function UsageRuntimeRemediationFeed(props: UsageRuntimeRemediationFeedProps) {
  return (
    <Show
      when={props.rows.length > 0}
      fallback={(
        <UsageRuntimeRemediationEmptyState
          message={props.emptyMessage}
          totalCount={props.totalCount}
          issueReceiptBusy={props.issueReceiptBusy}
          recoveryActions={props.recoveryActions}
          onIssueReceipt={props.onIssueReceipt}
          onSelectFilter={props.onSelectFilter}
        />
      )}
    >
      <div class="mt-3 space-y-2">
        {props.rows.map((row) => (
          <UsageRuntimeRemediationRow
            entry={row.entry as never}
            rowModel={row.rowModel as never}
            receiptMetaLine={row.receiptMetaLine}
            executionModeLabel={row.executionModeLabel}
            artifactSummaryLine={row.artifactSummaryLine}
            pressureLine={row.pressureLine}
            completedAtLabel={row.completedAtLabel}
            outcomeNoteDraft={row.outcomeNoteDraft}
            proofReferenceDraft={row.proofReferenceDraft}
            onPinSummary={props.onPinSummary}
            onCopyCommand={props.onCopyCommand}
            onOutcomeDraftChange={props.onOutcomeDraftChange}
            onProofDraftChange={props.onProofDraftChange}
            onCompleteReceipt={props.onCompleteReceipt}
            onClearDraft={props.onClearDraft}
          />
        ))}
      </div>
    </Show>
  );
}
