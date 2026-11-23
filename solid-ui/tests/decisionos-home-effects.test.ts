import test from "node:test";
import assert from "node:assert/strict";

import {
  dispatchDecisionOsSearchAction,
  openDecisionOsContextItem,
} from "../src/lib/decisionOsHomeEffects.js";

test("decisionos home effects dispatches search action chips", () => {
  const dispatched = [];
  dispatchDecisionOsSearchAction("impact:high", (chip) => dispatched.push(chip));
  assert.deepEqual(dispatched, [
    { id: "search:impact:high", label: "Search: impact:high" },
  ]);
});

test("decisionos home effects routes context items to the right side effect", () => {
  const navigations = [];
  const externals = [];
  const deps = {
    navigateToView: (view, params) => navigations.push({ view, params }),
    openExternal: (href) => externals.push(href),
    sanitizeHref: (href) => `safe:${href}`,
  };

  assert.deepEqual(
    openDecisionOsContextItem({ sourceRefs: ["thread:launch-thread"] }, deps),
    { kind: "threads", threadId: "launch-thread", messageId: undefined },
  );
  assert.deepEqual(
    openDecisionOsContextItem({ sourceRefs: ["calendar:event-1"] }, deps),
    { kind: "calendar" },
  );
  assert.deepEqual(
    openDecisionOsContextItem({ sourceUrl: "https://example.com/item" }, deps),
    { kind: "external", href: "https://example.com/item" },
  );

  assert.deepEqual(navigations, [
    { view: "threads", params: { threadId: "launch-thread", messageId: undefined } },
    { view: "calendar", params: undefined },
  ]);
  assert.deepEqual(externals, ["safe:https://example.com/item"]);
});
