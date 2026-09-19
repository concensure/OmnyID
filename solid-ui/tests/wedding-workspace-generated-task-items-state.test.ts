import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingDelegationState } from "@/lib/weddingDelegationState";
import { buildWeddingFinalPhaseCoordinationState } from "@/lib/weddingFinalPhaseCoordinationState";
import { buildWeddingGuestTrackingState } from "@/lib/weddingGuestTrackingState";
import { buildWeddingLegalAdministrationState } from "@/lib/weddingLegalAdministrationState";
import { buildWeddingOracleUpdatePlanState } from "@/lib/weddingOracleUpdatePlanState";
import { buildWeddingPostWeddingWrapUpState } from "@/lib/weddingPostWeddingWrapUpState";
import { buildWeddingProductionReadinessState } from "@/lib/weddingProductionReadinessState";
import { buildWeddingVendorSeedState } from "@/lib/weddingVendorSeedState";
import { buildWeddingVowPlanningState } from "@/lib/weddingVowPlanningState";
import { buildWeddingWorkspaceGeneratedTaskItems } from "@/lib/weddingWorkspaceGeneratedTaskItemsState";

const metadata = {
  wedding_plan_id: "wedding_plan:generated-tasks",
  response_workspace_id: "response_workspace:generated-tasks",
};

test("buildWeddingWorkspaceGeneratedTaskItems includes guest follow-up and final-count decision tasks", () => {
  const guestTracking = buildWeddingGuestTrackingState({
    artifacts: [{
      title: "Guest list",
      kind: "guest_list",
      bodyText: [
        "| Name | RSVP | Email | Meal |",
        "| --- | --- | --- | --- |",
        "| Alex | Confirmed | alex@example.test | Beef |",
        "| Blair | Pending |  |  |",
      ].join("\n"),
    }],
  });
  const tasks = buildWeddingWorkspaceGeneratedTaskItems({ guestTracking, metadata });

  assert.ok(tasks.some((task) => task.id === "wedding_guest_follow_up:pending_rsvps"));
  assert.ok(tasks.some((task) => task.id === "wedding_guest_follow_up:missing_contacts"));
  assert.ok(tasks.some((task) => task.id === "wedding_guest_final_count_decision"));
});

test("buildWeddingWorkspaceGeneratedTaskItems keeps saved final-count decisions from duplicating", () => {
  const guestTracking = buildWeddingGuestTrackingState({
    artifacts: [{
      title: "Guest list",
      kind: "guest_list",
      bodyText: "| Name | RSVP |\n| --- | --- |\n| Alex | Confirmed |",
    }],
  });
  const tasks = buildWeddingWorkspaceGeneratedTaskItems({
    guestTracking,
    metadata,
    baseTaskItems: [{
      id: "task:final-count",
      title: "Choose final count",
      kind: "decision",
      metadata: { guest_final_count_decision: true },
    }],
  });

  assert.equal(tasks.filter((task) => task.id === "wedding_guest_final_count_decision").length, 0);
  assert.ok(tasks.some((task) => task.id === "task:final-count"));
});

test("buildWeddingWorkspaceGeneratedTaskItems recovers post-wedding wrap-up tasks from artifacts", () => {
  const wrapUp = buildWeddingPostWeddingWrapUpState({
    metadata,
    coupleLabel: "Maya and Ozan",
    vendorNames: ["Photo Team"],
    knownMemoryLabels: ["first dance under fairy lights"],
    createdAt: 1,
  });
  const tasks = buildWeddingWorkspaceGeneratedTaskItems({
    artifacts: [wrapUp.artifactInput],
    metadata,
  });

  assert.ok(tasks.some((task) => /thank-you/i.test(task.title)));
  assert.ok(tasks.some((task) => /vendor feedback/i.test(task.title)));
  assert.ok(tasks.some((task) => /scrapbook/i.test(task.title)));
});

