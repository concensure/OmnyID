import assert from "node:assert/strict";
import test from "node:test";

import { shouldShowMedicalMissedTopicCapture } from "../src/lib/medicalMissedTopicCaptureState.ts";
import type { StudyLensSidebarSection } from "../src/lib/studyLensSidebarState.ts";

function section(title: string): StudyLensSidebarSection {
  return {
    title,
    items: [],
    emptyLabel: "",
    action: { label: "noop" },
  };
}

test("shouldShowMedicalMissedTopicCapture requires medical sidebar and record handler", () => {
  assert.equal(shouldShowMedicalMissedTopicCapture({
    sidebar: [section("Courses"), section("Source context")],
    canRecord: true,
  }), false);

  assert.equal(shouldShowMedicalMissedTopicCapture({
    sidebar: [section("Medical readiness")],
    canRecord: false,
  }), false);

  assert.equal(shouldShowMedicalMissedTopicCapture({
    sidebar: [section("Medical readiness")],
    canRecord: true,
  }), true);
});
