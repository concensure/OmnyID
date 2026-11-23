import test from "node:test";
import assert from "node:assert/strict";

import type { OperatorRuntimeRemediationReceipt } from "../src/lib/api.ts";
import {
  countRuntimeRemediationDraftReceipts,
  clearRuntimeRemediationDraftEntry,
  filterOperatorRuntimeRemediationEntries,
  findRuntimeRemediationReceiptById,
  hasRuntimeRemediationCompletionDraft,
  nextRuntimeRemediationFilterAfterCompletion,
  nextRuntimeRemediationFilterAfterDraftsChange,
  prioritizeRuntimeRemediationEntriesWithDrafts,
  pruneRuntimeRemediationDraftMap,
  readRuntimeRemediationEmptyStateMessage,
  readRuntimeRemediationEntryBadges,
  readRuntimeRemediationExecutionModeLabel,
  readFeaturedRuntimeRemediationDraftActions,
  readFeaturedRuntimeRemediationActions,
  readFeaturedRuntimeRemediationCardModel,
  readFeaturedRuntimeRemediationSectionModel,
  readFeaturedRuntimeRemediationHeading,
  readFeaturedRuntimeRemediationSourceLabel,
  readRuntimeRemediationCompletionForm,
  readRuntimeRemediationApprovalLabel,
  readRuntimeRemediationFilterOptions,
  readRuntimeRemediationFeedRow,
  readRuntimeRemediationFilterForReceipt,
  readRuntimeRemediationHistorySummary,
  readRuntimeRemediationHiddenNotice,
  readRuntimeRemediationHistoryPanelModel,
  readRuntimeRemediationLifecycleLabel,
  readRuntimeRemediationNoticeStripModel,
  readRuntimeRemediationRowModel,
  readRuntimeRemediationRowActions,
  readRuntimeRemediationRecoveryFilterActions,
  readRuntimeRemediationQueueLabelForReceipt,
  readRuntimeRemediationRetentionSummary,
  readRuntimeRemediationSummaryPinLabel,
  runtimeRemediationReceiptsShareId,
  selectFeaturedRuntimeRemediationReceipt,
  sortOperatorRuntimeRemediationEntries,
} from "../src/lib/operatorRuntimeRemediationViewState.ts";

function receipt(
  receiptId: string,
  overrides: Partial<OperatorRuntimeRemediationReceipt> = {},
): OperatorRuntimeRemediationReceipt {
  return {
    ok: true,
    action: "issue_cleanup_receipt",
    receipt_id: receiptId,
    lifecycle_status: "issued",
    issued_at: "2026-08-28T10:00:00Z",
    execution_mode: "manual_operator_shell",
    approval_required: true,
    summary: receiptId,
    command: "./scripts/oracle-runtime-cleanup-execute.ps1 -Apply",
    source: null,
    guidance_status: null,
    pressure_status: null,
    pressure_total_rows: null,
    cleanup_mode: null,
    artifact_generated_at: null,
    note: null,
    completed_at: null,
    outcome_note: null,
    proof_reference: null,
    ...overrides,
  };
}

test("sortOperatorRuntimeRemediationEntries keeps open receipts first and newest first within each group", () => {
  const sorted = sortOperatorRuntimeRemediationEntries([
    receipt("completed-older", {
      lifecycle_status: "completed",
      issued_at: "2026-08-28T09:00:00Z",
      completed_at: "2026-08-28T11:00:00Z",
    }),
    receipt("open-older", {
      issued_at: "2026-08-28T08:00:00Z",
    }),
    receipt("completed-newer", {
      lifecycle_status: "completed",
      issued_at: "2026-08-28T10:30:00Z",
      completed_at: "2026-08-28T12:00:00Z",
    }),
    receipt("open-newer", {
      issued_at: "2026-08-28T10:45:00Z",
    }),
  ]);

  assert.deepEqual(
    sorted.map((entry) => entry.receipt_id),
    ["open-newer", "open-older", "completed-newer", "completed-older"],
  );
});

test("filterOperatorRuntimeRemediationEntries applies view mode after sorting", () => {
  const entries = [
    receipt("completed", {
      lifecycle_status: "completed",
      completed_at: "2026-08-28T12:00:00Z",
    }),
    receipt("open"),
  ];

  assert.deepEqual(filterOperatorRuntimeRemediationEntries(entries, "open").map((entry) => entry.receipt_id), ["open"]);
  assert.deepEqual(
    filterOperatorRuntimeRemediationEntries(entries, "completed").map((entry) => entry.receipt_id),
    ["completed"],
  );
  assert.deepEqual(filterOperatorRuntimeRemediationEntries(entries, "all").map((entry) => entry.receipt_id), ["open", "completed"]);
  assert.deepEqual(
    filterOperatorRuntimeRemediationEntries(entries, "drafts", {
      outcomeNotes: { open: "verified" },
      proofReferences: {},
    }).map((entry) => entry.receipt_id),
    ["open"],
  );
});

