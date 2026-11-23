import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStudySessionFromReportLaunch,
  loadStudySessions,
  normalizeStudySessions,
  saveStudySession,
  STUDY_SESSIONS_KEY,
} from "../src/lib/studySessionLocalState.ts";

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

test("buildStudySessionFromReportLaunch only records guided-session launches", () => {
  assert.equal(buildStudySessionFromReportLaunch({
    reportKind: "exam_preparation",
  }), null);

  const session = buildStudySessionFromReportLaunch({
    reportKind: "guided_study_session",
    title: "20 minute torts repair",
    courseTag: " course:law101 ",
    sourceCount: 2,
    deadlineCount: 1,
    attemptCount: 1,
    nextAction: "Retry missed negligence questions.",
    now: 123,
  });

  assert.equal(session?.title, "20 minute torts repair");
  assert.equal(session?.status, "planned");
  assert.equal(session?.duration, "20_min");
  assert.equal(session?.courseTag, "course:law101");
  assert.equal(session?.sourceCount, 2);
  assert.equal(session?.deadlineCount, 1);
  assert.equal(session?.attemptCount, 1);
  assert.equal(session?.source, "reports");
});

test("study sessions normalize, sort, clamp, and reject incomplete records", () => {
  const sessions = normalizeStudySessions([
    { id: "old", title: "Old session", createdAt: 1, sourceCount: 1, deadlineCount: 1, attemptCount: 1 },
    { id: "bad", title: "", createdAt: 2 },
    { id: "new", title: "New session", duration: "45_min", status: "completed", createdAt: 3 },
    { id: "overflow", title: "Overflow", sourceCount: -1, deadlineCount: 1.8, attemptCount: Number.NaN, createdAt: 2 },
  ]);

  assert.deepEqual(sessions.map((session) => session.id), ["new", "overflow", "old"]);
  assert.equal(sessions[0]?.duration, "45_min");
  assert.equal(sessions[0]?.status, "completed");
  assert.equal(sessions[1]?.sourceCount, 0);
  assert.equal(sessions[1]?.deadlineCount, 1);
  assert.equal(sessions[1]?.attemptCount, 0);
});

test("study session storage clears malformed payloads and dedupes by id", () => {
  const storage = storageFixture();
  storage.setItem(STUDY_SESSIONS_KEY, "{bad-json");

  assert.deepEqual(loadStudySessions(storage), []);
  assert.equal(storage.getItem(STUDY_SESSIONS_KEY), null);

  const first = buildStudySessionFromReportLaunch({
    reportKind: "guided_study_session",
    title: "Session",
    now: 1,
  })!;
  const saved = saveStudySession(first, storage);
  saveStudySession({ ...saved, status: "completed", nextAction: "Review weak links." }, storage);

  const loaded = loadStudySessions(storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0]?.status, "completed");
  assert.equal(loaded[0]?.nextAction, "Review weak links.");
});
