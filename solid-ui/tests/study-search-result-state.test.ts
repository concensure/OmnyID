import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStudySearchSnapshot,
  buildStudySearchSections,
  decorateSearchPreviewMessageWithStudyStructure,
  explicitStudySearchSections,
  isStudySearchResult,
} from "../src/lib/studySearchResultState.ts";
import type { AfpMessage } from "../src/lib/api.ts";

test("isStudySearchResult detects uploaded study runs and study-oriented queries", () => {
  assert.equal(
    isStudySearchResult({
      query: "Compare my lecture and reading",
      summary: "",
      bullets: [],
      uploadedSourceCount: 0,
    }),
    true,
  );
  assert.equal(
    isStudySearchResult({
      query: "General workspace summary",
      summary: "",
      bullets: [],
      uploadedSourceCount: 1,
    }),
    true,
  );
  assert.equal(
    isStudySearchResult({
      query: "Summarise my inbox",
      summary: "Email recap",
      bullets: ["Reply to Alex"],
      uploadedSourceCount: 0,
    }),
    false,
  );
});

test("buildStudySearchSections groups grounded study bullets into revision-friendly sections", () => {
  const sections = buildStudySearchSections({
    query: "Compare lecture and reading",
    bullets: [
      "Core concept: opportunity cost explains trade-offs in the lecture.",
      "The reading overlaps with the lecture on market failure and incentives.",
      "A likely exam risk is confusing externalities with public goods.",
      "Next, revise the definitions and practice one short-answer comparison.",
    ],
    uploadedSourceCount: 2,
  });

  assert.deepEqual(
    sections.map((section) => section.title),
    [
      "Main concepts",
      "Overlaps and links",
      "Exam risk and gaps",
      "Next revision actions",
    ],
  );
  assert.deepEqual(sections[0]?.items, [
    "Core concept: opportunity cost explains trade-offs in the lecture.",
  ]);
  assert.deepEqual(sections[1]?.items, [
    "The reading overlaps with the lecture on market failure and incentives.",
  ]);
  assert.deepEqual(sections[2]?.items, [
    "A likely exam risk is confusing externalities with public goods.",
  ]);
  assert.deepEqual(sections[3]?.items, [
    "Next, revise the definitions and practice one short-answer comparison.",
  ]);
});

test("buildStudySearchSections adds fallback revision actions when none are explicit", () => {
  const sections = buildStudySearchSections({
    query: "Summarize week 3 lecture",
    bullets: [
      "The lecture covers ATP production and cellular respiration.",
      "The notes connect respiration to later metabolism topics.",
    ],
    uploadedSourceCount: 2,
  });

  const actions = sections.find((section) => section.id === "actions");
  assert.ok(actions);
  assert.equal(actions!.items.length >= 2, true);
  assert.equal(actions!.items[0], "Compare the retained sources in Linked ideas to see where the lecture and reading reinforce or diverge.");
});

test("buildStudySearchSnapshot prioritizes concept, risk, and next action for the first study answer", () => {
  const sections = buildStudySearchSections({
    query: "Compare lecture and reading",
    bullets: [
      "Core concept: opportunity cost explains trade-offs in the lecture.",
      "The reading overlaps with the lecture on market failure and incentives.",
      "A likely exam risk is confusing externalities with public goods.",
      "Next, revise the definitions and practice one short-answer comparison.",
    ],
    uploadedSourceCount: 2,
  });

  const snapshot = buildStudySearchSnapshot({
    sections,
    uploadedSourceCount: 2,
    summary: "Study comparison",
  });

  assert.ok(snapshot);
  assert.equal(snapshot!.headline, "Grounded revision snapshot from 2 study sources");
  assert.match(snapshot!.subheadline, /Start with the next concrete revision step/i);
  assert.deepEqual(
    snapshot!.highlights.map((item) => item.title),
    ["Focus first", "Biggest exam risk", "Do next"],
  );
});

