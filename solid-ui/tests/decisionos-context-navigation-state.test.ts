import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsContextAddNoteLabel,
  decisionOsContextAnnotationPlaceholder,
  decisionOsContextCalendarActionLabel,
  decisionOsContextCloseAriaLabel,
  decisionOsContextFooterActions,
  decisionOsContextEmptyStateLabel,
  decisionOsContextItemNavPlan,
  decisionOsContextItemOpenLabel,
  decisionOsContextExternalViewLabel,
  decisionOsContextPinAriaLabel,
  decisionOsContextPinTitle,
  decisionOsContextPanelTitle,
  decisionOsContextSaveNoteLabel,
  decisionOsContextSelectionPromptLabel,
  decisionOsContextShortcutHintLabel,
  decisionOsContextItemTargetLabelFromRefs,
  decisionOsContextWorkspaceActionLabel,
  decisionOsContextWhyMattersTitle,
  decisionOsSearchActionChip,
} from "../src/lib/decisionOsContextNavigationState.ts";

test("decisionos context navigation state derives compact target labels from refs", () => {
  assert.equal(
    decisionOsContextItemTargetLabelFromRefs(["thread:q3_budget_thread"]),
    "Thread: q3 budget thread",
  );
  assert.equal(
    decisionOsContextItemTargetLabelFromRefs(["message:launch_brief_v2"]),
    "Object: launch brief v2",
  );
  assert.equal(decisionOsContextItemTargetLabelFromRefs(["calendar:event-123"]), "Calendar");
  assert.equal(
    decisionOsContextItemOpenLabel({ sourceRefs: ["thread:q3_budget_thread"] }),
    "Open Thread: q3 budget thread ->",
  );
  assert.equal(
    decisionOsContextItemOpenLabel({}),
    "Open source ->",
  );
});

test("decisionos context navigation state builds search action chips", () => {
  assert.deepEqual(decisionOsSearchActionChip("impact:high"), {
    id: "search:impact:high",
    label: "Search: impact:high",
  });
});

test("decisionos context navigation state builds footer actions for cross-surface navigation", () => {
  assert.deepEqual(
    decisionOsContextFooterActions({ id: "dec-1", title: "Q3 Budget" }),
    {
      draftsActionChip: {
        id: "open-drafts",
        label: "Open Prepared Drafts",
      },
      draftsButtonLabel: "Draft reply",
      draftsButtonTitle: "Open prepared drafts related to this decision",
      threadsView: "threads",
      threadsButtonLabel: "Threads",
      threadsButtonTitle: "Open threads surface to see full conversation context",
      searchTerm: "Q3 Budget",
      searchActionChip: {
        id: "search:Q3 Budget",
        label: "Search: Q3 Budget",
      },
      searchButtonLabel: "Search",
      searchButtonTitle: "Search across all surfaces for this decision",
      searchMagic: {
        action: "search",
        icon: "🔍",
        label: "Search: Q3 Budget",
        id: "ctx-search-dec-1",
      },
    },
  );
});

test("decisionos context navigation state resolves navigation plans", () => {
  assert.deepEqual(
    decisionOsContextItemNavPlan({ sourceRefs: ["thread:launch-thread"] }),
    { kind: "threads", threadId: "launch-thread", messageId: undefined },
  );

  assert.deepEqual(
    decisionOsContextItemNavPlan({ sourceRefs: ["calendar:event-123"] }),
    { kind: "calendar" },
  );

  assert.deepEqual(
    decisionOsContextItemNavPlan({ sourceUrl: "https://example.com/context" }),
    { kind: "external", href: "https://example.com/context" },
  );
});

test("decisionos context navigation state exposes empty-state copy", () => {
  assert.equal(decisionOsContextEmptyStateLabel(), "No context surfaced yet");
});

test("decisionos context navigation state exposes shared panel copy", () => {
  assert.equal(
    decisionOsContextSelectionPromptLabel(),
    "Select a decision card to see auto-surfaced context and reasoning.",
  );
  assert.equal(decisionOsContextShortcutHintLabel(), "Press ? for keyboard shortcuts");
  assert.equal(decisionOsContextPanelTitle(), "Context");
  assert.equal(decisionOsContextCalendarActionLabel(), "Open in Calendar View");
  assert.equal(decisionOsContextExternalViewLabel(), "View ->");
  assert.equal(decisionOsContextAnnotationPlaceholder(), "Private note for this context");
  assert.equal(decisionOsContextPinAriaLabel(true), "Unpin context panel");
  assert.equal(decisionOsContextPinAriaLabel(false), "Pin context panel to this decision");
  assert.equal(
    decisionOsContextPinTitle(true),
    "Pinned panel stays on this decision while you navigate",
  );
  assert.equal(
    decisionOsContextPinTitle(false),
    "Pin to keep this context visible while browsing other cards",
  );
  assert.equal(decisionOsContextCloseAriaLabel(), "Close context panel");
  assert.equal(decisionOsContextWhyMattersTitle(), "TL;DR");
  assert.equal(decisionOsContextWorkspaceActionLabel(), "Open workspace");
  assert.equal(decisionOsContextAddNoteLabel(), "+ note");
  assert.equal(decisionOsContextSaveNoteLabel(), "Save");
});