test("pruneRuntimeRemediationDraftMap removes completed and missing receipt drafts", () => {
  const drafts = {
    "open-1": "verified",
    "completed-1": "done",
    "missing-1": "stale",
    "blank-open": "   ",
  };
  const entries = [
    receipt("open-1"),
    receipt("blank-open"),
    receipt("completed-1", {
      lifecycle_status: "completed",
      completed_at: "2026-08-28T12:00:00Z",
    }),
  ];

  assert.deepEqual(pruneRuntimeRemediationDraftMap(drafts, entries), {
    "open-1": "verified",
  });
});

test("nextRuntimeRemediationFilterAfterCompletion flips open filter to completed when the last open receipt closes", () => {
  const entries = [
    receipt("open-1"),
    receipt("completed-1", {
      lifecycle_status: "completed",
      completed_at: "2026-08-28T12:00:00Z",
    }),
  ];

  assert.equal(nextRuntimeRemediationFilterAfterCompletion("open", entries, "open-1"), "completed");
  assert.equal(nextRuntimeRemediationFilterAfterCompletion("completed", entries, "open-1"), "completed");
});

test("nextRuntimeRemediationFilterAfterDraftsChange returns to open when no draft-backed receipts remain", () => {
  assert.equal(
    nextRuntimeRemediationFilterAfterDraftsChange("drafts", {
      outcomeNotes: { "receipt-1": "verified" },
      proofReferences: {},
    }),
    "drafts",
  );
  assert.equal(
    nextRuntimeRemediationFilterAfterDraftsChange("drafts", {
      outcomeNotes: {},
      proofReferences: {},
    }),
    "open",
  );
  assert.equal(
    nextRuntimeRemediationFilterAfterDraftsChange("completed", {
      outcomeNotes: {},
      proofReferences: {},
    }),
    "completed",
  );
});

test("findRuntimeRemediationReceiptById returns the matching history entry when present", () => {
  const entries = [
    receipt("open-1"),
    receipt("completed-1", {
      lifecycle_status: "completed",
      completed_at: "2026-08-28T12:00:00Z",
      outcome_note: "Applied bounded cleanup and verified WAL pressure dropped.",
    }),
  ];

  assert.equal(findRuntimeRemediationReceiptById(entries, "completed-1")?.outcome_note, "Applied bounded cleanup and verified WAL pressure dropped.");
  assert.equal(findRuntimeRemediationReceiptById(entries, "missing"), null);
});

test("hasRuntimeRemediationCompletionDraft returns true when either draft field is present", () => {
  assert.equal(
    hasRuntimeRemediationCompletionDraft({
      receiptId: "receipt-1",
      outcomeNotes: { "receipt-1": "verified" },
      proofReferences: {},
    }),
    true,
  );
  assert.equal(
    hasRuntimeRemediationCompletionDraft({
      receiptId: "receipt-1",
      outcomeNotes: {},
      proofReferences: { "receipt-1": "ticket-22" },
    }),
    true,
  );
  assert.equal(
    hasRuntimeRemediationCompletionDraft({
      receiptId: "receipt-1",
      outcomeNotes: {},
      proofReferences: {},
    }),
    false,
  );
});

test("clearRuntimeRemediationDraftEntry removes only the targeted draft key", () => {
  assert.deepEqual(
    clearRuntimeRemediationDraftEntry(
      {
        "receipt-1": "verified",
        "receipt-2": "ticket-22",
      },
      "receipt-1",
    ),
    { "receipt-2": "ticket-22" },
  );
  assert.deepEqual(
    clearRuntimeRemediationDraftEntry(
      {
        "receipt-2": "ticket-22",
      },
      "missing",
    ),
    { "receipt-2": "ticket-22" },
  );
});

test("countRuntimeRemediationDraftReceipts counts unique receipt ids across both draft maps", () => {
  assert.equal(
    countRuntimeRemediationDraftReceipts({
      outcomeNotes: {
        "receipt-1": "verified",
        "receipt-2": "done",
      },
      proofReferences: {
        "receipt-2": "ticket-22",
        "receipt-3": "artifact-9",
      },
    }),
    3,
  );
});

