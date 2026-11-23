import assert from "node:assert/strict";
import test from "node:test";

import {
  approveWeddingInviteProposalBatch,
  buildWeddingInviteProposalBatch,
} from "../src/lib/weddingInviteProposalBatchState";
import type { WeddingInviteProposalBrief } from "../src/lib/weddingInviteProposalState";

const brief: WeddingInviteProposalBrief = {
  id: "proposal-plan-1",
  category: "Photography",
  dateOrSeason: "20 November 2027",
  location: "Sydney NSW",
  guestCount: "90",
  stylePriorities: ["natural", "candid"],
  approximateCategoryBudget: { amount: 5_500, currency: "AUD" },
  missingFacts: [],
  sourceArtifactId: "artifact-shortlist",
  recipients: [{
    choiceId: "choice-1",
    vendorId: "vendor-1",
    vendorName: "Harbour Light Photo",
    category: "Photography",
    email: "hello@example.com",
    eligible: true,
    route: "verified_email",
    eligibilityLabel: "Verified business email",
    eligibilityReason: "Ready after approval.",
  }],
};

test("proposal batch builds one existing outreach flow per selected vendor without approving it", () => {
    const items = buildWeddingInviteProposalBatch({
      brief,
      requestText: "Please propose candid coverage from preparation through speeches.",
      selectedChoiceIds: ["choice-1"],
      sharing: {
        dateOrSeason: true,
        location: true,
        guestCount: true,
        stylePriorities: true,
        approximateCategoryBudget: false,
        phoneContact: false,
      },
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].flow.stage, "draft_ready");
    assert.equal(items[0].flow.permissions.previewApproved, false);
    assert.equal(items[0].flow.permissions.replyRoute, "connected_email");
    assert.match(items[0].flow.bodyMarkdown, /Please reply by email/);
    assert.doesNotMatch(items[0].flow.bodyMarkdown, /\$5,500/);
});

test("proposal batch binds the approved server recipient and one explicit batch approval", () => {
    const items = buildWeddingInviteProposalBatch({
      brief,
      requestText: "Please propose a package.",
      selectedChoiceIds: ["choice-1"],
      sharing: {
        dateOrSeason: true,
        location: true,
        guestCount: true,
        stylePriorities: true,
        approximateCategoryBudget: true,
        phoneContact: false,
      },
      approvedRecipients: [{ vendorId: "vendor-1", recipientEmail: "verified@example.com" }],
    });
    const approved = approveWeddingInviteProposalBatch(items);
    assert.equal(approved[0].recipientEmail, "verified@example.com");
    assert.equal(approved[0].flow.permissions.previewApproved, true);
    assert.match(approved[0].flow.bodyMarkdown, /\$5,500/);
    assert.match(approved[0].flow.draftPermissionFingerprint, /budget:yes/);
});
