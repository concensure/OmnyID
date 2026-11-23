import test from "node:test";
import assert from "node:assert/strict";

import {
  dispatchSkillDeactivationEvent,
  readSkillDeactivationEventDetail,
  subscribeSkillDeactivationEvent,
} from "../src/lib/skillDeactivationEvent.ts";

test("readSkillDeactivationEventDetail accepts only string skill ids", () => {
  assert.deepEqual(
    readSkillDeactivationEventDetail(new CustomEvent("x", { detail: { skillId: "skill-1" } })),
    { skillId: "skill-1" },
  );
  assert.equal(
    readSkillDeactivationEventDetail(new CustomEvent("x", { detail: { skillId: 7 } })),
    null,
  );
  assert.equal(
    readSkillDeactivationEventDetail(new CustomEvent("x", { detail: "invalid-detail" })),
    null,
  );
  assert.equal(
    readSkillDeactivationEventDetail(new Event("x")),
    null,
  );
});

test("subscribeSkillDeactivationEvent relays normalized detail and unsubscribes cleanly", () => {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const target = {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (typeof listener !== "function") return;
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener as (event: Event) => void);
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (typeof listener !== "function") return;
      listeners.get(type)?.delete(listener as (event: Event) => void);
    },
    dispatchEvent(event: Event) {
      for (const listener of listeners.get(event.type) ?? []) listener(event);
      return true;
    },
  } as unknown as Window;

  const seen: string[] = [];
  const unsubscribe = subscribeSkillDeactivationEvent((detail) => {
    seen.push(detail.skillId);
  }, target);

  dispatchSkillDeactivationEvent({ skillId: "skill-1" }, target);
  target.dispatchEvent(new CustomEvent("omnyid:deactivate-skill", { detail: { skillId: 7 } }));

  assert.deepEqual(seen, ["skill-1"]);

  unsubscribe();
  dispatchSkillDeactivationEvent({ skillId: "skill-2" }, target);
  assert.deepEqual(seen, ["skill-1"]);
});
