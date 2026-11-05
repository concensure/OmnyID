import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import { WEDDING_VENDOR_CHECKLIST } from "@/lib/weddingVendorChecklistState";
import {
  buildWeddingVendorLeadTimeRecommendations,
  buildWeddingVendorLeadTimeTaskItems,
  weddingVendorLeadTimeCoverageState,
  weddingVendorMustDecideFirstCategories,
} from "@/lib/weddingVendorLeadTimeState";

const metadata = {
  weddingPlanId: "wedding_plan:lead-time",
  responseWorkspaceId: "response_workspace:lead-time",
  sourceResponseId: "response:lead-time",
};

test("wedding vendor lead-time table covers the shipped vendor checklist", () => {
  const coverage = weddingVendorLeadTimeCoverageState();

  assert.equal(coverage.checklistCount, WEDDING_VENDOR_CHECKLIST.length);
  assert.deepEqual(coverage.missingCategoryIds, []);
  assert.equal(coverage.tableCount, WEDDING_VENDOR_CHECKLIST.length - 1);
  assert.equal(buildWeddingVendorLeadTimeRecommendations({ weddingDateOrSeason: "2027-10-14" }).some((item) => item.categoryId === "officiant"), false);
  assert.deepEqual(weddingVendorMustDecideFirstCategories().map((category) => category.categoryId), [
    "venue",
  ]);
});

test("buildWeddingVendorLeadTimeRecommendations ranks open and closing windows ahead of later categories", () => {
  const recommendations = buildWeddingVendorLeadTimeRecommendations({
    weddingDateOrSeason: "2027-10-14",
    now: new Date("2026-10-14T00:00:00.000Z"),
    selectedCategoryIds: ["photographer"],
  });

  assert.equal(recommendations[0]?.categoryId, "venue");
  assert.ok(recommendations.some((item) =>
    item.categoryId === "photographer"
    && item.status === "open"
    && /window is open/i.test(item.timingLabel)
  ));
  assert.ok((recommendations.find((item) => item.categoryId === "cake_baker")?.rankWeight ?? 0)
    < (recommendations.find((item) => item.categoryId === "photographer")?.rankWeight ?? 0));
});

test("buildWeddingVendorLeadTimeRecommendations suppresses booked or explicitly skipped categories", () => {
  const recommendations = buildWeddingVendorLeadTimeRecommendations({
    weddingDateOrSeason: "2027-10-14",
    now: new Date("2026-10-14T00:00:00.000Z"),
    skippedCategoryIds: ["officiant"],
    artifacts: [{
      id: "artifact:venue-booked",
      title: "Selected venue packet",
      kind: "vendor_table",
      metadata: {
        vendorCategories: ["venue"],
        wedding_vendor_booked: true,
      },
      bodyText: "Venue booked and deposit paid.",
    }],
  });

  assert.equal(recommendations.some((item) => item.categoryId === "venue"), false);
  assert.equal(recommendations.some((item) => item.categoryId === "officiant"), false);
});

test("buildWeddingVendorLeadTimeTaskItems creates research tasks for the existing decision pipeline", () => {
  const tasks = buildWeddingVendorLeadTimeTaskItems({
    weddingDateOrSeason: "2027-10-14",
    now: "2026-10-14T00:00:00.000Z",
    selectedCategoryIds: ["photographer"],
    metadata,
  });

  const venue = tasks.find((task) => task.metadata?.vendor_lead_time_category_id === "venue");
  assert.ok(venue);
  assert.match(venue.title, /Search for venue/);
  assert.equal(venue.kind, "research");
  assert.equal(venue.metadata?.vendor_lead_time_research_task, true);
  assert.equal(venue.metadata?.wedding_workspace_menu, "response_queue");
  assert.equal(venue.metadata?.vendor_search_review_task, true);
  assert.equal(venue.metadata?.vendor_search_action_id, "lead-time-venue");
  assert.deepEqual(venue.metadata?.vendor_search_categories, ["Venue"]);
  assert.equal(venue.metadata?.vendor_search_scope, "lead_time_category");
  assert.deepEqual(venue.metadata?.resurface_policy && typeof venue.metadata.resurface_policy === "object"
    ? (venue.metadata.resurface_policy as Record<string, unknown>).kind
    : null, "vendor_lead_time");
});

test("buildWeddingResponseWorkspaceViewState keeps lead-time vendor research in the uncapped decision queue", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    nowIso: "2026-10-14T00:00:00.000Z",
    contextItems: [{
      metadata: {
        ...metadata,
        template: "wedding_planning",
        artifactKind: null,
        supertags: [],
        privacyScope: "private",
        approvalState: "draft",
      },
      planningContext: {
        dateOrSeason: "2027-10-14",
        location: "Sydney NSW",
        guestCount: "90",
        vendorCategories: ["photographer"],
      },
      answeredLabels: [],
      nextQuestionLabel: "Next",
      readyForFirstRecommendations: true,
    }],
  });

  assert.ok(state.planningTaskItems.some((task) => task.metadata?.vendor_lead_time_research_task === true));
  assert.ok(state.personalOsProjection.decisionLoadRelief.focusItems.some((item) =>
    /Search for venue/i.test(item.title)
    && item.evidenceLabels.includes("vendor research timing")
  ));
  assert.ok(state.personalOsProjection.decisionLoadRelief.focusItems.length > 3);
  assert.equal(state.personalOsProjection.decisionLoadRelief.backlogCount, 0);
});
