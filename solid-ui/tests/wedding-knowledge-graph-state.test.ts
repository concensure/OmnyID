import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWeddingArtifactSummary, type WeddingArtifactInput } from "../src/lib/weddingArtifactState.ts";
import { weddingPersistedDecisionRecordsToGraphDecisions } from "../src/lib/weddingDecisionGraphState.ts";
import {
  buildWeddingKnowledgeGraphState,
  type WeddingDecisionInput,
  type WeddingRiskInput,
} from "../src/lib/weddingKnowledgeGraphState.ts";
import type {
  WeddingPlanningScheduleItem,
  WeddingPlanningTaskItem,
} from "../src/lib/weddingCalendarProjectionState.ts";

const baseMetadata = {
  wedding_plan_id: "wedding_plan:harbour",
  response_workspace_id: "response_workspace:venue-pass",
  source_response_id: "afp:response-1",
};

function artifact(input: WeddingArtifactInput) {
  const summary = normalizeWeddingArtifactSummary({
    metadata: baseMetadata,
    ...input,
  });
  assert.ok(summary);
  return summary;
}

test("buildWeddingKnowledgeGraphState links plan, workspace, artifacts, vendors, and locations", () => {
  const state = buildWeddingKnowledgeGraphState({
    metadata: baseMetadata,
    artifacts: [
      artifact({
        id: "artifact:venue-table",
        title: "Venue shortlist",
        kind: "vendor_table",
        vendorLabels: ["Harbour House", "Garden Hall"],
        locationLabels: ["Sydney Harbour"],
        sourceLinks: [{ label: "Venue page", url: "https://example.com/venue" }],
      }),
      artifact({
        id: "artifact:email-draft",
        title: "Venue inquiry draft",
        kind: "email_draft",
        metadata: { ...baseMetadata, approval_state: "pending_user_approval" },
        vendorLabels: ["Harbour House"],
      }),
    ],
  });

  assert.equal(state.metadata.weddingPlanId, "wedding_plan:harbour");
  assert.match(state.summaryLabel, /wedding nodes? and/i);
  assert.ok(state.nodes.some((node) => node.kind === "wedding_plan"));
  assert.ok(state.nodes.some((node) => node.kind === "response_workspace"));
  assert.ok(state.nodes.some((node) => node.kind === "vendor" && node.label === "Harbour House"));
  assert.ok(state.nodes.some((node) => node.kind === "location" && node.label === "Sydney Harbour"));
  assert.ok(state.nodes.some((node) => node.kind === "artifact" && node.metadata.evidence_status === "source_linked"));
  assert.ok(state.edges.some((edge) => edge.kind === "created" && edge.label === "created artifact"));
  assert.ok(state.edges.some((edge) => edge.kind === "mentions_vendor"));
  assert.ok(state.edges.some((edge) => edge.kind === "mentions_location"));
  assert.ok(state.edges.some((edge) => edge.kind === "requires_approval"));
  assert.ok(state.highDegreeNodes.length > 0);
});

test("buildWeddingKnowledgeGraphState links calendar events and tasks back to artifacts", () => {
  const scheduleItems: WeddingPlanningScheduleItem[] = [{
    id: "menu-tasting",
    title: "Menu tasting",
    kind: "menu_tasting",
    startAt: "2027-02-20T18:00:00+11:00",
    location: "Caterer Studio",
    linkedArtifactId: "artifact:catering",
  }];
  const taskItems: WeddingPlanningTaskItem[] = [{
    id: "ask-caterer",
    title: "Ask caterer about dietary options",
    kind: "vendor_follow_up",
    dueAt: "2027-02-10T17:00:00+11:00",
    priority: "high",
    linkedArtifactId: "artifact:catering",
  }];

  const state = buildWeddingKnowledgeGraphState({
    metadata: baseMetadata,
    artifacts: [artifact({
      id: "artifact:catering",
      title: "Catering research",
      kind: "research",
      vendorLabels: ["Good Food Co"],
      locationLabels: ["Caterer Studio"],
      sourceLinks: [{ label: "Caterer page", url: "https://example.com/catering" }],
    })],
    scheduleItems,
    taskItems,
  });

  assert.ok(state.nodes.some((node) => node.kind === "calendar_event" && node.label === "Menu tasting"));
  assert.ok(state.nodes.some((node) => node.kind === "task" && node.label === "Ask caterer about dietary options"));
  assert.ok(state.edges.some((edge) => edge.kind === "creates_deadline"));
  assert.ok(state.edges.some((edge) => edge.kind === "requires"));
  assert.ok(state.nodes.some((node) => node.supertags.includes("priority:high")));
  assert.equal(state.missingEvidenceLabels.includes("No planning task projection yet."), false);
});

