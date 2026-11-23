import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingVisionTagButtonState } from "../src/lib/weddingVisionTagButtonState.ts";

test("buildWeddingVisionTagButtonState presents unsaved tags as save actions", () => {
  const state = buildWeddingVisionTagButtonState({
    tag: "Garden party",
    saved: false,
    saving: false,
  });

  assert.equal(state.actionLabel, "Save Garden party to wedding vision");
  assert.equal(state.displayLabel, "Garden party");
  assert.equal(state.magicAction, "save");
  assert.equal(state.magicId, "wedding:vision:feel-tag:garden-party");
  assert.equal(state.ariaPressed, false);
  assert.equal(state.disabled, false);
});

test("buildWeddingVisionTagButtonState presents saved tags as remove actions", () => {
  const state = buildWeddingVisionTagButtonState({
    tag: "Calm & candlelit",
    saved: true,
    saving: false,
  });

  assert.equal(state.actionLabel, "Remove Calm & candlelit from saved wedding vision");
  assert.equal(state.displayLabel, "Calm & candlelit saved");
  assert.equal(state.magicAction, "remove");
  assert.equal(state.magicId, "wedding:vision:feel-tag:calm-candlelit");
  assert.equal(state.ariaPressed, true);
});

test("buildWeddingVisionTagButtonState keeps saving labels stable", () => {
  const state = buildWeddingVisionTagButtonState({
    tag: "Relaxed",
    saved: true,
    saving: true,
  });

  assert.equal(state.displayLabel, "Saving...");
  assert.equal(state.disabled, true);
  assert.equal(state.magicAction, "remove");
});
