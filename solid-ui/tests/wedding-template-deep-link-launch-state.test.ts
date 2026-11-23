import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingTemplateDeepLinkLaunch,
  dispatchWeddingTemplateDeepLinkLaunch,
} from "../src/lib/weddingTemplateDeepLinkLaunchState.ts";
import { OPEN_WEDDING_PLANNING_INTENT_EVENT } from "../src/lib/weddingNavigationState.ts";

test("buildWeddingTemplateDeepLinkLaunch returns the wedding planner target and launch intent", () => {
  const launch = buildWeddingTemplateDeepLinkLaunch();

  assert.equal(launch.viewTarget, "response_queue");
  assert.equal(launch.intent?.surface, "planning_files");
  assert.equal(launch.intent?.metadata.template, "wedding_planning");
});

test("dispatchWeddingTemplateDeepLinkLaunch emits the existing wedding navigation event", () => {
  const launch = buildWeddingTemplateDeepLinkLaunch();
  let captured: unknown = null;
  const target = new EventTarget() as Window;
  target.addEventListener(OPEN_WEDDING_PLANNING_INTENT_EVENT, (event) => {
    captured = (event as CustomEvent).detail;
  });

  dispatchWeddingTemplateDeepLinkLaunch(launch, target);

  assert.deepEqual(captured, launch.intent);
});