test("buildWeddingKnowledgeGraphState turns second-order task metadata into risk topology", () => {
  const state = buildWeddingKnowledgeGraphState({
    metadata: baseMetadata,
    artifacts: [artifact({
      id: "artifact:venue-table",
      title: "Venue shortlist",
      kind: "vendor_table",
      vendorLabels: ["Harbour Hall"],
      sourceLinks: [{ label: "Venue page", url: "https://example.com/venue" }],
    })],
    taskItems: [{
      id: "second-order-weather",
      title: "Confirm wet-weather backup for Harbour Hall",
      kind: "vendor_follow_up",
      priority: "high",
      linkedArtifactId: "artifact:venue-table",
      metadata: {
        ...baseMetadata,
        second_order_task: true,
        second_order_loop: "weather_backup",
        second_order_evidence_labels: ["weather-exposed plan", "selected scope: venue: Harbour Hall"],
        selected_decision_scope: {
          selected_option_label: "Harbour Hall",
          artifact_id: "artifact:venue-table",
        },
      },
    }],
  });

  const taskNode = state.nodes.find((node) => node.kind === "task" && node.label === "Confirm wet-weather backup for Harbour Hall");
  const loopRisk = state.nodes.find((node) => node.kind === "risk" && node.metadata.second_order_loop === "weather_backup");

  assert.ok(taskNode);
  assert.ok(taskNode.supertags.includes("wedding_second_order_task"));
  assert.equal(taskNode.metadata.second_order_loop, "weather_backup");
  assert.equal((taskNode.metadata.selected_decision_scope as Record<string, unknown>).selected_option_label, "Harbour Hall");
  assert.ok(loopRisk);
  assert.equal(loopRisk.label, "Weather backup loop needs closure");
  assert.ok(loopRisk.supertags.includes("wedding_second_order_loop"));
  assert.ok(state.edges.some((edge) => edge.kind === "next_action" && edge.source === loopRisk.id && edge.target === taskNode.id));
  assert.ok(state.riskNodes.some((node) => node.id === loopRisk.id));
});