test("buildWeddingWorkspaceGeneratedTaskItems recovers vow preparation tasks from artifacts", () => {
  const vow = buildWeddingVowPlanningState({
    metadata,
    preference: "create",
    styleId: "short_modern",
  });
  const tasks = buildWeddingWorkspaceGeneratedTaskItems({
    artifacts: [vow.artifact.input],
    metadata,
  });

  assert.ok(tasks.some((task) => /personal vows or a standard vow/i.test(task.title)));
  assert.ok(tasks.some((task) => /Pick vow style/i.test(task.title)));
  assert.ok(tasks.some((task) => /Collect vow memories/i.test(task.title)));
});

test("buildWeddingWorkspaceGeneratedTaskItems includes delegated responsibility tasks", () => {
  const delegation = buildWeddingDelegationState([
    {
      category: "venue_selection",
      personName: "Harbour Planner",
      relationship: "Planner",
      email: "planner@example.com",
    },
  ]);
  const tasks = buildWeddingWorkspaceGeneratedTaskItems({
    delegation,
    metadata,
  });

  assert.ok(tasks.some((task) => task.id === "wedding_delegation:venue-selection:harbour-planner"));
  assert.ok(tasks.some((task) =>
    (task.metadata as Record<string, unknown>).delegation_task === true
    && task.assignee === "Harbour Planner"
  ));
});

test("buildWeddingWorkspaceGeneratedTaskItems recovers final-phase coordination tasks from artifacts", () => {
  const finalPhase = buildWeddingFinalPhaseCoordinationState({
    metadata,
    planningContext: {
      dateOrSeason: "2027-07-01",
      location: "Garden, Sydney NSW",
    },
  });
  const tasks = buildWeddingWorkspaceGeneratedTaskItems({
    artifacts: [finalPhase.artifact.input],
    metadata,
  });

  assert.ok(tasks.some((task) => /final vendors/i.test(task.title)));
  assert.ok(tasks.some((task) => /vendor delay/i.test(task.title)));
  assert.ok(tasks.some((task) => /payment receipt/i.test(task.title)));
  assert.ok(tasks.some((task) =>
    (task.metadata as Record<string, unknown>).final_phase_task === true
    && task.linkedArtifactId === finalPhase.artifact.input.id
  ));
});

test("buildWeddingWorkspaceGeneratedTaskItems recovers legal administration tasks from artifacts", () => {
  const legal = buildWeddingLegalAdministrationState({
    metadata,
    planningContext: {
      dateOrSeason: "2027-07-01",
      location: "Sydney NSW",
      countryCode: "AU",
    },
  });
  const tasks = buildWeddingWorkspaceGeneratedTaskItems({
    artifacts: [legal.artifact.input],
    metadata,
  });

  assert.ok(tasks.some((task) => /proof of date\/place of birth/i.test(task.title)));
  assert.ok(tasks.some((task) => /photo ID/i.test(task.title)));
  assert.ok(tasks.some((task) =>
    (task.metadata as Record<string, unknown>).legal_administration_task === true
    && task.linkedArtifactId === legal.artifact.input.id
  ));
});

test("buildWeddingWorkspaceGeneratedTaskItems recovers vendor search review tasks from artifacts", () => {
  const vendorPacket = {
    id: "wedding_artifact:vendor_search_sources:generated-tasks",
    title: "Vendor search source packet",
    kind: "vendor_table" as const,
    metadata: {
      ...metadata,
      source: "vendor_search_executor",
      sourceProviderLabels: ["Brave Search"],
      vendorCategories: ["Photographer"],
    },
    bodyText: "This artifact records source-backed vendor-search evidence. Ask the user to tick selected vendors before drafting outreach.",
  };
  const tasks = buildWeddingWorkspaceGeneratedTaskItems({
    artifacts: [vendorPacket],
    metadata,
  });

  assert.ok(tasks.some((task) => /source freshness/i.test(task.title)));
  assert.ok(tasks.some((task) => /Tick preferred vendor/i.test(task.title)));
  assert.ok(tasks.some((task) =>
    (task.metadata as Record<string, unknown>).vendor_search_review_task === true
    && task.linkedArtifactId === vendorPacket.id
  ));
});

