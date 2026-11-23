import { createSignal } from "solid-js";
import { render } from "solid-js/web";

import "../../src/index.css";
import { WeddingMobilePage } from "../../src/components/WeddingMobilePage";
import { WeddingPeopleHub } from "../../src/components/WeddingPeopleHub";
import { WeddingGuestOperationsCard } from "../../src/components/WeddingGuestOperationsCard";
import type { WeddingGuestTrackingState } from "../../src/lib/weddingGuestTrackingState";
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

const guestState = {
  guestFileCount: 0, guestRowCount: 1, attendingCount: 0, declinedCount: 0, pendingCount: 1, householdCount: 1,
  dietaryCount: 0, accessibilityCount: 0, missingContactCount: 0, missingMealCount: 0,
  finalCountOptions: [], followUpTaskCandidates: [], boundaryRuleLabels: [], invitationScopeLabels: [], warningLabels: [], sourceLabels: [],
  summaryLabel: "One shared guest list feeds RSVPs, seating and catering.",
  guestRows: [{ id: "guest:alex", personId: "person:alex", householdId: "household:rivera", displayName: "Alex Rivera", householdLabel: "Rivera", rsvpStatus: "Pending", contactLabel: "alex@example.test", rsvpReminderPermission: true, mealPreference: null, dietaryNote: null, accessibilityNote: null, mealRequired: true, sourceLabel: "Saved in your guest list", eventResponses: [{ invitationId: "invite:alex", eventId: "event:wedding", attendance: "Pending", responseSource: null, viewedAt: null, respondedAt: null, lockedAt: null, changed: false, revision: 1 }] }],
  rsvpResponseSummary: { guestCount: 1, repliedCount: 0, awaitingCount: 1, completeCount: 0, incompleteCount: 0, changedCount: 0, lockedCount: 0, privateRequirementCount: 0, rows: [{ guestId: "guest:alex", displayName: "Alex Rivera", attendance: "Pending", operationalState: "invited", statusLabel: "Awaiting reply", provenanceLabel: "Saved guest", missingDetailLabels: [], eventCount: 1, hasPrivateRequirements: false, privacyLabel: null }], summaryLabel: "1 awaiting" },
} as WeddingGuestTrackingState;

function Fixture() {
  const [activeMenu, setActiveMenu] = createSignal<WeddingWorkspaceMenuId>("people");
  const state = buildWeddingPeopleAggregateState(viewState);
  return (
    <WeddingMobilePage title="Wedding planner" activeMenu={activeMenu()} onSelectMenu={setActiveMenu}>
      <div class="mx-auto max-w-5xl pb-10 sm:px-4">
        <WeddingPeopleHub state={state} onSelectMenu={setActiveMenu} />
        <div class="mt-4" data-rsvp-guest-card><WeddingGuestOperationsCard state={guestState} /></div>
        <p class="sr-only" role="status">Opened {activeMenu()}</p>
      </div>
    </WeddingMobilePage>
  );
}

render(() => <Fixture />, document.getElementById("root")!);