test("buildWeddingKnowledgeGraphState redacts imported selected-decision scope metadata in task topology", () => {
  const state = buildWeddingKnowledgeGraphState({
    metadata: baseMetadata,
    taskItems: [{
      id: "second-order-import",
      title: "Confirm imported venue decision",
      kind: "vendor_follow_up",
      priority: "high",
      linkedArtifactId: "artifact:venue-table",
      metadata: {
        ...baseMetadata,
        second_order_task: true,
        second_order_loop: "weather_backup",
        second_order_evidence_labels: ["selected scope: venue: Harbour Hall"],
        selected_decision_scope: {
          selected_option_label: "Harbour Hall",
          artifact_id: "artifact:venue-table",
          artifact_title: "Imported XLSX: private-family-budget.xlsx",
          artifactTitle: "Imported XLSX: private-family-budget.xlsx",
          source_labels: ["original upload saved", "source: private-family-budget.xlsx"],
          sourceLabels: ["source: private-family-budget.xlsx"],
          source_urls: [
            "https://storage.example.test/uploads/private-family-budget.xlsx?token=private",
            "https://example.com/vendor-quote",
          ],
          sourceUrls: ["https://storage.example.test/uploads/private-family-budget.xlsx?token=private"],
          metadata_labels: ["source: private-family-budget.xlsx", "needs follow-up"],
          metadataLabels: ["wedding_import:spreadsheet"],
        },
      },
    }],
  });
  const taskNode = state.nodes.find((node) => node.kind === "task" && node.label === "Confirm imported venue decision");
  const riskNode = state.nodes.find((node) => node.kind === "risk" && node.metadata.second_order_loop === "weather_backup");
  const taskScope = taskNode?.metadata.selected_decision_scope as Record<string, unknown>;
  const riskScope = riskNode?.metadata.selected_decision_scope as Record<string, unknown>;
  const serialized = JSON.stringify(state);

  assert.ok(taskNode);
  assert.ok(riskNode);
  assert.equal(taskScope.selected_option_label, "Harbour Hall");
  assert.equal(taskScope.artifact_title, "Imported private planning file");
  assert.equal(taskScope.artifactTitle, undefined);
  assert.deepEqual(taskScope.source_labels, ["Imported private planning file"]);
  assert.equal(taskScope.sourceLabels, undefined);
  assert.deepEqual(taskScope.source_urls, ["https://example.com/vendor-quote"]);
  assert.equal(taskScope.sourceUrls, undefined);
  assert.deepEqual(taskScope.metadata_labels, ["needs follow-up"]);
  assert.equal(taskScope.imported_private_evidence, true);
  assert.deepEqual(riskScope, taskScope);
  assert.equal(serialized.includes("private-family-budget.xlsx"), false);
  assert.equal(serialized.includes("storage.example.test"), false);
  assert.equal(serialized.includes("token=private"), false);
  assert.equal(serialized.includes("original upload saved"), false);
  assert.equal(serialized.includes("wedding_import:spreadsheet"), false);
});

test("buildWeddingKnowledgeGraphState tags outreach escalation stages in task and risk topology", () => {
  const state = buildWeddingKnowledgeGraphState({
    metadata: baseMetadata,
    taskItems: [{
      id: "venue-x-escalation",
      title: "Decide next outreach step for Venue X",
      kind: "vendor_follow_up",
      priority: "high",
      metadata: {
        ...baseMetadata,
        second_order_loop: "contact_follow_up",
        outreach_escalation_stage: "escalate_to_user",
        vendor_label: "Venue X",
      },
    }],
  });

  const taskNode = state.nodes.find((node) => node.kind === "task" && node.label === "Decide next outreach step for Venue X");
  const riskNode = state.nodes.find((node) => node.kind === "risk" && node.metadata.second_order_loop === "contact_follow_up");

  assert.ok(taskNode);
  assert.ok(taskNode.supertags.includes("wedding_outreach_escalation"));
  assert.ok(taskNode.supertags.includes("outreach_escalation:escalate_to_user"));
  assert.equal(taskNode.metadata.outreach_escalation_stage, "escalate_to_user");
  assert.ok(riskNode);
  assert.ok(riskNode.supertags.includes("outreach_escalation:escalate_to_user"));
  assert.equal(riskNode.metadata.outreach_escalation_stage, "escalate_to_user");
});

test("buildWeddingKnowledgeGraphState marks day-of execution gaps in topology", () => {
  const state = buildWeddingKnowledgeGraphState({
    metadata: baseMetadata,
    artifacts: [artifact({ id: "artifact:timeline", title: "Run sheet", kind: "timeline" })],
    taskItems: [{
      id: "day-of-guest-updates",
      title: "Connect day-of guest update and lost-item channel",
      kind: "guest_list",
      priority: "high",
      metadata: {
        ...baseMetadata,
        expected_behavior_capability: "day_of_guest_coordination",
        second_order_loop: "guest_logistics",
      },
    }],
  });

  const taskNode = state.nodes.find((node) => node.kind === "task" && /guest update/i.test(node.label));
  const riskNode = state.riskNodes.find((node) => node.metadata.day_of_execution_capability === "day_of_guest_coordination");

  assert.ok(taskNode);
  assert.ok(taskNode.supertags.includes("wedding_day_of_execution"));
  assert.equal(taskNode.metadata.expected_behavior_capability, "day_of_guest_coordination");
  assert.ok(riskNode);
  assert.match(riskNode.label, /guest coordination/i);
  assert.ok(riskNode.supertags.includes("day_of_execution:day_of_guest_coordination"));
  assert.ok(state.edges.some((edge) => edge.kind === "next_action" && edge.target === taskNode.id));
});