test("decorateSearchPreviewMessageWithStudyStructure writes explicit study sections into search and panel views", () => {
  const message: AfpMessage = {
    id: "preview.study.1",
    thread_id: "preview.thread.study",
    from: "omnyid://workspace/command-bar",
    to: ["omnyid://workspace/user"],
    timestamp: "2026-09-02T10:00:00.000Z",
    type: "research",
    subtype: "content",
    content: {
      query: "Compare my lecture and reading",
      summary: "Study comparison",
      bullets: [
        "The lecture overlaps with the reading on market failures.",
        "A likely exam risk is confusing externalities with public goods.",
      ],
    },
    metadata: {
      uploaded_source_count: 2,
      attachment_policy_label: "Connected notes + keep extracted notes only",
    },
    views: [
      {
        format: "search_result",
        content: {
          query: "Compare my lecture and reading",
          summary: "Study comparison",
          bullets: [
            "The lecture overlaps with the reading on market failures.",
            "A likely exam risk is confusing externalities with public goods.",
          ],
        },
      },
      {
        format: "a2ui.v1",
        content: {
          kind: "panel",
          nodes: [
            {
              id: "search-summary",
              type: "callout",
              props: { title: "Research summary", body: "Study comparison" },
            },
          ],
        },
      },
    ],
    attachments: [],
  };

  const decorated = decorateSearchPreviewMessageWithStudyStructure(message);
  const searchView = decorated.views.find((view) => view.format === "search_result");
  const panelView = decorated.views.find((view) => view.format === "a2ui.v1");

  assert.equal(decorated.metadata?.study_result, true);
  assert.equal(Array.isArray(decorated.content.study_sections), true);
  assert.equal(Array.isArray(searchView?.content.study_sections), true);
  assert.equal(Array.isArray(panelView?.content.study_sections), true);
  assert.equal(
    Array.isArray(panelView?.content.nodes) && panelView!.content.nodes.some((node: unknown) =>
      typeof node === "object" && node !== null && "id" in node && node.id === "study-section-overlaps"
    ),
    true,
  );
});

test("explicitStudySearchSections reads explicit structured sections from message content", () => {
  const sections = explicitStudySearchSections({
    id: "preview.study.2",
    thread_id: "preview.thread.study",
    from: "omnyid://workspace/command-bar",
    to: ["omnyid://workspace/user"],
    timestamp: "2026-09-02T10:00:00.000Z",
    type: "research",
    content: {
      study_sections: [
        { id: "concepts", title: "Main concepts", items: ["Opportunity cost"] },
        { id: "actions", title: "Next revision actions", items: ["Practice one short answer"] },
      ],
    },
    views: [],
    attachments: [],
  } as AfpMessage);

  assert.deepEqual(sections, [
    { id: "concepts", title: "Main concepts", items: ["Opportunity cost"] },
    { id: "actions", title: "Next revision actions", items: ["Practice one short answer"] },
  ]);
});

test("study search result helpers hide encrypted study sections until local decryption is available", () => {
  const encrypted = {
    id: "preview.study.encrypted",
    thread_id: "preview.thread.study",
    from: "omnyid://workspace/command-bar",
    to: ["omnyid://workspace/user"],
    timestamp: "2026-09-02T10:00:00.000Z",
    type: "research",
    content: {
      query: "Hidden chapter 4 exam prep",
      summary: "Private chapter scope",
      bullets: ["Hidden bullet"],
      study_sections: [
        { id: "concepts", title: "Main concepts", items: ["Secret concept"] },
      ],
      ciphertext: "abc123",
      nonce: "nonce123",
    },
    encryption: { scheme: "xchacha20-poly1305", key_id: "device-key" },
    metadata: { uploaded_source_count: 2 },
    views: [],
    attachments: [],
  } as any as AfpMessage;

  assert.deepEqual(explicitStudySearchSections(encrypted), []);
  assert.equal(decorateSearchPreviewMessageWithStudyStructure(encrypted), encrypted);
});
