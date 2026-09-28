import test from "node:test";
import assert from "node:assert/strict";

import {
  DECISION_OS_FOCUS_EVENT,
  DECISION_OS_NAVIGATE_EVENT,
  openContinuityDecisionThreadTarget,
  readDecisionOsFocusEventDetail,
  readDecisionOsNavigateEventDetail,
  subscribeDecisionOsFocusEvent,
  subscribeDecisionOsNavigateEvent,
} from "../src/lib/decisionosNavigation.ts";

function captureNavigateDetail(run: () => void) {
  const originalWindow = globalThis.window;
  let captured: Event | null = null;
  Object.assign(globalThis, {
    window: {
      dispatchEvent(event: Event) {
        if (event.type === DECISION_OS_NAVIGATE_EVENT) {
          captured = event;
        }
        return true;
      },
    },
  });
  try {
    run();
  } finally {
    globalThis.window = originalWindow;
  }
  return captured ? readDecisionOsNavigateEventDetail(captured) : null;
}

test("decisionos continuity navigation opens direct surfaces for prepared work targets", () => {
  const homeDetail = captureNavigateDetail(() =>
    openContinuityDecisionThreadTarget({
      panel_kind: "home",
      surface_hint: "home",
      source_refs: [],
    } as any),
  );
  assert.deepEqual(homeDetail, { view: "home" });

  const decisionDetail = captureNavigateDetail(() =>
    openContinuityDecisionThreadTarget({
      panel_kind: " decision_queue ",
      surface_hint: "decision_queue",
      source_refs: [],
    } as any),
  );
  assert.deepEqual(decisionDetail, { view: "decision_queue" });

  const responseDetail = captureNavigateDetail(() =>
    openContinuityDecisionThreadTarget({
      panel_kind: "response_queue",
      surface_hint: "response_queue",
      source_refs: [],
    } as any),
  );
  assert.deepEqual(responseDetail, { view: "response_queue" });
});

test("decisionos continuity navigation maps context panel targets back to workspace home", () => {
  const detail = captureNavigateDetail(() =>
    openContinuityDecisionThreadTarget({
      panel_kind: "context_panel",
      surface_hint: "context_panel",
      source_refs: [],
    } as any),
  );
  assert.deepEqual(detail, { view: "home" });
});

test("decisionos continuity navigation prefers explicit panel targets over source thread refs", () => {
  const decisionDetail = captureNavigateDetail(() =>
    openContinuityDecisionThreadTarget({
      panel_kind: "decision_queue",
      surface_hint: "decision_queue",
      source_refs: ["thread:renewal_1", "message:renewal_1"],
    } as any),
  );
  assert.deepEqual(decisionDetail, { view: "decision_queue" });

  const workspaceDetail = captureNavigateDetail(() =>
    openContinuityDecisionThreadTarget({
      panel_kind: "home",
      surface_hint: "home",
      source_refs: ["thread:launch_1", "message:launch_1"],
    } as any),
  );
  assert.deepEqual(workspaceDetail, { view: "home" });
});

test("decisionos continuity destination label uses workspace wording for home-routed prepared work", async () => {
  const { decisionOsContinuityDecisionThreadLabel } = await import("../src/lib/decisionosNavigation.ts");

  assert.equal(
    decisionOsContinuityDecisionThreadLabel({
      panel_kind: "home",
      surface_hint: "home",
      source_refs: ["thread:launch_1"],
    } as any),
    "workspace",
  );

  assert.equal(
    decisionOsContinuityDecisionThreadLabel(undefined, [
      {
        id: "act_2",
        title: "Review launch note",
        category: "prepared_work",
        urgency: "medium",
        confidence: "medium",
        requires_approval: false,
        suggested_action: "Open workspace",
        surface_hint: "home",
        source_refs: ["thread:launch_2"],
      } as any,
    ]),
    "workspace",
  );
});

test("decisionos continuity navigation prefers explicit action-item surfaces over source thread refs", () => {
  const decisionDetail = captureNavigateDetail(() =>
    openContinuityDecisionThreadTarget(undefined, [
      {
        id: "act_1",
        title: "Review renewal memo",
        category: "prepared_work",
        urgency: "high",
        confidence: "medium",
        requires_approval: false,
        suggested_action: "Review prepared decision support",
        surface_hint: "decision_queue",
        source_refs: ["thread:renewal_2", "message:renewal_2"],
      } as any,
    ]),
  );
  assert.deepEqual(decisionDetail, { view: "decision_queue" });

  const workspaceDetail = captureNavigateDetail(() =>
    openContinuityDecisionThreadTarget(undefined, [
      {
        id: "act_2",
        title: "Review launch note",
        category: "prepared_work",
        urgency: "medium",
        confidence: "medium",
        requires_approval: false,
        suggested_action: "Open workspace",
        surface_hint: "home",
        source_refs: ["thread:launch_2", "message:launch_2"],
      } as any,
    ]),
  );
  assert.deepEqual(workspaceDetail, { view: "home" });
});

test("subscribeDecisionOsNavigateEvent relays normalized detail and unsubscribes cleanly", () => {
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

  const seen: Array<Record<string, unknown>> = [];
  const unsubscribe = subscribeDecisionOsNavigateEvent((detail) => {
    seen.push(detail);
  }, target);

  target.dispatchEvent(new CustomEvent(DECISION_OS_NAVIGATE_EVENT, { detail: { view: " home " } }));
  target.dispatchEvent(new CustomEvent(DECISION_OS_NAVIGATE_EVENT, { detail: { view: " threads ", threadId: "thread-1" } }));
  target.dispatchEvent(new CustomEvent(DECISION_OS_NAVIGATE_EVENT, { detail: { view: "threads", threadId: 7 } }));
  target.dispatchEvent(new CustomEvent(DECISION_OS_NAVIGATE_EVENT, { detail: { view: "agent_settings", settingsTab: "missing" } }));

  assert.deepEqual(seen, [
    { view: "home" },
    { view: "threads", threadId: "thread-1" },
  ]);

  unsubscribe();
  target.dispatchEvent(new CustomEvent(DECISION_OS_NAVIGATE_EVENT, { detail: { view: "calendar" } }));
  assert.deepEqual(seen, [
    { view: "home" },
    { view: "threads", threadId: "thread-1" },
  ]);
});

test("subscribeDecisionOsFocusEvent relays normalized detail and unsubscribes cleanly", () => {
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
  const unsubscribe = subscribeDecisionOsFocusEvent((detail) => {
    seen.push(detail.panel);
  }, target);

  const validEvent = new CustomEvent(DECISION_OS_FOCUS_EVENT, { detail: { panel: "response_queue" } });
  assert.deepEqual(readDecisionOsFocusEventDetail(validEvent), { panel: "response_queue" });
  target.dispatchEvent(validEvent);
  target.dispatchEvent(new CustomEvent(DECISION_OS_FOCUS_EVENT, { detail: { panel: 7 } }));

  unsubscribe();
  target.dispatchEvent(new CustomEvent(DECISION_OS_FOCUS_EVENT, { detail: { panel: "decision_queue" } }));

  assert.deepEqual(seen, ["response_queue"]);
});
