import { createSignal } from "solid-js";
import { render } from "solid-js/web";

import "../../src/index.css";
import { WeddingMobilePage } from "../../src/components/WeddingMobilePage";
import { WeddingPeopleHub } from "../../src/components/WeddingPeopleHub";
import { buildWeddingPeopleAggregateState } from "../../src/lib/weddingWorkspaceAggregateState";
import type { WeddingResponseWorkspaceViewState } from "../../src/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceMenuId } from "../../src/lib/weddingWorkspaceMenuState";

const viewState = {
  guestTracking: {
    guestRowCount: 82,
    pendingCount: 17,
    boundaryRuleLabels: ["No extra plus-ones"],
    invitationScopeLabels: ["Reception only: cousins"],
  },
  seatingPlan: {
    assignedSeatCount: 48,
    unassignedAttendingCount: 12,
  },
  boundaryState: {
    pendingApprovalCount: 3,
    privateObjectCount: 1,
  },
} as unknown as WeddingResponseWorkspaceViewState;

function Fixture() {
  const [activeMenu, setActiveMenu] = createSignal<WeddingWorkspaceMenuId>("people");
  const state = buildWeddingPeopleAggregateState(viewState);
  return (
    <WeddingMobilePage title="Wedding planner" activeMenu={activeMenu()} onSelectMenu={setActiveMenu}>
      <div class="mx-auto max-w-5xl pb-10 sm:px-4">
        <WeddingPeopleHub state={state} onSelectMenu={setActiveMenu} />
        <p class="sr-only" role="status">Opened {activeMenu()}</p>
      </div>
    </WeddingMobilePage>
  );
}

render(() => <Fixture />, document.getElementById("root")!);
