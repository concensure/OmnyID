import test from "node:test";
import assert from "node:assert/strict";

import { normalizeA2UIRootNodes } from "../src/lib/a2uiContentState.ts";

test("normalizeA2UIRootNodes synthesizes mounted rich_text_editor roots from kind payloads", () => {
  const nodes = normalizeA2UIRootNodes({
    kind: "rich_text_editor",
    props: { placeholder: "Reply here" },
  });

  assert.deepEqual(nodes, [
    {
      id: "root",
      type: "rich_text_editor",
      props: { placeholder: "Reply here" },
      children: [],
    },
  ]);
});

test("normalizeA2UIRootNodes synthesizes mounted diff_view roots from format payloads", () => {
  const nodes = normalizeA2UIRootNodes({
    format: "diff_view",
    props: { before: "old", after: "new" },
  });

  assert.deepEqual(nodes, [
    {
      id: "root",
      type: "diff_view",
      props: { before: "old", after: "new" },
      children: [],
    },
  ]);
});

test("normalizeA2UIRootNodes synthesizes mounted vendor recommendation card roots", () => {
  const nodes = normalizeA2UIRootNodes({
    kind: "vendor_recommendation_cards",
    props: {
      cards: [{ title: "Palm Beach Estate", rank: 1 }],
    },
  });

  assert.deepEqual(nodes, [
    {
      id: "root",
      type: "vendor_recommendation_cards",
      props: { cards: [{ title: "Palm Beach Estate", rank: 1 }] },
      children: [],
    },
  ]);
});

test("normalizeA2UIRootNodes does not synthesize unsupported conceptual roots", () => {
  const nodes = normalizeA2UIRootNodes({
    kind: "chart_view",
    props: { title: "Not mounted" },
  });

  assert.deepEqual(nodes, []);
});

test("normalizeA2UIRootNodes preserves nested legacy component children", () => {
  const nodes = normalizeA2UIRootNodes({
    components: [
      {
        type: "section",
        props: { title: "Top" },
        children: [
          {
            type: "text",
            props: { value: "Nested content" },
          },
        ],
      },
    ],
  });

  assert.deepEqual(nodes, [
    {
      id: "component-0",
      type: "section",
      props: { title: "Top" },
      children: [
        {
          id: "component-0-child-0",
          type: "text",
          props: { value: "Nested content" },
          children: [],
        },
      ],
    },
  ]);
});