test("readRuntimeRemediationFilterForReceipt resolves drafts before lifecycle state", () => {
  assert.equal(
    readRuntimeRemediationFilterForReceipt({
      receipt: receipt("open-1"),
      outcomeNotes: { "open-1": "verified" },
      proofReferences: {},
    }),
    "drafts",
  );
  assert.equal(
    readRuntimeRemediationFilterForReceipt({
      receipt: receipt("completed-1", {
        lifecycle_status: "completed",
        completed_at: "2026-08-28T12:00:00Z",
      }),
      outcomeNotes: {},
      proofReferences: {},
    }),
    "completed",
  );
  assert.equal(
    readRuntimeRemediationFilterForReceipt({
      receipt: receipt("open-2"),
      outcomeNotes: {},
      proofReferences: {},
    }),
    "open",
  );
});

test("readRuntimeRemediationQueueLabelForReceipt maps resolved filters to action labels", () => {
  assert.equal(
    readRuntimeRemediationQueueLabelForReceipt({
      receipt: receipt("open-1"),
      outcomeNotes: { "open-1": "verified" },
      proofReferences: {},
    }),
    "Show in drafts",
  );
  assert.equal(
    readRuntimeRemediationQueueLabelForReceipt({
      receipt: receipt("completed-1", {
        lifecycle_status: "completed",
        completed_at: "2026-08-28T12:00:00Z",
      }),
      outcomeNotes: {},
      proofReferences: {},
    }),
    "Show in completed",
  );
  assert.equal(
    readRuntimeRemediationQueueLabelForReceipt({
      receipt: receipt("open-2"),
      outcomeNotes: {},
      proofReferences: {},
    }),
    "Show in open queue",
  );
});

test("runtimeRemediationReceiptsShareId compares normalized receipt ids only", () => {
  assert.equal(runtimeRemediationReceiptsShareId(receipt("receipt-1"), receipt("receipt-1")), true);
  assert.equal(runtimeRemediationReceiptsShareId(receipt("receipt-1"), receipt("receipt-2")), false);
  assert.equal(runtimeRemediationReceiptsShareId(receipt("receipt-1"), null), false);
});

test("readRuntimeRemediationHistorySummary formats the operator counts line", () => {
  assert.equal(
    readRuntimeRemediationHistorySummary({
      openCount: 4,
      completedCount: 7,
      draftCount: 2,
      totalCount: 11,
    }),
    "4 open | 7 completed | 2 with drafts | 11 total",
  );
});

test("readRuntimeRemediationEmptyStateMessage distinguishes empty history from filtered emptiness", () => {
  assert.equal(
    readRuntimeRemediationEmptyStateMessage({
      totalCount: 0,
      filter: "open",
    }),
    "No remediation receipts have been issued by this operator yet.",
  );
  assert.equal(
    readRuntimeRemediationEmptyStateMessage({
      totalCount: 5,
      filter: "drafts",
    }),
    "No remediation receipts currently have saved local completion drafts.",
  );
  assert.equal(
    readRuntimeRemediationEmptyStateMessage({
      totalCount: 5,
      filter: "completed",
    }),
    "No completed remediation receipts match the current filter.",
  );
});

test("readRuntimeRemediationRetentionSummary formats bounded retention copy", () => {
  assert.deepEqual(
    readRuntimeRemediationRetentionSummary({
      max_event_age_days: 30,
      max_event_rows_per_user: 100,
      rollover_behavior: "oldest_receipts_pruned_first_after_manual_issue",
    }),
    {
      windowLabel: "30 day window",
      rowCapLabel: "Up to 100 receipts per operator",
      rolloverLabel: "oldest receipts pruned first after manual issue",
    },
  );
  assert.equal(readRuntimeRemediationRetentionSummary(null), null);
});

test("readRuntimeRemediationFilterOptions returns the canonical filter chip set", () => {
  assert.deepEqual(
    readRuntimeRemediationFilterOptions({
      openCount: 4,
      completedCount: 7,
      draftCount: 2,
      totalCount: 11,
    }),
    [
      { filter: "open", label: "Open", count: 4 },
      { filter: "completed", label: "Completed", count: 7 },
      { filter: "all", label: "All", count: 11 },
      { filter: "drafts", label: "Drafts", count: 2 },
    ],
  );
});

