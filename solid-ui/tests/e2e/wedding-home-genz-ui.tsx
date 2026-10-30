import { createSignal } from "solid-js";
import { render } from "solid-js/web";

import "../../src/index.css";
import { DecisionCard } from "../../src/components/DecisionCard";
import { WeddingHomeOverviewGrid } from "../../src/components/WeddingHomeOverviewGrid";
import { WeddingMobilePage } from "../../src/components/WeddingMobilePage";
import { WeddingVendorSearchHomeSection } from "../../src/components/WeddingVendorSearchHomeSections";
import type { WeddingResponseWorkspaceViewProps } from "../../src/components/WeddingResponseWorkspaceViewTypes";
import type { DecisionCardModel } from "../../src/lib/decisionCardState";
import type { WeddingResponseWorkspaceViewState } from "../../src/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceMenuId } from "../../src/lib/weddingWorkspaceMenuState";

const state = {
  afpMessages: [],
  helperContactNames: [],
  workspace: {
    artifacts: [],
    metadata: { weddingPlanId: "fixture-plan", responseWorkspaceId: "fixture-workspace" },
  },
  contextCards: [{ planningContext: { location: "Sydney NSW", guestCount: 80 }, answeredLabels: [] }],
  guestTracking: { guestRowCount: 0, attendingCount: 0, declinedCount: 0, pendingCount: 0 },
  seatingPlan: { assignedSeatCount: 0, unassignedAttendingCount: 0 },
  budgetTracking: { budgetTargetAmount: 60_000, totalKnownAmount: 13_900, remainingAmount: 46_100 },
  ganttTimeline: {
    rows: [{ id: "transport", title: "Check transport and guest access", startLabel: "2027-04-01", endLabel: "2027-04-01", statusLabel: "Planned" }],
    undatedItems: [],
  },
  planningTaskItems: [
    { id: "one", title: "Set the budget", status: "completed" },
    { id: "two", title: "Build the guest list", status: "open" },
    { id: "three", title: "Choose a venue", status: "open" },
    { id: "four", title: "Plan transport", status: "open" },
  ],
  vendorContactCards: [],
  resilience: { cards: [], hasUrgentItem: false },
} as unknown as WeddingResponseWorkspaceViewState;

const decision: DecisionCardModel = {
  schema: "content.decision_card",
  pattern: "choose",
  patternVersion: "1.0",
  id: "fixture-decision",
  title: "Invalid AFP payload from provider",
  domain: "wedding",
  pressure: "medium",
  whyItMatters: "Choosing the venue unlocks catering, transport and your guest plan.",
  recommendation: { summary: "Garden House fits your relaxed style and guest count.", reasons: ["Stated style fit"] },
  actions: [
    { id: "review", label: "Review best fit", role: "primary", effect: "Opens the comparison", intent: "review" },
    { id: "later", label: "Decide later", role: "dismiss", effect: "Keeps the choice open", intent: "defer" },
  ],
  evidence: [{ label: "3 checked details", ref: "fixture:1", sourceKind: "fixture", freshness: "current" }],
  unknowns: ["Final date availability"],
  patternSlots: { options: [] },
  verification: { status: "partial", label: "3 facts checked" },
};

function Fixture() {
  const [activeMenu, setActiveMenu] = createSignal<WeddingWorkspaceMenuId>("home");
  const [query, setQuery] = createSignal("");
  const [notice, setNotice] = createSignal<string | null>(null);
  const workspace = (): WeddingResponseWorkspaceViewProps => ({
    state,
    vendorSearchQuery: query(),
    vendorSearchNotice: notice(),
    vendorSearchBlockedReason: "HTTP 500 provider_token failed",
    vendorSearchRunning: false,
    onVendorSearchQueryChange: setQuery,
    onRunLiveVendorSearch: () => setNotice("HTTP 500 provider payload failed"),
    onSelectMenu: setActiveMenu,
  });
  const outreach = { flows: () => ({}) } as never;

  return (
    <WeddingMobilePage title="Wedding home" activeMenu={activeMenu()} onSelectMenu={setActiveMenu}>
      <div class="mx-auto grid min-w-0 max-w-6xl gap-4 pb-8 sm:px-4">
        <WeddingVendorSearchHomeSection workspace={workspace()} result={null} outreach={outreach} onDismiss={() => undefined} />
        <WeddingHomeOverviewGrid state={state} onSelectMenu={setActiveMenu} />
        <section aria-label="Decision card example"><DecisionCard card={decision} mode="standard" /></section>
        <p role="status" class="text-sm text-wedding-muted">Current page: {activeMenu()}</p>
      </div>
    </WeddingMobilePage>
  );
}

render(() => <Fixture />, document.getElementById("root")!);
