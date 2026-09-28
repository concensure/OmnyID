import assert from "node:assert/strict";
import test from "node:test";

import {
  buildManualStudyAttempt,
  loadStudyAttempts,
  normalizeStudyAttempts,
  saveStudyAttempt,
  STUDY_ATTEMPTS_KEY,
} from "../src/lib/studyAttemptLocalState.ts";

function storageFixture(): Storage {
  const state = new Map<string, string>();
  return {
    get length() {
      return state.size;
    },
    clear() {
      state.clear();
    },
    getItem(key: string) {
      return state.has(key) ? state.get(key)! : null;
    },
    key(index: number) {
      return [...state.keys()][index] ?? null;
    },
    removeItem(key: string) {
      state.delete(key);
    },
    setItem(key: string, value: string) {
      state.set(key, value);
    },
  };
}

test("buildManualStudyAttempt requires a mode and item count", () => {
  assert.equal(buildManualStudyAttempt({ mode: "quiz", totalItems: 0 }), null);

  const attempt = buildManualStudyAttempt({
    mode: "exam",
    title: "Midterm attempt",
    totalItems: 50,
    correctItems: 42,
    durationSeconds: 2700,
    courseTag: " course:law101 ",
    now: 123,
  });

  assert.equal(attempt?.id, "manual:exam:123");
  assert.equal(attempt?.title, "Midterm attempt");
  assert.equal(attempt?.correctItems, 42);
  assert.equal(attempt?.totalItems, 50);
  assert.equal(attempt?.durationSeconds, 2700);
  assert.equal(attempt?.courseTag, "course:law101");
  assert.equal(attempt?.source, "manual");
});

test("study attempts normalize, sort, clamp, and reject incomplete records", () => {
  const attempts = normalizeStudyAttempts([
    { id: "bad", mode: "quiz", title: "", totalItems: 10, correctItems: 5, createdAt: 5 },
    { id: "quiz", mode: "quiz", title: "Quiz", totalItems: 10, correctItems: 99, createdAt: 2 },
    { id: "exam", mode: "exam", title: "Exam", totalItems: 20, correctItems: 15, createdAt: 3 },
    { id: "unknown", mode: "practice", title: "Practice", totalItems: 4, correctItems: 2, createdAt: 4 },
  ]);

  assert.deepEqual(attempts.map((attempt) => attempt.id), ["exam", "quiz"]);
  assert.equal(attempts[1]?.correctItems, 10);
});

test("study attempt storage clears malformed payloads and dedupes by id", () => {
  const storage = storageFixture();
  storage.setItem(STUDY_ATTEMPTS_KEY, "{bad-json");

  assert.deepEqual(loadStudyAttempts(storage), []);
  assert.equal(storage.getItem(STUDY_ATTEMPTS_KEY), null);

  const first = buildManualStudyAttempt({ mode: "flashcards", totalItems: 12, correctItems: 8, now: 1 })!;
  const saved = saveStudyAttempt(first, storage);
  saveStudyAttempt({ ...saved, correctItems: 10 }, storage);

  const loaded = loadStudyAttempts(storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0]?.correctItems, 10);
});
