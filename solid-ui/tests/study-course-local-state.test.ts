import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInferredStudyCourseFromTag,
  buildImportedStudyCourse,
  buildManualStudyCourse,
  loadStudyCourses,
  normalizeStudyCourses,
  saveStudyCourse,
  STUDY_COURSES_KEY,
} from "../src/lib/studyCourseLocalState.ts";

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

test("buildManualStudyCourse creates stable course context records", () => {
  assert.equal(buildManualStudyCourse({ name: "" }), null);

  const course = buildManualStudyCourse({
    name: " Biology 101 ",
    courseTag: " course:bio101 ",
    termLabel: "Spring",
    institutionLabel: "Example Uni",
    now: 123,
  });

  assert.equal(course?.id, "manual:course-bio101");
  assert.equal(course?.name, "Biology 101");
  assert.equal(course?.courseTag, "course:bio101");
  assert.equal(course?.termLabel, "Spring");
  assert.equal(course?.institutionLabel, "Example Uni");
  assert.equal(course?.source, "manual");
  assert.equal(course?.createdAt, 123);
});

test("study courses normalize, sort, and reject incomplete records", () => {
  const courses = normalizeStudyCourses([
    { id: "bad", name: "", courseTag: "course:bad", createdAt: 9 },
    { id: "law", name: "Law", courseTag: "course:law101", source: "lms", createdAt: 2 },
    { id: "bio", name: "Biology", termLabel: "Term 1", institutionLabel: "Uni", createdAt: 3 },
    { id: "unknown-source", name: "Psych", source: "spreadsheet", createdAt: 1 },
  ]);

  assert.deepEqual(courses.map((course) => course.id), ["bio", "law", "unknown-source"]);
  assert.equal(courses[1]?.source, "lms");
  assert.equal(courses[2]?.source, "manual");
});

test("study course storage clears malformed payloads and dedupes by stable id", () => {
  const storage = storageFixture();
  storage.setItem(STUDY_COURSES_KEY, "{bad-json");

  assert.deepEqual(loadStudyCourses(storage), []);
  assert.equal(storage.getItem(STUDY_COURSES_KEY), null);

  const first = buildManualStudyCourse({ name: "Biology 101", courseTag: "course:bio101", now: 1 })!;
  const saved = saveStudyCourse(first, storage);
  saveStudyCourse({ ...saved, termLabel: "Term 2", createdAt: 2 }, storage);

  const loaded = loadStudyCourses(storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0]?.termLabel, "Term 2");
});

test("buildInferredStudyCourseFromTag creates stable tag-derived course records", () => {
  assert.equal(buildInferredStudyCourseFromTag({ courseTag: "" }), null);

  const course = buildInferredStudyCourseFromTag({
    courseTag: " course:bio-101 ",
    now: 5,
  });

  assert.equal(course?.id, "manual:course-bio-101");
  assert.equal(course?.name, "BIO 101");
  assert.equal(course?.courseTag, "course:bio-101");
  assert.equal(course?.source, "inferred");
  assert.equal(course?.createdAt, 5);
});

test("buildImportedStudyCourse creates provider-stable LMS and calendar course records", () => {
  assert.equal(buildImportedStudyCourse({
    providerId: "",
    name: "Biology",
    source: "lms",
  }), null);

  const course = buildImportedStudyCourse({
    providerId: "canvas-lms",
    externalId: "abc-123",
    name: "Biology 101",
    courseTag: "course:bio101",
    termLabel: "Term 1",
    institutionLabel: "Example Uni",
    unitTags: ["unit:cell-biology", "unit:genetics"],
    chapterTags: ["chapter:4"],
    source: "lms",
    now: 5,
  });
  const duplicate = buildImportedStudyCourse({
    providerId: "canvas-lms",
    externalId: "abc-123",
    name: "Biology 101 updated",
    source: "lms",
    now: 6,
  });

  assert.equal(course?.id, "lms:canvas-lms:abc-123");
  assert.equal(duplicate?.id, course?.id);
  assert.equal(course?.source, "lms");
  assert.equal(course?.courseTag, "course:bio101");
  assert.deepEqual(course?.unitTags, ["unit:cell-biology", "unit:genetics"]);
  assert.deepEqual(course?.chapterTags, ["chapter:4"]);
});

test("inferred course saves do not overwrite explicit course context", () => {
  const storage = storageFixture();
  const explicit = buildManualStudyCourse({
    name: "Biology Foundations",
    courseTag: "course:bio101",
    termLabel: "Term 1",
    now: 10,
  })!;
  const inferred = buildInferredStudyCourseFromTag({
    courseTag: "course:bio101",
    now: 20,
  })!;

  saveStudyCourse(explicit, storage);
  saveStudyCourse(inferred, storage);

  const loaded = loadStudyCourses(storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0]?.name, "Biology Foundations");
  assert.equal(loaded[0]?.termLabel, "Term 1");
  assert.equal(loaded[0]?.source, "manual");
  assert.equal(loaded[0]?.createdAt, 20);
});