test("readRuntimeRemediationRecoveryFilterActions only exposes useful fallback filters", () => {
  assert.deepEqual(
    readRuntimeRemediationRecoveryFilterActions({
      totalCount: 0,
      draftCount: 0,
      currentFilter: "open",
    }),
    [],
  );
  assert.deepEqual(
    readRuntimeRemediationRecoveryFilterActions({
      totalCount: 5,
      draftCount: 2,
      currentFilter: "completed",
    }),
    [
      { filter: "open", label: "Show open receipts" },
      { filter: "all", label: "Show all receipts" },
      { filter: "drafts", label: "Show drafted receipts" },
    ],
  );
  assert.deepEqual(
    readRuntimeRemediationRecoveryFilterActions({
      totalCount: 5,
      draftCount: 2,
      currentFilter: "drafts",
    }),
    [
      { filter: "open", label: "Show open receipts" },
      { filter: "all", label: "Show all receipts" },
    ],
  );
});

test("readRuntimeRemediationSummaryPinLabel reflects whether the receipt is pinned", () => {
  assert.equal(readRuntimeRemediationSummaryPinLabel(true), "Pinned in summary");
  assert.equal(readRuntimeRemediationSummaryPinLabel(false), "Show in summary");
});

test("runtime remediation labels humanize stored enum values safely", () => {
  assert.equal(readRuntimeRemediationLifecycleLabel("manual_review_required"), "manual review required");
  assert.equal(readRuntimeRemediationLifecycleLabel(""), "unknown");
  assert.equal(readRuntimeRemediationExecutionModeLabel("manual_operator_shell"), "manual operator shell");
  assert.equal(readRuntimeRemediationExecutionModeLabel(null), "unknown");
});

test("readRuntimeRemediationEntryBadges returns canonical row badges in stable order", () => {
  assert.deepEqual(
    readRuntimeRemediationEntryBadges({
      isPinned: true,
      isLatest: true,
      hasDraft: true,
    }),
    [
      { tone: "featured", label: "Featured in summary" },
      { tone: "draft", label: "Local draft saved" },
    ],
  );
  assert.deepEqual(
    readRuntimeRemediationEntryBadges({
      isPinned: false,
      isLatest: true,
      hasDraft: false,
    }),
    [
      { tone: "latest", label: "Latest operator action" },
    ],
  );
});

test("readFeaturedRuntimeRemediationDraftActions returns the canonical featured draft action set", () => {
  assert.deepEqual(
    readFeaturedRuntimeRemediationDraftActions({
      hasLocalDraft: true,
      canCompleteFromDraft: true,
      completionBusy: false,
    }),
    [
      {
        kind: "complete_from_draft",
        label: "Mark completed from draft",
        tone: "success",
        disabled: false,
      },
      {
        kind: "show_drafts",
        label: "Show drafted receipts",
        tone: "info",
        disabled: false,
      },
      {
        kind: "clear_local_draft",
        label: "Clear local draft",
        tone: "neutral",
        disabled: false,
      },
    ],
  );
  assert.deepEqual(
    readFeaturedRuntimeRemediationDraftActions({
      hasLocalDraft: true,
      canCompleteFromDraft: true,
      completionBusy: true,
    })[0],
    {
      kind: "complete_from_draft",
      label: "Completing...",
      tone: "success",
      disabled: true,
    },
  );
  assert.deepEqual(
    readFeaturedRuntimeRemediationDraftActions({
      hasLocalDraft: false,
      canCompleteFromDraft: false,
      completionBusy: false,
    }),
    [],
  );
});

test("readFeaturedRuntimeRemediationHeading reflects completion and active/latest state", () => {
  assert.equal(
    readFeaturedRuntimeRemediationHeading({
      featuredReceipt: receipt("completed-1", {
        lifecycle_status: "completed",
        completed_at: "2026-08-28T12:00:00Z",
      }),
      latestReceipt: receipt("open-1"),
    }),
    "Featured completed remediation receipt",
  );
  assert.equal(
    readFeaturedRuntimeRemediationHeading({
      featuredReceipt: receipt("open-1"),
      latestReceipt: receipt("open-1"),
    }),
    "Active remediation receipt",
  );
  assert.equal(
    readFeaturedRuntimeRemediationHeading({
      featuredReceipt: receipt("open-2"),
      latestReceipt: receipt("open-1"),
    }),
    "Featured remediation receipt",
  );
});