test("buildWeddingKnowledgeGraphState adds decision constraints and risk next-action edges", () => {
  const decisions: WeddingDecisionInput[] = [{
    id: "venue-choice",
    title: "Choose venue",
    status: "open",
    constrains: ["Catering shortlist", "Transport plan"],
    requiresApproval: true,
  }];
  const risks: WeddingRiskInput[] = [{
    id: "wet-weather",
    title: "No wet-weather backup confirmed",
    severity: "high",
    evidence: "Outdoor ceremony is still preferred.",
  }];

  const state = buildWeddingKnowledgeGraphState({
    metadata: baseMetadata,
    artifacts: [artifact({
      id: "artifact:budget",
      title: "Budget sheet",
      kind: "budget_sheet",
      sourceLinks: [{ label: "Quote", url: "https://example.com/quote" }],
    })],
    decisions,
    risks,
  });

  assert.ok(state.nodes.some((node) => node.kind === "decision" && node.label === "Choose venue"));
  assert.ok(state.nodes.some((node) => node.kind === "risk" && node.label === "No wet-weather backup confirmed"));
  assert.ok(state.edges.some((edge) => edge.kind === "constrains"));
  assert.ok(state.edges.some((edge) => edge.kind === "has_risk"));
  assert.ok(state.edges.some((edge) => edge.kind === "next_action"));
  assert.equal(state.riskNodes.length, 1);
  assert.equal(state.nextActionLabel, "No vendor comparison artifact yet.");
});

test("buildWeddingKnowledgeGraphState links persisted selected decisions to source artifacts", () => {
  const artifactSummary = artifact({
    id: "artifact:venue-table",
    title: "Venue shortlist",
    kind: "vendor_table",
    vendorLabels: ["Harbour Hall"],
    locationLabels: ["Sydney Harbour"],
    sourceLinks: [{ label: "Venue page", url: "https://example.com/venue" }],
  });
  const decisions = weddingPersistedDecisionRecordsToGraphDecisions([{
    id: "wedding_decision:venue:harbour-hall",
    artifactId: "artifact:venue-table",
    artifactTitle: "Venue shortlist",
    artifactKind: "vendor_table",
    selectedOptionId: "row-1",
    selectedOptionLabel: "Harbour Hall",
    selectedOptionDetail: "Selected waterfront venue.",
    selectedOptionCells: ["Harbour Hall", "Sydney Harbour"],
    sourceLabels: ["Google Places API", "Venue page"],
    sourceUrls: ["https://example.com/venue"],
    sourceProviderLabels: ["google_places"],
    createdAt: "2026-09-12T00:00:00.000Z",
    source: "local_selection",
    metadataLabels: [],
  }]);

  const state = buildWeddingKnowledgeGraphState({
    metadata: baseMetadata,
    artifacts: [artifactSummary],
    decisions,
  });
  const selectedDecision = state.nodes.find((node) => node.kind === "decision" && /Harbour Hall/i.test(node.label));

  assert.ok(selectedDecision);
  assert.equal(selectedDecision.metadata.decision_status, "decided");
  assert.equal(selectedDecision.metadata.source_artifact_id, "artifact:venue-table");
  assert.equal(selectedDecision.metadata.selected_option_label, "Harbour Hall");
  assert.deepEqual(selectedDecision.metadata.source_provider_labels, ["google_places"]);
  assert.deepEqual(selectedDecision.metadata.source_urls, ["https://example.com/venue"]);
  assert.ok(state.edges.some((edge) => (
    edge.kind === "constrains"
    && edge.label === "selected option"
    && edge.target === selectedDecision.id
  )));
});

