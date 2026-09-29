import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingTemplateFollowUpState } from "@/lib/weddingTemplateFollowUpState";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test("buildWeddingTemplateFollowUpState turns answered prompts into saveable planning artifacts", () => {
  const state = buildWeddingTemplateFollowUpState({
    weddingPlanId: "wedding_plan:harbour",
    responseWorkspaceId: "response_workspace:harbour-follow-up",
    dateOrSeason: "October 2027",
    location: "Sydney NSW",
    guestCount: 80,
    familyOrStakeholderRoles: "Alex and Sam",
    topPriorities: ["low stress", "food", "photos"],
    atmosphereDescription: "garden ceremony with relaxed dinner energy",
    inspirationImageUrls: ["https://example.com/inspiration/garden.jpg"],
    vendorCategories: ["photographer", "band", "cake_baker"],
    vendorPreferences: "Natural photos, acoustic music, transparent packages",
    photographyScope: "day-of coverage and wedding-photo style inspiration",
    vowPreference: "create",
    vowStyle: "warm_personal",
    relationshipFactLabels: ["They built their relationship around weekend bushwalks"],
    vowChecklistItems: ["Keep ceremony vows under two minutes"],
    countryCode: "AU",
    noimDownloaded: "no",
    celebrantPath: "need_options",
    projectionStorage: memoryStorage(),
  });

  assert.ok(state.metadata.supertags.includes("template_follow_up:wedding_planning"));
  assert.ok(state.answeredLabels.includes("Date/season: October 2027"));
  assert.ok(state.answeredLabels.includes("Location: Sydney NSW"));
  assert.ok(state.answeredLabels.includes("Guest count: 80"));
  assert.ok(state.answeredLabels.includes("Couple: Alex and Sam"));
  assert.ok(state.answeredLabels.includes("Atmosphere: garden ceremony with relaxed dinner energy"));
  assert.ok(state.answeredLabels.includes("Inspiration links: 1"));
  assert.ok(state.answeredLabels.includes("Vendor needed: Photographer"));
  assert.ok(state.answeredLabels.includes("Vendor needed: Band"));
  assert.equal(state.artifactGeneration.artifacts.length, 1);
  assert.equal(state.vendorSearchReadiness.status, "partial");
  assert.ok(state.vendorSearchReadiness.missing.includes("live vendor-search provider"));
  assert.equal(state.legalSetup?.artifact.summary.kind, "legal");
  assert.equal(state.workspaceView.workspace.totalArtifacts, 6);
  assert.equal(state.richResponse.renderer, "wedding_travel_style_response");
  assert.ok(state.richResponse.sections.some((section) => section.id === "legal"));
  assert.ok(state.richResponse.sections.some((section) => section.id === "tasks"));
  assert.equal(state.workspaceView.projectionQueue?.primaryAction.kind, "save_pending_outputs");
  assert.ok(state.workspaceView.projectionQueue?.groups.some((group) => group.label === "Context"));
  assert.match(state.artifactGeneration.artifacts[0]?.markdown ?? "", /NOIM and authorised celebrant path/i);
  assert.match(state.artifactGeneration.artifacts[0]?.markdown ?? "", /official Australian Government marriage sources/i);
  assert.match(state.artifactGeneration.artifacts[0]?.markdown ?? "", /Vendor search brief/i);
  assert.match(state.artifactGeneration.artifacts[0]?.markdown ?? "", /wedding photographer/i);
  assert.match(state.artifactGeneration.artifacts[0]?.markdown ?? "", /Focused vendor search queries/i);
  assert.match(state.artifactGeneration.artifacts[0]?.markdown ?? "", /Provider-specific vendor search plan/i);
  assert.match(state.artifactGeneration.artifacts[0]?.markdown ?? "", /garden ceremony with relaxed dinner energy/i);
  assert.deepEqual(state.contextProjection.planningContext.inspirationImageUrls, ["https://example.com/inspiration/garden.jpg"]);
  assert.match(state.artifactGeneration.artifacts[0]?.markdown ?? "", /Google Places API/i);
  assert.match(state.artifactGeneration.artifacts[0]?.markdown ?? "", /OSM \/ Overpass API/i);
  assert.equal(
    state.vendorSearchLaunchQuery,
    "Photographer, Band, Cake Baker searches in Sydney NSW for low stress, food, photos with garden ceremony with relaxed dinner energy",
  );
  assert.deepEqual(state.artifactGeneration.artifacts[0]?.summary.vendorLabels.slice(0, 3), ["Photographer", "Band", "Cake Baker"]);
  assert.ok(state.workspaceView.workspace.results.some((artifact) => /Wedding lifecycle brief/i.test(artifact.title)));
  assert.ok(state.workspaceView.workspace.results.some((artifact) => /Legal and administrative/i.test(artifact.title)));
  assert.ok(state.workspaceView.workspace.results.some((artifact) => /Final planning run sheet/i.test(artifact.title)));
  assert.ok(state.workspaceView.workspace.results.some((artifact) => artifact.title === "Vow preparation"));
  assert.ok(state.workspaceView.projectionQueue?.queue.pendingItems.some((item) => /contract/i.test(item.title)));
  assert.ok(state.workspaceView.projectionQueue?.queue.pendingItems.some((item) =>
    /live vendor-search provider/i.test(item.title)
    && (item.sendInput.metadata as Record<string, unknown>).second_order_loop === "contact_follow_up"
    && /live provider not connected/i.test(String(item.sendInput.content.description))
  ));
  assert.ok(state.workspaceView.projectionQueue?.queue.pendingItems.some((item) => /RSVP/i.test(item.title)));
  assert.ok(state.workspaceView.projectionQueue?.queue.pendingItems.some((item) => /seating/i.test(item.title)));
  assert.ok(state.workspaceView.projectionQueue?.queue.pendingItems.some((item) => /run sheet/i.test(item.title)));
  assert.ok(state.workspaceView.projectionQueue?.queue.pendingItems.some((item) => /weather contingency/i.test(item.title)));
  assert.ok(state.workspaceView.projectionQueue?.queue.pendingItems.some((item) => /vow/i.test(item.title)));
  assert.ok(state.workspaceView.projectionQueue?.groups.some((group) => group.label === "Tasks"));
  assert.ok(state.workspaceView.projectionQueue?.groups.some((group) => group.label === "Calendar"));
  assert.ok(state.workspaceView.projectionQueue?.queue.blockedItems.some((item) => /date review/i.test(item.blockedReason ?? "")));
});

