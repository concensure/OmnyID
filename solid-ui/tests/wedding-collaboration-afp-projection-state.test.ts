import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingCollaborationState } from "../src/lib/weddingCollaborationState.ts";
import {
  weddingCollaborationAccessActionForInvite,
  weddingCollaborationAccessToAfpMessage,
  weddingCollaborationInviteToAfpMessage,
  weddingCollaborationInviteToAfpSendInput,
} from "../src/lib/weddingCollaborationAfpProjectionState.ts";

const metadata = {
  wedding_plan_id: "wedding_plan:harbour",
  response_workspace_id: "response_workspace:planning-pass",
  source_response_id: "afp:response-1",
};

test("weddingCollaborationInviteToAfpMessage projects a collaborator invite as searchable guarded AFP", () => {
  const collaboration = buildWeddingCollaborationState({
    invites: [{
      email: "planner@example.com",
      displayName: "Planner Pat",
      role: "planner",
      status: "invited",
    }],
  });
  const invite = collaboration.invites[0]!;
  const message = weddingCollaborationInviteToAfpMessage({
    metadata,
    invite,
    createdAt: "2026-09-14T10:00:00.000Z",
  });

  assert.equal(message.type, "access_control");
  assert.equal(message.kind, "note");
  assert.equal(message.subtype, "wedding_collaborator_invite");
  assert.equal(message.thread_id, "wedding_collaboration:response_workspace:planning-pass");
  assert.ok(message.to?.includes("agent://contacts"));
  assert.ok(message.to?.includes("agent://decision-queue"));
  assert.ok(message.supertags?.includes("wedding_collaboration"));
  assert.ok(message.supertags?.includes("wedding_collaborator_role:planner"));
  assert.equal((message.content as any).role, "planner");
  assert.equal((message.content as any).ready_for_invite, true);
  assert.equal((message.content as any).shared_editing_enabled, false);
  assert.match((message.content as any).execution_guardrail, /Do not grant account access/);
  assert.match((message.content as any).markdown, /Wedding collaborator invite/);
  assert.ok((message.metadata as any).searchable_terms.includes("Planner Pat"));
  assert.ok((message.metadata as any).local_only_until_backend_acl);
  assert.equal(message.views?.[0]?.format, "access_control_card");
  assert.equal((message.views?.[0]?.content as any).shared_editing_enabled, false);
});

test("weddingCollaborationInviteToAfpSendInput stores invite projection relationally", () => {
  const collaboration = buildWeddingCollaborationState({
    invites: [{
      email: "bad-email",
      displayName: "Viewer",
      role: "viewer",
      status: "draft",
    }],
  });
  const sendInput = weddingCollaborationInviteToAfpSendInput({
    metadata,
    invite: collaboration.invites[0]!,
  });

  assert.equal(sendInput.store_in_relational, true);
  assert.equal(sendInput.type, "access_control");
  assert.equal(sendInput.subtype, "wedding_collaborator_invite");
  assert.equal((sendInput.content as any).ready_for_invite, false);
  assert.deepEqual((sendInput.content as any).missing_labels, ["valid email required"]);
});

test("weddingCollaborationAccessToAfpMessage projects stale accepted access as review-only AFP", () => {
  const collaboration = buildWeddingCollaborationState({
    nowIso: "2026-02-15T00:00:00Z",
    invites: [{
      email: "helper@example.com",
      displayName: "Stale Helper",
      role: "contributor",
      status: "accepted",
      lastActiveAt: "2026-01-01T00:00:00Z",
    }],
  });
  const invite = collaboration.invites[0]!;
  const action = weddingCollaborationAccessActionForInvite(invite);
  assert.equal(action, "review");

  const message = weddingCollaborationAccessToAfpMessage({
    metadata,
    invite,
    action: "review",
    createdAt: "2026-09-14T10:00:00.000Z",
  });

  assert.equal(message.subtype, "wedding_collaborator_review");
  assert.ok(message.supertags?.includes("access_control:review"));
  assert.equal((message.content as any).shared_editing_enabled, false);
  assert.equal((message.content as any).can_grant_access, true);
  assert.deepEqual((message.content as any).risk_labels, ["No recent activity; review or revoke stale access."]);
  assert.match((message.content as any).markdown, /audit\/review projection only/);
});

test("weddingCollaborationAccessActionForInvite maps expired and revoked lifecycle states", () => {
  const collaboration = buildWeddingCollaborationState({
    nowIso: "2026-02-15T00:00:00Z",
    invites: [
      {
        email: "expired@example.com",
        displayName: "Expired Viewer",
        role: "viewer",
        status: "invited",
        expiresAt: "2026-01-01T00:00:00Z",
      },
      {
        email: "revoked@example.com",
        displayName: "Revoked Planner",
        role: "planner",
        status: "accepted",
        revokedAt: "2026-02-01T00:00:00Z",
      },
    ],
  });

  assert.equal(weddingCollaborationAccessActionForInvite(collaboration.invites[0]!), "expire");
  assert.equal(weddingCollaborationAccessActionForInvite(collaboration.invites[1]!), "revoke");
});