test("buildWeddingKnowledgeGraphState drops malformed selected decision source URLs", () => {
  const decisions = weddingPersistedDecisionRecordsToGraphDecisions([{
    id: "wedding_decision:venue:unsafe-source",
    artifactId: "artifact:venue-table",
    artifactTitle: "Venue shortlist",
    artifactKind: "vendor_table",
    selectedOptionId: "row-1",
    selectedOptionLabel: "Harbour Hall",
    selectedOptionDetail: "Selected waterfront venue.",
    selectedOptionCells: ["Harbour Hall", "Sydney Harbour"],
    sourceLabels: ["Mixed source"],
    sourceUrls: ["javascript:alert(1)", "not-a-url", "https://example.com/venue"],
    sourceProviderLabels: ["manual_review"],
    createdAt: "2026-09-12T00:00:00.000Z",
    source: "local_selection",
    metadataLabels: [],
  }]);
  const state = buildWeddingKnowledgeGraphState({
    metadata: baseMetadata,
    decisions: [{
      ...decisions[0]!,
      metadata: {
        ...decisions[0]!.metadata as Record<string, unknown>,
        source_urls: ["javascript:alert(1)", "https://example.com/venue"],
      },
    }],
  });
  const selectedDecision = state.nodes.find((node) => node.kind === "decision" && /Harbour Hall/i.test(node.label));

  assert.deepEqual(decisions[0]?.metadata && (decisions[0].metadata as Record<string, unknown>).source_urls, ["https://example.com/venue"]);
  assert.deepEqual(selectedDecision?.metadata.source_urls, ["https://example.com/venue"]);
});

test("buildWeddingKnowledgeGraphState redacts imported persisted-decision graph metadata", () => {
  const decisions = weddingPersistedDecisionRecordsToGraphDecisions([{
    id: "wedding_decision:imported:harbour-hall",
    artifactId: "wedding_import:vendor_table:workspace:venues-xlsx",
    artifactTitle: "Imported XLSX: venues.xlsx",
    artifactKind: "vendor_table",
    selectedOptionId: "row-1",
    selectedOptionLabel: "Harbour Hall",
    selectedOptionDetail: "Selected waterfront venue.",
    selectedOptionCells: ["Harbour Hall", "Sydney Harbour"],
    sourceLabels: ["source: venues.xlsx", "original upload saved"],
    sourceUrls: [
      "https://storage.example.test/uploads/venues.xlsx?token=private",
      "https://example.com/venue",
    ],
    sourceProviderLabels: ["manual_review"],
    createdAt: "2026-09-12T00:00:00.000Z",
    source: "local_selection",
    metadataLabels: ["source: venues.xlsx"],
  }]);
  const state = buildWeddingKnowledgeGraphState({
    metadata: baseMetadata,
    decisions,
  });
  const selectedDecision = state.nodes.find((node) => node.kind === "decision" && /Harbour Hall/i.test(node.label));
  const serialized = JSON.stringify(state);

  assert.ok(selectedDecision);
  assert.equal(selectedDecision.metadata.artifact_title, "Imported private planning file");
  assert.deepEqual(selectedDecision.metadata.source_labels, ["Imported private planning file"]);
  assert.deepEqual(selectedDecision.metadata.source_urls, ["https://example.com/venue"]);
  assert.equal(serialized.includes("venues.xlsx"), false);
  assert.equal(serialized.includes("storage.example.test"), false);
  assert.equal(serialized.includes("token=private"), false);
  assert.equal(serialized.includes("original upload saved"), false);
});

test("buildWeddingKnowledgeGraphState uses missing evidence before claiming readiness", () => {
  const sparse = buildWeddingKnowledgeGraphState({ metadata: baseMetadata });
  assert.ok(sparse.missingEvidenceLabels.includes("No vendor comparison artifact yet."));
  assert.ok(sparse.missingEvidenceLabels.includes("No budget sheet artifact yet."));
  assert.ok(sparse.missingEvidenceLabels.includes("No timeline or scheduled milestone yet."));
  assert.ok(sparse.missingEvidenceLabels.includes("No planning task projection yet."));
  assert.equal(sparse.nextActionLabel, "No vendor comparison artifact yet.");

  const complete = buildWeddingKnowledgeGraphState({
    metadata: baseMetadata,
    artifacts: [
      artifact({
        id: "artifact:vendors",
        title: "Vendor table",
        kind: "vendor_table",
        sourceLinks: [{ label: "Vendor source", url: "https://example.com/vendor" }],
      }),
      artifact({
        id: "artifact:budget",
        title: "Budget sheet",
        kind: "budget_sheet",
        sourceLinks: [{ label: "Quote", url: "https://example.com/quote" }],
      }),
      artifact({ id: "artifact:timeline", title: "Run sheet", kind: "timeline" }),
    ],
    taskItems: [{
      id: "confirm-venue",
      title: "Confirm venue",
      kind: "decision",
      dueAt: "2027-01-01T17:00:00+11:00",
    }],
  });

  assert.deepEqual(complete.missingEvidenceLabels, []);
  assert.equal(complete.nextActionLabel, "Continue planning from the wedding workspace.");
});