test("readFeaturedRuntimeRemediationSourceLabel distinguishes pin, latest, and recovery provenance", () => {
  assert.equal(
    readFeaturedRuntimeRemediationSourceLabel({
      pinnedReceiptId: "open-2",
      featuredReceipt: receipt("open-2"),
      latestReceipt: receipt("open-1"),
    }),
    "Pinned from remediation history.",
  );
  assert.equal(
    readFeaturedRuntimeRemediationSourceLabel({
      pinnedReceiptId: null,
      featuredReceipt: receipt("open-1"),
      latestReceipt: receipt("open-1"),
    }),
    "Pinned from the latest operator action.",
  );
  assert.equal(
    readFeaturedRuntimeRemediationSourceLabel({
      pinnedReceiptId: null,
      featuredReceipt: receipt("open-2"),
      latestReceipt: receipt("open-1"),
    }),
    "Recovered from recent remediation history for continuity.",
  );
});

test("readRuntimeRemediationApprovalLabel reflects whether approval was recorded", () => {
  assert.equal(
    readRuntimeRemediationApprovalLabel(receipt("open-1", { approval_required: true })),
    "Explicit operator approval recorded before manual execution.",
  );
  assert.equal(
    readRuntimeRemediationApprovalLabel(receipt("open-1", { approval_required: false })),
    "Approval requirement unavailable.",
  );
});

test("readRuntimeRemediationHiddenNotice formats latest and featured notice models", () => {
  assert.deepEqual(
    readRuntimeRemediationHiddenNotice({
      kind: "latest",
      currentFilter: "completed",
      receipt: receipt("open-1"),
      outcomeNotes: {},
      proofReferences: {},
    }),
    {
      title: "Latest action hidden",
      body: "The most recent operator receipt is outside the current `completed` view.",
      receiptLabel: "open-1",
      actionLabel: "Show in open queue",
      tone: "amber",
    },
  );
  assert.deepEqual(
    readRuntimeRemediationHiddenNotice({
      kind: "featured",
      currentFilter: "open",
      receipt: receipt("completed-1", {
        lifecycle_status: "completed",
        completed_at: "2026-08-28T12:00:00Z",
      }),
      outcomeNotes: {},
      proofReferences: {},
    }),
    {
      title: "Featured receipt hidden",
      body: "The summary card points to a receipt outside the current `open` view.",
      receiptLabel: "completed-1",
      actionLabel: "Show in completed",
      tone: "indigo",
    },
  );
});

test("readRuntimeRemediationNoticeStripModel only returns notices that are actually hidden", () => {
  assert.deepEqual(
    readRuntimeRemediationNoticeStripModel({
      currentFilter: "completed",
      latestReceipt: receipt("open-1"),
      featuredReceipt: receipt("completed-1", {
        lifecycle_status: "completed",
        completed_at: "2026-08-28T12:00:00Z",
      }),
      latestReceiptVisible: false,
      featuredReceiptVisible: true,
      outcomeNotes: {},
      proofReferences: {},
    }),
    {
      latestNotice: {
        title: "Latest action hidden",
        body: "The most recent operator receipt is outside the current `completed` view.",
        receiptLabel: "open-1",
        actionLabel: "Show in open queue",
        tone: "amber",
      },
      featuredNotice: null,
    },
  );
});

test("readFeaturedRuntimeRemediationActions returns queue/copy actions and optional clear-pin", () => {
  assert.deepEqual(
    readFeaturedRuntimeRemediationActions({
      featuredReceipt: receipt("open-1"),
      pinnedReceiptId: null,
      outcomeNotes: {},
      proofReferences: {},
    }),
    [
      { kind: "show_queue", label: "Show in open queue" },
      { kind: "copy_command", label: "Copy command" },
    ],
  );
  assert.deepEqual(
    readFeaturedRuntimeRemediationActions({
      featuredReceipt: receipt("completed-1", {
        lifecycle_status: "completed",
        completed_at: "2026-08-28T12:00:00Z",
      }),
      pinnedReceiptId: "completed-1",
      outcomeNotes: {},
      proofReferences: {},
    }),
    [
      { kind: "show_queue", label: "Show in completed" },
      { kind: "copy_command", label: "Copy command" },
      { kind: "clear_summary_pin", label: "Clear summary pin" },
    ],
  );
});

