import assert from "node:assert/strict";
import test from "node:test";

import {
  WEDDING_HELPER_TASK_TAB_EVENT,
  dispatchWeddingHelperTaskTab,
  isWeddingHelperTaskTab,
  weddingHelperTaskTabFromEvent,
} from "@/lib/weddingHelpersNavigationState";

test("wedding helper task tab accepts only known task tabs", () => {
  assert.equal(isWeddingHelperTaskTab("open"), true);
  assert.equal(isWeddingHelperTaskTab("done"), true);
  assert.equal(isWeddingHelperTaskTab("later"), false);
  assert.equal(isWeddingHelperTaskTab(null), false);
});

test("wedding helper task tab event carries the requested tab", () => {
  assert.equal(
    weddingHelperTaskTabFromEvent(new CustomEvent("x", { detail: { tab: "done" } })),
    "done",
  );
  assert.equal(
    weddingHelperTaskTabFromEvent(new CustomEvent("x", { detail: { tab: "bad" } })),
    null,
  );
  assert.equal(weddingHelperTaskTabFromEvent(new Event("x")), null);
});

test("dispatchWeddingHelperTaskTab sends a typed browser event", () => {
  const events: Event[] = [];
  const target = {
    dispatchEvent: (event: Event) => {
      events.push(event);
      return true;
    },
  } as Window;

  dispatchWeddingHelperTaskTab("done", target);

  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, WEDDING_HELPER_TASK_TAB_EVENT);
  assert.equal(weddingHelperTaskTabFromEvent(events[0]!), "done");
});
