import { createSignal } from "solid-js";
import { render } from "solid-js/web";

import "../../src/index.css";
import { ActiveTasksDecisionView } from "../../src/components/ActiveTasksDecisionView";
import { WeddingBudgetEvidenceHub } from "../../src/components/WeddingBudgetEvidenceHub";
import { WeddingMobilePage } from "../../src/components/WeddingMobilePage";
import type { DashboardBootstrap } from "../../src/lib/api";
import type { WeddingResponseWorkspaceViewState } from "../../src/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceMenuId } from "../../src/lib/weddingWorkspaceMenuState";

const bootstrap = {
  messages: [
    {
      id: "task:venue",
      thread_id: "thread:venue",
      type: "task",
      subtype: null,
      timestamp: "2026-10-20T00:00:00.000Z",
      content: {
        task_id: "task:venue",
        title: "Choose and book the venue",
        description: "Compare the final venue choices before booking.",
        status: "in_progress",
        decisions: [
          { id: "date", title: "Choose a date", options: ["18 September", "25 September"], selected_option_label: "18 September" },
          { id: "venue", title: "Choose a venue", options: ["Garden Hall", "Harbour House"], selected_option_label: "Harbour House" },
        ],
      },
      metadata: {},
      encryption: null,
    },
    {
      id: "task:favours",
      thread_id: "thread:favours",
      type: "task",
      subtype: null,
      timestamp: "2026-10-20T00:01:00.000Z",
      content: { task_id: "task:favours", title: "Choose wedding favours", status: "skipped" },
      metadata: {},
      encryption: null,
    },
  ],
} as unknown as DashboardBootstrap;

const weddingState = {
  afpMessages: [],
  artifactPreviews: [
    {
      artifactId: "artifact:quote",
      title: "Harbour Photos quotation",
      kind: "vendor_table",
      category: "Vendors",
      createdAt: 1,
      approvalState: "approved",
      metadataLabels: ["quote"],
      sourceLabels: ["Harbour Photos"],
      evidenceSummary: { statusLabel: "Linked", sourceCountLabel: "1 source", warningLabel: null, labels: [] },
    },
    {
      artifactId: "artifact:contract",
      title: "Garden Hall booking contract",
      kind: "legal",
      category: "Legal",
      createdAt: 2,
      approvalState: "pending_user_approval",
      metadataLabels: [],
      sourceLabels: ["Uploaded contract"],
      evidenceSummary: { statusLabel: "Linked", sourceCountLabel: "1 source", warningLabel: null, labels: [] },
    },
  ],
  budgetTracking: {
    lineItems: [{ id: "photos", linkedArtifactId: "artifact:quote", vendorName: "Harbour Photos", categoryLabel: "Photography", amount: 4500, currency: "AUD", priceStatus: "quoted", sourceLabel: "Quotation", confidenceLabel: "Quoted", warningLabels: [], rowCells: [] }],
    categoryRollups: [{ categoryLabel: "Photography", amount: 4500, itemCount: 1, projectedCount: 0, quotedCount: 1, unknownCount: 0, currency: "AUD" }],
    paymentTaskCandidates: [{ id: "deposit", title: "Pay venue deposit", categoryLabel: "Venue", vendorName: "Garden Hall", dueAmountLabel: "$2,000", dueDateLabel: "12 Nov", dueAt: "2026-11-12", priorityLabel: "High", reasonLabel: "Deposit due", sourceLabel: "Contract", linkedArtifactId: "artifact:contract" }],
    budgetAllocation: [],
    budgetTargetAmount: 30000,
    remainingAmount: 25500,
    overBudgetAmount: 0,
    budgetUtilizationPercent: 15,
    totalProjectedAmount: 0,
    totalQuotedAmount: 4500,
    totalKnownAmount: 4500,
    unknownCount: 0,
    projectedCount: 0,
    quotedCount: 1,
  },
} as unknown as WeddingResponseWorkspaceViewState;

function Fixture() {
  const [activeMenu, setActiveMenu] = createSignal<WeddingWorkspaceMenuId>("budget");
  const [openedDocument, setOpenedDocument] = createSignal("None");
  return (
    <WeddingMobilePage title="Plan details" activeMenu={activeMenu()} onSelectMenu={setActiveMenu}>
      <div class="mx-auto max-w-5xl space-y-5 pb-10 sm:px-4">
        <ActiveTasksDecisionView bootstrap={bootstrap} onAddTask={() => undefined} onOpenThread={() => undefined} onNavigate={() => undefined} />
        <WeddingBudgetEvidenceHub state={weddingState} onOpenArtifact={setOpenedDocument} />
        <p role="status">Opened document: {openedDocument()}</p>
      </div>
    </WeddingMobilePage>
  );
}

render(() => <Fixture />, document.getElementById("root")!);