test("readFeaturedRuntimeRemediationCardModel bundles featured-card view state into one stable model", () => {
  assert.deepEqual(
    readFeaturedRuntimeRemediationCardModel({
      featuredReceipt: receipt("open-1"),
      latestReceipt: receipt("open-2"),
      pinnedReceiptId: "open-1",
      outcomeNotes: { "open-1": "Verified cleanup output." },
      proofReferences: { "open-1": "artifact://cleanup-report" },
      completionBusyReceiptId: "open-1",
    }),
    {
      receiptId: "open-1",
      outcomeDraft: "Verified cleanup output.",
      proofDraft: "artifact://cleanup-report",
      hasLocalDraft: true,
      canCompleteFromDraft: true,
      heading: "Featured remediation receipt",
      sourceLabel: "Pinned from remediation history.",
      approvalLabel: "Explicit operator approval recorded before manual execution.",
      localDraftBadgeLabel: "Local completion draft saved",
      receiptSectionTitle: "Receipt",
      lifecycleSectionTitle: "Lifecycle",
      completionSectionTitle: "Completion",
      localDraftSectionTitle: "Local completion draft",
      proofLabelPrefix: "Proof:",
      draftActions: [
        {
          kind: "complete_from_draft",
          label: "Completing...",
          tone: "success",
          disabled: true,
        },
        {
          kind: "show_drafts",
          label: "Show drafted receipts",
          tone: "info",
          disabled: false,
        },
        {
          kind: "clear_local_draft",
          label: "Clear local draft",
          tone: "neutral",
          disabled: false,
        },
      ],
      actions: [
        { kind: "show_queue", label: "Show in drafts" },
        { kind: "copy_command", label: "Copy command" },
        { kind: "clear_summary_pin", label: "Clear summary pin" },
      ],
    },
  );
});

test("runtime remediation feed-row and featured-section builders preserve mounted section contracts", () => {
  const featuredReceipt = receipt("receipt-1", {
    artifact_generated_at: "2026-08-28T10:05:00Z",
    source: "daemon_heartbeats",
    pressure_total_rows: 42,
    cleanup_mode: "bounded_rollover",
    completed_at: "2026-08-28T10:20:00Z",
  });
  const rowModel = readRuntimeRemediationRowModel({
    receipt: featuredReceipt,
    pinnedReceiptId: "receipt-1",
    latestReceipt: featuredReceipt,
    outcomeNotes: { "receipt-1": "Verified WAL retention dropped." },
    proofReferences: { "receipt-1": "report-22" },
    completionBusyReceiptId: null,
  });
  assert.deepEqual(
    readRuntimeRemediationFeedRow({
      entry: featuredReceipt,
      rowModel,
      receiptMetaLine: "issue cleanup receipt | issued 8/28/2026, 8:00:00 PM",
      executionModeLabel: "manual operator shell",
      artifactSummaryLine: "Updated 8/28/2026, 8:05:00 PM | daemon_heartbeats",
      pressureLine: "42 rows | bounded_rollover",
      completedAtLabel: "8/28/2026, 8:20:00 PM",
      outcomeNoteDraft: "Verified WAL retention dropped.",
      proofReferenceDraft: "report-22",
    }),
    {
      entry: featuredReceipt,
      rowModel,
      receiptMetaLine: "issue cleanup receipt | issued 8/28/2026, 8:00:00 PM",
      executionModeLabel: "manual operator shell",
      artifactSummaryLine: "Updated 8/28/2026, 8:05:00 PM | daemon_heartbeats",
      pressureLine: "42 rows | bounded_rollover",
      completedAtLabel: "8/28/2026, 8:20:00 PM",
      outcomeNoteDraft: "Verified WAL retention dropped.",
      proofReferenceDraft: "report-22",
    },
  );

  const cardModel = readFeaturedRuntimeRemediationCardModel({
    featuredReceipt,
    latestReceipt: featuredReceipt,
    pinnedReceiptId: "receipt-1",
    outcomeNotes: { "receipt-1": "Verified WAL retention dropped." },
    proofReferences: { "receipt-1": "report-22" },
    completionBusyReceiptId: null,
  });
  assert.deepEqual(
    readFeaturedRuntimeRemediationSectionModel({
      featuredReceipt,
      cardModel,
      issuedAtLabel: "8/28/2026, 8:00:00 PM",
      lifecycleLabel: "issued",
      completedAtLabel: "8/28/2026, 8:20:00 PM",
    }),
    {
      receipt: featuredReceipt,
      cardModel,
      issuedAtLabel: "8/28/2026, 8:00:00 PM",
      lifecycleLabel: "issued",
      completedAtLabel: "8/28/2026, 8:20:00 PM",
    },
  );
  assert.equal(
    readFeaturedRuntimeRemediationSectionModel({
      featuredReceipt: null,
      cardModel,
      issuedAtLabel: null,
      lifecycleLabel: "unknown",
      completedAtLabel: null,
    }),
    null,
  );
});

