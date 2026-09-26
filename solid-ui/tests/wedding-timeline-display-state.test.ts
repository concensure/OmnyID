import assert from "node:assert/strict";
import test from "node:test";

import {
  weddingTimelineBarWidthPercent,
  weddingTimelineFileActionState,
  weddingTimelineStatusLabel,
} from "@/lib/weddingTimelineDisplayState";

test("weddingTimelineStatusLabel keeps technical accepted status user-facing", () => {
  assert.equal(weddingTimelineStatusLabel("accepted"), "Done");
  assert.equal(weddingTimelineStatusLabel("completed"), "Done");
  assert.equal(weddingTimelineStatusLabel("anytime"), "Anytime");
  assert.equal(weddingTimelineStatusLabel(null), "Planned");
});

test("weddingTimelineBarWidthPercent renders one-day items as short markers", () => {
  assert.equal(weddingTimelineBarWidthPercent({ widthPercent: 14, durationDays: 1 }), 6);
  assert.equal(weddingTimelineBarWidthPercent({ widthPercent: 4, durationDays: 1 }), 4);
  assert.equal(weddingTimelineBarWidthPercent({ widthPercent: 14, durationDays: 7 }), 14);
  assert.equal(weddingTimelineBarWidthPercent({ widthPercent: 1, durationDays: 7 }), 8);
});

test("weddingTimelineFileActionState opens linked files directly when available", () => {
  assert.deepEqual(weddingTimelineFileActionState({
    linkedArtifactId: "artifact:run-sheet",
    canOpenArtifact: true,
    canOpenSavedOutputs: true,
  }), {
    enabled: true,
    label: "View file",
    title: "Open the linked wedding file",
    mode: "open_artifact",
  });
});

test("weddingTimelineFileActionState falls back to documents instead of dead clicks", () => {
  assert.deepEqual(weddingTimelineFileActionState({
    linkedArtifactId: "artifact:run-sheet",
    canOpenArtifact: false,
    canOpenSavedOutputs: true,
  }), {
    enabled: true,
    label: "Open files",
    title: "Open wedding documents to find this file",
    mode: "open_files",
  });
  assert.deepEqual(weddingTimelineFileActionState({
    linkedArtifactId: "artifact:run-sheet",
    canOpenArtifact: false,
    canOpenSavedOutputs: false,
  }), {
    enabled: false,
    label: "File saved",
    title: "Wedding documents are not available from this view yet",
    mode: "unavailable",
  });
  assert.equal(weddingTimelineFileActionState({ linkedArtifactId: "" }), null);
});
