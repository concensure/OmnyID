import { render } from "solid-js/web";

import "../../src/index.css";
import { WeddingBoundaryManagementCard } from "../../src/components/WeddingBoundaryManagementCard";
import { buildWeddingBoundaryState, type WeddingBoundaryLedgerObject } from "../../src/lib/weddingBoundaryLedgerState";
import { buildWeddingBoundaryTopologyState } from "../../src/lib/weddingBoundaryTopologyState";

const metadata = {
  weddingPlanId: "wedding_plan:e2e-family",
  responseWorkspaceId: "response_workspace:e2e-family",
};
const objects: WeddingBoundaryLedgerObject[] = [
  {
    id: "household:rivera", kind: "wedding_boundary_household", title: "Rivera household", visibility: "couple_only",
    householdId: "household:rivera", displayName: "Rivera household", memberPersonIds: ["person:alex"], primaryContactPersonId: "person:alex",
    familyGroupId: "family_group:one", familyGroupLabel: "Partner one's family", invitationAllocation: 2, requestDeadline: "2027-08-01", revision: 1,
  },
  {
    id: "person:alex", kind: "wedding_boundary_guest_profile", title: "Alex Rivera", visibility: "approved_shared",
    personId: "person:alex", displayName: "Alex Rivera", householdId: "household:rivera", ageBand: "adult",
  },
  {
    id: "role:alex", kind: "wedding_boundary_role_assignment", title: "Alex family helper", visibility: "approved_shared",
    personId: "person:alex", role: "parent_family", canView: ["approved guest names"], canSuggest: ["add_guest"], canEdit: [],
  },
  {
    id: "rule:plus-one", kind: "wedding_boundary_policy", title: "Named guests only", visibility: "family_visible",
    ruleType: "plus_one", enforcement: "require_approval", plainLanguage: "Ask us before adding a plus-one.", status: "active", version: 1,
  },
  {
    id: "request:plus-one", kind: "wedding_boundary_change_request", title: "Add one guest", visibility: "approved_shared",
    requestId: "request:plus-one", requestedBy: "person:alex", targetHouseholdId: "household:rivera", changeType: "add_guest",
    requestStatus: "pending", approvalRequired: true, policyIds: ["rule:plus-one"], publicReason: "One guest requested",
  },
];
const state = buildWeddingBoundaryState({ metadata, objects });
const topology = buildWeddingBoundaryTopologyState({ metadata, objects });

render(() => (
  <main class="mx-auto max-w-3xl p-3">
    <WeddingBoundaryManagementCard state={state} topology={topology} />
  </main>
), document.getElementById("root")!);