test("readRuntimeRemediationCompletionForm returns canonical form copy and busy state", () => {
  assert.deepEqual(
    readRuntimeRemediationCompletionForm({
      receiptId: "open-1",
      outcomeNotes: { "open-1": "verified cleanup" },
      proofReferences: {},
      completionBusyReceiptId: null,
    }),
    {
      title: "Completion proof",
      outcomePlaceholder: "What was done, what changed, and what was verified?",
      proofPlaceholder: "Proof reference: ticket, artifact path, report link, or notes id",
      submitLabel: "Mark completed",
      submitDisabled: false,
      showClearDraft: true,
      clearDraftLabel: "Clear local draft",
    },
  );
  assert.deepEqual(
    readRuntimeRemediationCompletionForm({
      receiptId: "open-1",
      outcomeNotes: {},
      proofReferences: {},
      completionBusyReceiptId: "open-1",
    }).submitLabel,
    "Completing...",
  );
});

test("readRuntimeRemediationRowActions returns pin and copy actions with pin-aware labeling", () => {
  assert.deepEqual(
    readRuntimeRemediationRowActions({
      receiptId: "open-1",
      pinnedReceiptId: null,
    }),
    [
      { kind: "pin_summary", label: "Show in summary", tone: "neutral" },
      { kind: "copy_command", label: "Copy command", tone: "neutral" },
    ],
  );
  assert.deepEqual(
    readRuntimeRemediationRowActions({
      receiptId: "open-1",
      pinnedReceiptId: "open-1",
    }),
    [
      { kind: "pin_summary", label: "Pinned in summary", tone: "featured" },
      { kind: "copy_command", label: "Copy command", tone: "neutral" },
    ],
  );
});

test("readRuntimeRemediationRowModel bundles row badges, actions, and completion form once", () => {
  assert.deepEqual(
    readRuntimeRemediationRowModel({
      receipt: receipt("open-1"),
      pinnedReceiptId: "open-1",
      latestReceipt: receipt("open-2"),
      outcomeNotes: { "open-1": "verified cleanup" },
      proofReferences: {},
      completionBusyReceiptId: null,
    }),
    {
      badges: [
        { tone: "featured", label: "Featured in summary" },
        { tone: "draft", label: "Local draft saved" },
      ],
      actions: [
        { kind: "pin_summary", label: "Pinned in summary", tone: "featured" },
        { kind: "copy_command", label: "Copy command", tone: "neutral" },
      ],
      completionForm: {
        title: "Completion proof",
        outcomePlaceholder: "What was done, what changed, and what was verified?",
        proofPlaceholder: "Proof reference: ticket, artifact path, report link, or notes id",
        submitLabel: "Mark completed",
        submitDisabled: false,
        showClearDraft: true,
        clearDraftLabel: "Clear local draft",
      },
    },
  );
});

test("readRuntimeRemediationHistoryPanelModel bundles header, filter, retention, and notice-strip state", () => {
  assert.deepEqual(
    readRuntimeRemediationHistoryPanelModel({
      openCount: 4,
      completedCount: 7,
      draftCount: 2,
      totalCount: 11,
      currentFilter: "completed",
      retention: {
        max_event_age_days: 30,
        max_event_rows_per_user: 100,
        rollover_behavior: "oldest_receipts_pruned_first_after_manual_issue",
      },
      latestReceipt: receipt("open-1"),
      featuredReceipt: receipt("completed-1", {
        lifecycle_status: "completed",
        completed_at: "2026-08-28T12:00:00Z",
      }),
      latestReceiptVisible: false,
      featuredReceiptVisible: true,
      outcomeNotes: {},
      proofReferences: {},
    }),
    {
      historySummary: "4 open | 7 completed | 2 with drafts | 11 total",
      filterOptions: [
        { filter: "open", label: "Open", count: 4 },
        { filter: "completed", label: "Completed", count: 7 },
        { filter: "all", label: "All", count: 11 },
        { filter: "drafts", label: "Drafts", count: 2 },
      ],
      recoveryActions: [
        { filter: "open", label: "Show open receipts" },
        { filter: "all", label: "Show all receipts" },
        { filter: "drafts", label: "Show drafted receipts" },
      ],
      retentionSummary: {
        windowLabel: "30 day window",
        rowCapLabel: "Up to 100 receipts per operator",
        rolloverLabel: "oldest receipts pruned first after manual issue",
      },
      noticeStrip: {
        latestNotice: {
          title: "Latest action hidden",
          body: "The most recent operator receipt is outside the current `completed` view.",
          receiptLabel: "open-1",
          actionLabel: "Show in open queue",
          tone: "amber",
        },
        featuredNotice: null,
      },
    },
  );
});

