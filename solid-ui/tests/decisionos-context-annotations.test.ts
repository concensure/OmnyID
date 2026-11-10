import test from "node:test";
import assert from "node:assert/strict";

import { accountScopedStorageKey } from "../src/lib/accountScopedStorage.ts";
import {
  decisionOsContextAnnotation,
  decisionOsContextAnnotationEditState,
  decisionOsContextAnnotationKeyDownState,
  decisionOsContextAnnotationKey,
  decisionOsContextAnnotationSaveState,
  saveDecisionOsContextAnnotation,
} from "../src/lib/decisionOsContextAnnotations.ts";

const userId = "user-1";
const annotationKey = accountScopedStorageKey("omnyid.decisionos.context-annotations", userId);

function installLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    value: localStorage,
    configurable: true,
    writable: true,
  });

  return localStorage;
}

test("context annotation keys prefer stable source refs across decisions", () => {
  installLocalStorage().clear();

  const first = decisionOsContextAnnotationKey({
    title: "Q3 Budget thread",
    sourceRefs: ["thread:q3-budget"],
  });
  const second = decisionOsContextAnnotationKey({
    title: "Budget discussion",
    sourceRefs: ["thread:q3-budget"],
    snippet: "Need approval before Friday",
  });

  assert.equal(first, "refs:thread:q3-budget");
  assert.equal(second, first);
});

test("context annotation storage resurfaces notes for equivalent items", () => {
  installLocalStorage().clear();

  const item = {
    title: "Q3 Budget thread",
    sourceRefs: ["thread:q3-budget"],
  };
  saveDecisionOsContextAnnotation(item, "Double-check legal sign-off.", userId);

  assert.equal(
    decisionOsContextAnnotation({
      title: "Budget thread",
      sourceRefs: ["thread:q3-budget"],
    }, userId),
    "Double-check legal sign-off.",
  );
});

test("blank context annotations clear existing notes", () => {
  installLocalStorage().clear();

  const item = {
    title: "Hiring panel notes",
    sourceRefs: ["note:hiring-panel"],
  };
  saveDecisionOsContextAnnotation(item, "Keep this private.", userId);
  assert.equal(decisionOsContextAnnotation(item, userId), "Keep this private.");

  saveDecisionOsContextAnnotation(item, "   ", userId);
  assert.equal(decisionOsContextAnnotation(item, userId), null);
});

test("context annotation edit state preloads stable key and saved note", () => {
  installLocalStorage().clear();

  const item = {
    title: "Q3 Budget thread",
    sourceRefs: ["thread:q3-budget"],
  };
  saveDecisionOsContextAnnotation(item, "Double-check legal sign-off.", userId);

  assert.deepEqual(decisionOsContextAnnotationEditState(item, userId), {
    editingKey: "refs:thread:q3-budget",
    draft: "Double-check legal sign-off.",
  });
});

test("context annotation save state clears local edit state after save", () => {
  installLocalStorage().clear();

  const item = {
    title: "Hiring panel notes",
    sourceRefs: ["note:hiring-panel"],
  };

  assert.deepEqual(decisionOsContextAnnotationSaveState(item, "Keep this private.", userId), {
    savedNote: "Keep this private.",
    editingKey: null,
    draft: "",
  });
  assert.equal(decisionOsContextAnnotation(item, userId), "Keep this private.");
});

test("context annotation keydown state saves on Enter and cancels on Escape", () => {
  installLocalStorage().clear();

  const item = {
    title: "Hiring panel notes",
    sourceRefs: ["note:hiring-panel"],
  };

  assert.deepEqual(
    decisionOsContextAnnotationKeyDownState(item, "Keep this private.", "Enter", userId),
    {
      shouldPreventDefault: true,
      savedNote: "Keep this private.",
      editingKey: null,
      draft: "",
    },
  );
  assert.equal(decisionOsContextAnnotation(item, userId), "Keep this private.");

  assert.deepEqual(
    decisionOsContextAnnotationKeyDownState(item, "ignored", "Escape", userId),
    {
      shouldPreventDefault: true,
      editingKey: null,
      draft: "",
    },
  );
  assert.equal(decisionOsContextAnnotationKeyDownState(item, "ignored", "Tab", userId), null);
});

test("context annotation storage ignores malformed or non-string stored values", () => {
  const storage = installLocalStorage();
  storage.clear();
  storage.setItem(
    annotationKey,
    JSON.stringify({
      "refs:thread:q3-budget": "Keep legal attached.",
      "refs:thread:bad-note": 7,
    }),
  );

  assert.equal(
    decisionOsContextAnnotation({
      title: "Budget thread",
      sourceRefs: ["thread:q3-budget"],
    }, userId),
    "Keep legal attached.",
  );
  assert.equal(
    decisionOsContextAnnotation({
      title: "Bad note",
      sourceRefs: ["thread:bad-note"],
    }, userId),
    null,
  );
  assert.equal(
    storage.getItem(annotationKey),
    JSON.stringify({
      "refs:thread:q3-budget": "Keep legal attached.",
    }),
  );

  storage.setItem(
    annotationKey,
    JSON.stringify(["bad-payload"]),
  );
  assert.equal(
    decisionOsContextAnnotation({
      title: "Budget thread",
      sourceRefs: ["thread:q3-budget"],
    }, userId),
    null,
  );
  assert.equal(
    storage.getItem(annotationKey),
    JSON.stringify({}),
  );
});

test("context annotation storage clears unparseable persisted payloads", () => {
  const storage = installLocalStorage();
  storage.clear();
  storage.setItem(annotationKey, "{bad-json");

  assert.equal(
    decisionOsContextAnnotation({
      title: "Budget thread",
      sourceRefs: ["thread:q3-budget"],
    }, userId),
    null,
  );
  assert.equal(storage.getItem(annotationKey), null);
});

test("context annotation saves persist only normalized keys and trimmed notes", () => {
  const storage = installLocalStorage();
  storage.clear();
  storage.setItem(
    annotationKey,
    JSON.stringify({
      "   ": "keep me out",
      " refs:thread:q3-budget ": "  Keep legal attached.  ",
    }),
  );

  saveDecisionOsContextAnnotation(
    {
      title: "Hiring panel notes",
      sourceRefs: ["note:hiring-panel"],
    },
    "  Keep this private.  ",
    userId,
  );

  assert.equal(
    storage.getItem(annotationKey),
    JSON.stringify({
      "refs:thread:q3-budget": "Keep legal attached.",
      "refs:note:hiring-panel": "Keep this private.",
    }),
  );
});

test("authenticated context annotations ignore unowned legacy notes", () => {
  const storage = installLocalStorage();
  storage.clear();
  storage.setItem(
    "omnyid.decisionos.context-annotations",
    JSON.stringify({
      "refs:thread:q3-budget": "Legacy private note.",
    }),
  );

  assert.equal(
    decisionOsContextAnnotation({
      title: "Budget thread",
      sourceRefs: ["thread:q3-budget"],
    }, userId),
    null,
  );
  assert.equal(storage.getItem(annotationKey), null);
  assert.notEqual(storage.getItem("omnyid.decisionos.context-annotations"), null);
});
