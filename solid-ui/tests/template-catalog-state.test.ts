import assert from "node:assert/strict";
import test from "node:test";

import { buildTemplateCatalogState } from "@/lib/templateCatalogState";

test("buildTemplateCatalogState includes the wedding planning template card", () => {
  const catalog = buildTemplateCatalogState({
    weddingSeed: "Harbour Wedding 2027",
    weddingSourceResponseId: "afp:response-1",
  });
  const wedding = catalog.find((item) => item.id === "wedding_planning");

  assert.ok(wedding);
  assert.equal(wedding.title, "Wedding Planning");
  assert.equal(wedding.category, "life_event");
  assert.equal(wedding.viewTarget, "response_queue");
  assert.ok(wedding.tags.includes("Need-To-Know"));
  assert.ok(wedding.starterLabels.includes("Find venues"));
  assert.ok(wedding.starterLabels.includes("Make run sheet"));
  assert.equal(wedding.launchIntent?.surface, "planning_files");
  assert.equal(wedding.launchIntent?.view, "response_queue");
  assert.equal(wedding.launchIntent?.weddingPlanId, "wedding_plan:harbour-wedding-2027");
  assert.equal(wedding.launchIntent?.responseWorkspaceId, "response_workspace:harbour-wedding-2027-first-response");
  assert.equal(wedding.launchIntent?.sourceResponseId, "afp:response-1");
  assert.equal(wedding.secondaryActions.length, 1);
  assert.equal(wedding.secondaryActions[0]?.id, "open_sample_demo");
  assert.equal(wedding.secondaryActions[0]?.viewTarget, "response_queue");
  assert.equal(wedding.secondaryActions[0]?.launchIntent?.sourceResponseId, "demo:wedding-response");
  assert.equal(wedding.secondaryActions[0]?.launchIntent?.weddingPlanId, "wedding_plan:sample-harbour-wedding");
  assert.match(wedding.secondaryActions[0]?.description ?? "", /sample-only/i);
});

test("buildTemplateCatalogState keeps non-wedding templates as ordinary view launches", () => {
  const catalog = buildTemplateCatalogState();
  const cofounder = catalog.find((item) => item.id === "ai_cofounder_launchpad");
  const agentSetup = catalog.find((item) => item.id === "personal_agent_setup");

  assert.equal(cofounder?.viewTarget, "cofounder_studio");
  assert.equal(cofounder?.launchIntent, null);
  assert.deepEqual(cofounder?.secondaryActions, []);
  assert.equal(agentSetup?.viewTarget, "agent_settings");
  assert.equal(agentSetup?.launchIntent, null);
  assert.deepEqual(agentSetup?.secondaryActions, []);
});
