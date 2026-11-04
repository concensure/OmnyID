import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingInviteProposalBrief,
  defaultWeddingInviteProposalSharing,
  validateWeddingInviteProposalDraft,
  weddingInviteProposalDraftToAfpSendInput,
} from "../src/lib/weddingInviteProposalState.ts";
import type { WeddingResponseWorkspaceViewState, WeddingWorkspaceArtifactPreview } from "../src/lib/weddingResponseWorkspaceViewState.ts";

const metadata = {
  weddingPlanId: "plan-1",
  responseWorkspaceId: "workspace-1",
  templateId: "wedding-planning",
  supertags: ["wedding"],
};

function state(): WeddingResponseWorkspaceViewState {
  return {
    workspace: { metadata },
    contextCards: [{ planningContext: {
      dateOrSeason: "2027-11-20", location: "Sydney NSW", guestCount: "90",
      topPriorities: ["Photography", "Relaxed guest experience"], atmosphereDescription: "Coastal and lively",
    } }],
    budgetTracking: { budgetAllocation: [
      { categoryId: "photo_video", categoryLabel: "Photography & Video", amount: 6000 },
    ] },
  } as unknown as WeddingResponseWorkspaceViewState;
}

function preview(): WeddingWorkspaceArtifactPreview {
  return {
    artifactId: "artifact-1",
    category: "Wedding photographers",
    vendorComparisonCards: [
      { choiceId: "choice-1", vendorId: "vendor-1", title: "Harbour Light Photo", category: "Photographer", email: "studio@example.test" },
      { choiceId: "choice-2", vendorId: "vendor-2", title: "Field Notes Photo", category: "Photographer", email: null },
    ],
  } as unknown as WeddingWorkspaceArtifactPreview;
}

test("proposal brief reuses wedding facts and relevant category allocation", () => {
  const brief = buildWeddingInviteProposalBrief({ state: state(), preview: preview() });
  assert.equal(brief.dateOrSeason, "2027-11-20");
  assert.equal(brief.location, "Sydney NSW");
  assert.equal(brief.guestCount, "90");
  assert.deepEqual(brief.approximateCategoryBudget, { amount: 6000, currency: "AUD" });
  assert.equal(brief.recipients.length, 2);
  assert.deepEqual(brief.missingFacts, []);
});

test("proposal sharing keeps budget and phone off by default", () => {
  const brief = buildWeddingInviteProposalBrief({ state: state(), preview: preview() });
  const sharing = defaultWeddingInviteProposalSharing(brief);
  assert.equal(sharing.dateOrSeason, true);
  assert.equal(sharing.location, true);
  assert.equal(sharing.approximateCategoryBudget, false);
  assert.equal(sharing.phoneContact, false);
});

test("private draft records approval boundary without contacting vendors", () => {
  const brief = buildWeddingInviteProposalBrief({ state: state(), preview: preview() });
  const message = weddingInviteProposalDraftToAfpSendInput({
    brief,
    requestText: "Please propose eight hours of documentary-style photography.",
    recipientChoiceIds: ["choice-1"],
    sharing: defaultWeddingInviteProposalSharing(brief),
    metadata,
    createdAt: "2026-11-05T01:02:03.000Z",
  });
  assert.equal(message.subtype, "wedding_vendor_proposal_invitation_draft");
  assert.deepEqual(message.to, ["user://couple", "agent://decision-queue", "agent://knowledge-graph"]);
  assert.equal((message.content as Record<string, unknown>).external_action, false);
  assert.equal((message.content as Record<string, unknown>).approval_status, "pending_user_approval");
  assert.equal((message.views?.[0] as { format: string }).format, "a2ui");
  const shared = (message.content as { shared_context: Record<string, unknown> }).shared_context;
  assert.equal(shared.approximate_category_budget, null);
  assert.equal((message.metadata as Record<string, unknown>).recipient_count, 1);
});

test("validation rejects unknown and over-cap recipient selections", () => {
  const brief = buildWeddingInviteProposalBrief({ state: state(), preview: preview() });
  assert.match(validateWeddingInviteProposalDraft({ brief, requestText: "A proposal", recipientChoiceIds: ["other"] }) ?? "", /not in this wedding shortlist/);
  assert.match(validateWeddingInviteProposalDraft({ brief, requestText: "A proposal", recipientChoiceIds: ["1", "2", "3", "4", "5", "6"] }) ?? "", /up to 5/);
});