test("buildWeddingKnowledgeGraphState turns weak artifact sources into verification risks", () => {
  const state = buildWeddingKnowledgeGraphState({
    metadata: baseMetadata,
    artifacts: [
      artifact({
        id: "artifact:vendor-table",
        title: "Vendor shortlist",
        kind: "vendor_table",
        sourceLabels: ["Agent research"],
      }),
      artifact({
        id: "artifact:guest-list",
        title: "Guest list",
        kind: "guest_list",
      }),
    ],
  });

  const sourceRisk = state.nodes.find((node) => (
    node.kind === "risk"
    && node.supertags.includes("wedding_source_verification")
  ));
  const vendorArtifact = state.nodes.find((node) => node.kind === "artifact" && node.label === "Vendor shortlist");

  assert.ok(sourceRisk);
  assert.equal(sourceRisk.label, "Verify sources for Vendor shortlist");
  assert.equal(sourceRisk.metadata.source_artifact_id, "artifact:vendor-table");
  assert.equal(sourceRisk.metadata.severity, "medium");
  assert.ok(String(sourceRisk.metadata.evidence).includes("Source labels exist"));
  assert.ok(vendorArtifact);
  assert.equal(vendorArtifact.metadata.evidence_status, "source_labelled");
  assert.ok(state.edges.some((edge) => edge.kind === "has_risk" && edge.source === vendorArtifact.id && edge.target === sourceRisk.id));
  assert.equal(state.nodes.some((node) => node.kind === "risk" && /Guest list/i.test(node.label)), false);
});

test("buildWeddingKnowledgeGraphState redacts imported source labels in graph evidence", () => {
  const state = buildWeddingKnowledgeGraphState({
    metadata: baseMetadata,
    artifacts: [
      artifact({
        id: "wedding_import:budget_sheet:workspace:private-family-budget-xlsx",
        title: "Imported XLSX: private-family-budget.xlsx",
        kind: "research",
        metadata: {
          ...baseMetadata,
          artifactKind: "research",
          supertags: ["wedding_import", "wedding_import:spreadsheet", "wedding_import_status:synthesized"],
        },
        sourceLabels: ["original upload saved", "source: private-family-budget.xlsx"],
      }),
    ],
    taskItems: [{ id: "task", title: "Review imported budget evidence", kind: "budget_review" }],
  });

  const artifactNode = state.nodes.find((node) => node.kind === "artifact" && node.label === "Imported private planning file");
  const sourceRisk = state.nodes.find((node) => (
    node.kind === "risk"
    && node.supertags.includes("wedding_source_verification")
  ));
  const serialized = JSON.stringify(state);

  assert.ok(artifactNode);
  assert.equal(artifactNode.metadata.imported_private_evidence, true);
  assert.deepEqual(artifactNode.metadata.source_labels, ["Imported private planning file"]);
  assert.equal(artifactNode.metadata.source_label_count, 2);
  assert.ok(sourceRisk);
  assert.equal(sourceRisk.label, "Verify sources for Imported private planning file");
  assert.equal(sourceRisk.metadata.imported_private_evidence, true);
  assert.deepEqual(sourceRisk.metadata.source_labels, ["Imported private planning file"]);
  assert.match(String(sourceRisk.metadata.evidence), /private import source labels redacted/i);
  assert.equal(serialized.includes("private-family-budget.xlsx"), false);
  assert.equal(serialized.includes("original upload saved"), false);
});