test("buildWeddingTemplateFollowUpState records selected starter focus without requiring every starter", () => {
  const state = buildWeddingTemplateFollowUpState({
    dateOrSeason: "October 2027",
    location: "Sydney NSW",
    guestCount: 60,
    budgetComfort: "$30000",
    starterIntents: ["venue_search", "budget_plan", "registry"],
    projectionStorage: memoryStorage(),
  });

  assert.match(state.artifactGeneration.artifacts[0]?.markdown ?? "", /User selected starter focus: Find venues, Build budget, Draft registry/i);
});

test("buildWeddingTemplateFollowUpState creates budget rows without inventing amounts", () => {
  const state = buildWeddingTemplateFollowUpState({
    dateOrSeason: "Summer 2028",
    location: "Hunter Valley",
    guestCount: "100-120",
    budgetComfort: "Keep it lean",
    projectionStorage: memoryStorage(),
  });

  const kinds = state.artifactGeneration.artifacts.map((artifact) => artifact.summary.kind);

  assert.deepEqual(kinds, ["research", "budget_sheet"]);
  assert.match(state.artifactGeneration.artifacts[1]?.markdown ?? "", /User comfort: Keep it lean/i);
  assert.doesNotMatch(state.artifactGeneration.artifacts[1]?.markdown ?? "", /\$[0-9]/);
  assert.ok(state.workspaceView.filterChips.some((chip) => chip.query === "budget_sheet"));
  assert.equal(state.richResponse.sections.find((section) => section.id === "budget")?.blocks[0]?.kind, "table");
  assert.equal(state.readyForFirstRecommendations, false);
  assert.match(state.nextQuestionLabel, /top three priorities/i);
});

test("buildWeddingTemplateFollowUpState projects missing vendor-search intake as a task", () => {
  const state = buildWeddingTemplateFollowUpState({
    location: "Sydney NSW",
    vendorCategories: ["photographer"],
    vendorPreferences: "documentary style",
    projectionStorage: memoryStorage(),
  });

  assert.equal(state.vendorSearchReadiness.status, "blocked");
  assert.ok(state.vendorSearchReadiness.missing.some((item) => /photography scope/i.test(item)));
  assert.ok(state.workspaceView.projectionQueue?.queue.pendingItems.some((item) =>
    item.title === "Complete vendor-search intake before researching vendors"
    && (item.sendInput.metadata as Record<string, unknown>).wedding_task_kind === "research"
    && /photography scope/i.test(String(item.sendInput.content.description))
  ));
});

test("buildWeddingTemplateFollowUpState remains useful before answers are captured", () => {
  const state = buildWeddingTemplateFollowUpState({ projectionStorage: memoryStorage() });

  assert.deepEqual(state.answeredLabels, []);
  assert.equal(state.artifactGeneration.artifacts.length, 1);
  assert.match(state.artifactGeneration.artifacts[0]?.markdown ?? "", /No answered Need-To-Know prompts/i);
  assert.equal(state.contextProjection.answeredLabels.length, 0);
  assert.match(state.nextQuestionLabel, /wedding date, month, or season/i);
});

test("buildWeddingTemplateFollowUpState creates calendar-ready Australian legal reminders from exact dates", () => {
  const state = buildWeddingTemplateFollowUpState({
    dateOrSeason: "2027-10-03",
    location: "Melbourne VIC",
    countryCode: "AU",
    noimDownloaded: "yes",
    celebrantPath: "own_celebrant",
    projectionStorage: memoryStorage(),
  });

  assert.equal(state.legalSetup?.scheduleItems[0]?.reviewStatus, "accepted");
  assert.match(state.legalSetup?.scheduleItems[0]?.startAt ?? "", /^2027-09-/);
  assert.ok(state.workspaceView.workspace.results.some((artifact) => artifact.kind === "legal"));
  assert.ok(state.workspaceView.projectionQueue?.queue.pendingItems.some((item) => /NOIM/i.test(item.title)));
});