test("buildWeddingWorkspaceGeneratedTaskItems recovers seeded vendor review tasks from artifacts", () => {
  const seedState = buildWeddingVendorSeedState({
    metadata,
    now: new Date("2026-09-14T12:00:00Z"),
    seeds: [{
      vendorSlug: "photo-seed",
      vendorName: "Photo Seed",
      category: "Photographer",
      serviceArea: "Sydney, NSW",
      websiteUrl: "https://photo.example",
      sourceUrl: "https://photo.example",
      sourceLabel: "Photo source",
      sourceCheckedAt: "2026-09-14",
      evidence: {
        price_basis: "not verified; request quote",
        availability_basis: "not verified; request date-specific availability",
      },
    }],
  });
  const tasks = buildWeddingWorkspaceGeneratedTaskItems({
    artifacts: seedState.artifactInput ? [seedState.artifactInput] : [],
    metadata,
  });

  assert.ok(tasks.some((task) => /seeded vendor price/i.test(task.title)));
  assert.ok(tasks.some((task) =>
    (task.metadata as Record<string, unknown>).vendor_seed_review_task === true
    && task.linkedArtifactId === seedState.artifactInput?.id
  ));
});

test("buildWeddingWorkspaceGeneratedTaskItems includes Oracle update readiness tasks", () => {
  const oracleUpdatePlan = buildWeddingOracleUpdatePlanState({
    productionReadiness: buildWeddingProductionReadinessState(),
    targetLabel: "Oracle wedding prod",
  });
  const tasks = buildWeddingWorkspaceGeneratedTaskItems({
    oracleUpdatePlan,
    metadata,
  });

  assert.ok(tasks.some((task) => /Unblock Oracle update/i.test(task.title)));
  assert.ok(tasks.some((task) =>
    (task.metadata as Record<string, unknown>).oracle_update_plan_task === true
    && (task.metadata as Record<string, unknown>).production_readiness_oracle_gate === true
  ));
});

test("buildWeddingWorkspaceGeneratedTaskItems surfaces due editable-vendor outreach follow-ups", () => {
  const tasks = buildWeddingWorkspaceGeneratedTaskItems({
    metadata,
    now: "2026-09-14T00:00:00.000Z",
    weddingVendors: [
      {
        vendorId: "vendor:photo-team",
        vendorName: "Photo Team",
        category: "Photographer",
        userContact: {
          contactMethod: "email",
          lastContactAt: "2026-09-09T00:00:00.000Z",
          followUpDueAt: "2026-09-14T00:00:00.000Z",
        },
      },
      {
        vendorId: "vendor:venue",
        vendorName: "Harbour Hall",
        category: "Venue",
        userContact: {
          contactMethod: "personal_email",
          lastContactAt: "2026-09-12T00:00:00.000Z",
          followUpDueAt: "2026-09-17T00:00:00.000Z",
        },
      },
      {
        vendorId: "vendor:cake",
        vendorName: "Cake Studio",
        category: "Cake",
        userContact: {
          contactMethod: "master_agent",
          lastContactAt: "2026-09-01T00:00:00.000Z",
          responseReceivedAt: "2026-09-10T00:00:00.000Z",
        },
      },
    ],
  });

  assert.ok(tasks.some((task) => task.title === "Review one follow-up to Photo Team"));
  assert.equal(tasks.some((task) => /Harbour Hall/i.test(task.title)), false);
  assert.equal(tasks.some((task) => /Cake Studio/i.test(task.title)), false);
  assert.ok(tasks.some((task) =>
    (task.metadata as Record<string, unknown>).vendor_id === "vendor:photo-team"
    && (task.metadata as Record<string, unknown>).second_order_loop === "contact_follow_up"
  ));
});
