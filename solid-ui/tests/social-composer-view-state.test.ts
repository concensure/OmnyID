import test from "node:test";
import assert from "node:assert/strict";

import {
  socialComposerDefaultSuggestions,
  socialComposerEditorSubmitLabel,
  socialComposerInteractionLocked,
  socialComposerPublishLabel,
} from "../src/lib/socialComposerViewState.ts";

test("socialComposerInteractionLocked returns true for approval or publish states", () => {
  assert.equal(
    socialComposerInteractionLocked({ publishing: false, approvalPending: false }),
    false,
  );
  assert.equal(
    socialComposerInteractionLocked({ publishing: true, approvalPending: false }),
    true,
  );
  assert.equal(
    socialComposerInteractionLocked({ publishing: false, approvalPending: true }),
    true,
  );
});

test("socialComposerEditorSubmitLabel reflects transactional state", () => {
  assert.equal(
    socialComposerEditorSubmitLabel({ publishing: false, approvalPending: false }),
    "Preview",
  );
  assert.equal(
    socialComposerEditorSubmitLabel({ publishing: false, approvalPending: true }),
    "Confirming...",
  );
  assert.equal(
    socialComposerEditorSubmitLabel({ publishing: true, approvalPending: true }),
    "Publishing...",
  );
});

test("socialComposerPublishLabel reflects confirmation and publish phases", () => {
  assert.equal(
    socialComposerPublishLabel({
      publishing: false,
      approvalPending: false,
      platformLabel: "LinkedIn",
    }),
    "Publish to LinkedIn",
  );
  assert.equal(
    socialComposerPublishLabel({
      publishing: false,
      approvalPending: true,
      platformLabel: "LinkedIn",
    }),
    "Waiting for confirmation...",
  );
  assert.equal(
    socialComposerPublishLabel({
      publishing: true,
      approvalPending: false,
      platformLabel: "LinkedIn",
    }),
    "Publishing...",
  );
});

test("socialComposerDefaultSuggestions returns the fallback set", () => {
  assert.deepEqual(
    socialComposerDefaultSuggestions(),
    [
      {
        id: "tone-1",
        kind: "tone",
        label: "Professional",
        body: "Your post reads casually. A professional tone will resonate better with LinkedIn's B2B audience.",
        action: undefined,
      },
      {
        id: "hashtag-1",
        kind: "hashtag",
        label: "Hashtags",
        body: "Add #AI #Productivity #Automation to reach a wider audience on this topic.",
        action: "Add hashtags",
      },
      {
        id: "timing-1",
        kind: "timing",
        label: "Best time",
        body: "Tuesday-Thursday 8-10 AM local time typically yields 2x higher engagement on LinkedIn.",
        action: undefined,
      },
    ],
  );
});
