import test from "node:test";
import assert from "node:assert/strict";

import {
  dispatchGotoNodeEvent,
  readGotoNodeEventDetail,
  subscribeGotoNodeEvent,
} from "../src/lib/gotoNodeEvent.ts";
import {
  dispatchMagicActionEvent,
  readMagicActionEventDetail,
  subscribeMagicActionEvent,
} from "../src/lib/magicActionEvent.ts";
import { readOutcomeCheckScheduledEventDetail } from "../src/lib/outcomeCheckEvent.ts";

test("readMagicActionEventDetail accepts only valid magic action payloads", () => {
  assert.deepEqual(
    readMagicActionEventDetail(new CustomEvent("x", {
      detail: {
        action: "open",
        msgId: "decision-1",
        label: "Open",
        icon: "DQ",
      },
    })),
    {
      action: "open",
      msgId: "decision-1",
      label: "Open",
      icon: "DQ",
      el: undefined,
    },
  );
  assert.deepEqual(
    readMagicActionEventDetail(new CustomEvent("x", {
      detail: {
        action: "dismiss",
        msgId: null,
      },
    })),
    {
      action: "dismiss",
      msgId: null,
      label: undefined,
      icon: undefined,
      el: undefined,
    },
  );
  assert.equal(
    readMagicActionEventDetail(new CustomEvent("x", {
      detail: {
        action: 7,
        msgId: "decision-1",
      },
    })),
    null,
  );
  assert.equal(
    readMagicActionEventDetail(new CustomEvent("x", {
      detail: {
        action: "open",
        msgId: 7,
      },
    })),
    null,
  );
  assert.equal(
    readMagicActionEventDetail(new CustomEvent("x", {
      detail: {
        action: "open",
        msgId: "decision-1",
        label: 7,
      },
    })),
    null,
  );
  assert.equal(
    readMagicActionEventDetail(new CustomEvent("x", { detail: "invalid-detail" })),
    null,
  );
  assert.equal(readMagicActionEventDetail(new Event("x")), null);
});

test("readGotoNodeEventDetail accepts only optional string node ids", () => {
  assert.deepEqual(
    readGotoNodeEventDetail(new CustomEvent("x", { detail: { nodeId: "node-7" } })),
    { nodeId: "node-7" },
  );
  assert.deepEqual(
    readGotoNodeEventDetail(new CustomEvent("x", { detail: {} })),
    { nodeId: undefined },
  );
  assert.equal(
    readGotoNodeEventDetail(new CustomEvent("x", { detail: { nodeId: 7 } })),
    null,
  );
  assert.equal(
    readGotoNodeEventDetail(new CustomEvent("x", { detail: "invalid-detail" })),
    null,
  );
  assert.equal(readGotoNodeEventDetail(new Event("x")), null);
});

test("subscribeGotoNodeEvent reacts to helper payloads and unsubscribes cleanly", () => {
  const received: string[] = [];
  const target = new EventTarget() as Document;
  const unsubscribe = subscribeGotoNodeEvent((detail) => {
    received.push(detail.nodeId ?? "none");
  }, target);

  dispatchGotoNodeEvent({ nodeId: "node-7" }, target);
  target.dispatchEvent(new CustomEvent("omnyid:goto-node", {
    detail: {
      nodeId: 7,
    },
  }));
  unsubscribe();
  dispatchGotoNodeEvent({ nodeId: "node-9" }, target);

  assert.deepEqual(received, ["node-7"]);
});

test("subscribeMagicActionEvent reacts to helper payloads and unsubscribes cleanly", () => {
  const received: string[] = [];
  const target = new EventTarget() as Document;
  const unsubscribe = subscribeMagicActionEvent((detail) => {
    received.push(`${detail.action}:${detail.msgId ?? "null"}`);
  }, target);

  dispatchMagicActionEvent({
    action: "open",
    msgId: "decision-7",
    label: "Open",
  }, target);
  target.dispatchEvent(new CustomEvent("magic-action", {
    detail: {
      action: 7,
      msgId: "invalid",
    },
  }));
  unsubscribe();
  dispatchMagicActionEvent({
    action: "dismiss",
    msgId: "decision-9",
  }, target);

  assert.deepEqual(received, ["open:decision-7"]);
});

test("readOutcomeCheckScheduledEventDetail accepts only complete string payloads", () => {
  assert.deepEqual(
    readOutcomeCheckScheduledEventDetail(new CustomEvent("x", {
      detail: {
        id: "decision-1",
        title: "Check launch quality",
        checkAt: "2026-07-25T08:00:00Z",
      },
    })),
    {
      id: "decision-1",
      title: "Check launch quality",
      checkAt: "2026-07-25T08:00:00Z",
    },
  );
  assert.equal(
    readOutcomeCheckScheduledEventDetail(new CustomEvent("x", {
      detail: {
        id: 7,
        title: "Check launch quality",
        checkAt: "2026-07-25T08:00:00Z",
      },
    })),
    null,
  );
  assert.equal(
    readOutcomeCheckScheduledEventDetail(new CustomEvent("x", {
      detail: {
        id: "decision-1",
        title: "Check launch quality",
        checkAt: 7,
      },
    })),
    null,
  );
  assert.equal(
    readOutcomeCheckScheduledEventDetail(new CustomEvent("x", { detail: "invalid-detail" })),
    null,
  );
  assert.equal(readOutcomeCheckScheduledEventDetail(new Event("x")), null);
});
