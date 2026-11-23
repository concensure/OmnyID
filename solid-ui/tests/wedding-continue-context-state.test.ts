import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingContinueContextPacket } from "@/lib/weddingContinueContextState";
import { buildWeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingArtifactInput } from "@/lib/weddingArtifactState";

const metadata = {
  wedding_plan_id: "wedding_plan:harbour",
  response_workspace_id: "response_workspace:planning-pass",
  source_response_id: "afp:response-1",
};

function artifact(input: Partial<WeddingArtifactInput> & Pick<WeddingArtifactInput, "title" | "kind" | "createdAt">): WeddingArtifactInput {
  return {
    id: `artifact:${String(input.title).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    metadata,
    sourceLabels: ["Agent research"],
    ...input,
  };
}

function memoryStorage(): Storage {
  return {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  } as Storage;
}

test("buildWeddingContinueContextPacket summarizes workspace context for chat continuation", () => {
  const workspace = buildWeddingResponseWorkspaceViewState({
    metadata,
    activeArtifactId: "artifact:venue-email",
    artifacts: [
      artifact({
        title: "Venue email",
        kind: "email_draft",
        createdAt: 1,
        metadata: { ...metadata, approval_state: "pending_user_approval" },
        linkedCalendarEventIds: ["event:venue-tour"],
        linkedTaskIds: ["task:follow-up"],
      }),
    ],
    contextItems: [{
      metadata: workspaceMetadata(),
      planningContext: { location: "Sydney NSW", topPriorities: ["food"] },
      answeredLabels: ["Location: Sydney NSW", "Priority: food"],
      nextQuestionLabel: "What date?",
      readyForFirstRecommendations: true,
      projectionSaved: true,
    }],
    approvalReceipts: [{
      id: "receipt:venue-email",
      requestId: "request:venue-email",
      actionKind: "send_email",
      title: "Send venue email",
      status: "blocked",
      createdAt: "2026-09-12T00:00:00.000Z",
      disclosureLines: [],
      riskLabels: [],
      blockedReason: "No executor is connected.",
      externalId: null,
      artifactIds: ["artifact:venue-email"],
      scheduleItemIds: [],
      taskItemIds: [],
    }],
    decisionRecords: [{
      id: "wedding_decision:venue:harbour-hall",
      artifactId: "artifact:venue-shortlist",
      artifactTitle: "Venue shortlist",
      artifactKind: "vendor_table",
      selectedOptionId: "row-1",
      selectedOptionLabel: "Harbour Hall",
      selectedOptionDetail: "Selected waterfront venue.",
      selectedOptionCells: ["Harbour Hall", "Sydney"],
      sourceProviderLabels: ["google_places"],
      createdAt: "2026-09-12T00:00:00.000Z",
      source: "local_selection",
      metadataLabels: [],
    }],
    projectionStorage: memoryStorage(),
  });

  const packet = buildWeddingContinueContextPacket(workspace);

  assert.equal(packet.version, 1);
  assert.equal(packet.weddingPlanId, "wedding_plan:harbour");
  assert.equal(packet.responseWorkspaceId, "response_workspace:planning-pass");
  assert.equal(packet.activeArtifact?.title, "Venue email");
  assert.equal(packet.activeArtifact?.approvalState, "pending_user_approval");
  assert.ok(packet.contextLabels.includes("Location: Sydney NSW"));
  assert.ok(packet.decisionScopeLabels.includes("Harbour Hall: Selected waterfront venue."));
  assert.deepEqual(packet.decisionSourceProviderLabels, ["google_places"]);
  assert.ok(packet.approvalReceiptLabels.includes("Blocked: Send venue email"));
  assert.deepEqual(packet.scheduleLabels, ["event:venue-tour"]);
  assert.deepEqual(packet.taskLabels, ["task:follow-up"]);
  assert.ok(packet.guardrails.some((guardrail) => /Ask before sending/i.test(guardrail)));
  assert.ok(packet.guardrails.some((guardrail) => /selected option first/i.test(guardrail)));
  assert.ok(packet.guardrails.some((guardrail) => /source\/provider evidence/i.test(guardrail)));
});

test("buildWeddingContinueContextPacket carries imported-file review guardrails without uploaded content", () => {
  const workspace = buildWeddingResponseWorkspaceViewState({
    metadata,
    activeArtifactId: "artifact:imported-guest-spreadsheet",
    artifacts: [
      artifact({
        title: "Imported guest spreadsheet",
        kind: "research",
        createdAt: 1,
        metadata: {
          ...metadata,
          artifactKind: "research",
          supertags: ["wedding_import", "wedding_import:spreadsheet", "wedding_import_status:synthesized"],
        },
        sourceLabels: ["original upload saved", "source: guest-list.xlsx"],
        bodyText: "Private guest allergies and family notes should not be copied into continuation context.",
      }),
      artifact({
        title: "Venue research",
        kind: "research",
        createdAt: 2,
        sourceLinks: [{ label: "Venue page", url: "https://example.com/venue" }],
      }),
    ],
  });

  const packet = buildWeddingContinueContextPacket(workspace);

  assert.equal(packet.importedArtifactCount, 1);
  assert.equal(packet.importedReviewRequiredCount, 1);
  assert.equal(packet.activeArtifact?.title, "Imported private planning file");
  assert.ok(packet.guardrails.some((guardrail) => /Imported wedding files are private planning evidence/i.test(guardrail)));
  assert.equal(JSON.stringify(packet).includes("Private guest allergies"), false);
  assert.equal(JSON.stringify(packet).includes("Imported guest spreadsheet"), false);
  assert.equal(JSON.stringify(packet).includes("guest-list.xlsx"), false);
});

function workspaceMetadata() {
  return {
    template: "wedding_planning" as const,
    weddingPlanId: "wedding_plan:harbour",
    responseWorkspaceId: "response_workspace:planning-pass",
    sourceResponseId: "afp:response-1",
    artifactKind: null,
    supertags: ["template:wedding_planning"],
    privacyScope: "private" as const,
    approvalState: "draft" as const,
  };
}