test("prioritizeRuntimeRemediationEntriesWithDrafts floats draft-backed receipts while preserving existing order otherwise", () => {
  const entries = [
    receipt("open-3", {
      issued_at: "2026-08-28T12:00:00Z",
    }),
    receipt("open-2", {
      issued_at: "2026-08-28T11:00:00Z",
    }),
    receipt("open-1", {
      issued_at: "2026-08-28T10:00:00Z",
    }),
  ];

  assert.deepEqual(
    prioritizeRuntimeRemediationEntriesWithDrafts({
      entries,
      outcomeNotes: { "open-1": "verified" },
      proofReferences: {},
    }).map((entry) => entry.receipt_id),
    ["open-1", "open-3", "open-2"],
  );
  assert.deepEqual(
    prioritizeRuntimeRemediationEntriesWithDrafts({
      entries,
      outcomeNotes: {},
      proofReferences: {},
    }).map((entry) => entry.receipt_id),
    ["open-3", "open-2", "open-1"],
  );
});

test("selectFeaturedRuntimeRemediationReceipt prefers the active receipt when it still exists", () => {
  const entries = [
    receipt("open-2", {
      issued_at: "2026-08-28T11:00:00Z",
    }),
    receipt("open-1", {
      issued_at: "2026-08-28T10:00:00Z",
      outcome_note: "Pinned receipt",
    }),
  ];

  assert.equal(
    selectFeaturedRuntimeRemediationReceipt({
      activeReceipt: receipt("open-1"),
      pinnedReceiptId: null,
      entries,
      filter: "open",
      outcomeNotes: {},
      proofReferences: {},
    })?.receipt_id,
    "open-1",
  );
});

test("selectFeaturedRuntimeRemediationReceipt falls back to the first filtered receipt, then any receipt", () => {
  const entries = [
    receipt("open-1", {
      issued_at: "2026-08-28T11:00:00Z",
    }),
    receipt("completed-1", {
      lifecycle_status: "completed",
      completed_at: "2026-08-28T12:00:00Z",
      issued_at: "2026-08-28T10:00:00Z",
    }),
  ];

  assert.equal(
    selectFeaturedRuntimeRemediationReceipt({
      activeReceipt: null,
      pinnedReceiptId: null,
      entries,
      filter: "open",
      outcomeNotes: {},
      proofReferences: {},
    })?.receipt_id,
    "open-1",
  );
  assert.equal(
    selectFeaturedRuntimeRemediationReceipt({
      activeReceipt: null,
      pinnedReceiptId: null,
      entries: [entries[1]!],
      filter: "open",
      outcomeNotes: {},
      proofReferences: {},
    })?.receipt_id,
    "completed-1",
  );
});

test("selectFeaturedRuntimeRemediationReceipt falls back using draft-prioritized ordering within the current filter", () => {
  const entries = [
    receipt("open-newer", {
      issued_at: "2026-08-28T12:00:00Z",
    }),
    receipt("open-older", {
      issued_at: "2026-08-28T10:00:00Z",
    }),
  ];

  assert.equal(
    selectFeaturedRuntimeRemediationReceipt({
      activeReceipt: null,
      pinnedReceiptId: null,
      entries,
      filter: "open",
      outcomeNotes: { "open-older": "verified cleanup output" },
      proofReferences: {},
    })?.receipt_id,
    "open-older",
  );
});

test("selectFeaturedRuntimeRemediationReceipt prefers a pinned receipt from history", () => {
  const entries = [
    receipt("open-1", {
      issued_at: "2026-08-28T11:00:00Z",
    }),
    receipt("completed-1", {
      lifecycle_status: "completed",
      issued_at: "2026-08-28T10:00:00Z",
      completed_at: "2026-08-28T12:00:00Z",
    }),
  ];

  assert.equal(
    selectFeaturedRuntimeRemediationReceipt({
      activeReceipt: receipt("open-1"),
      pinnedReceiptId: "completed-1",
      entries,
      filter: "open",
      outcomeNotes: {},
      proofReferences: {},
    })?.receipt_id,
    "completed-1",
  );
});
