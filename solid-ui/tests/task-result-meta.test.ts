import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTaskExecutionExplanation,
  readTaskExecutionExplanation,
  readToolResultMetadata,
  taskExecutionExplanationChip,
  taskExecutionExplanationText,
} from "../src/lib/taskResultMeta.ts";

test("task result metadata prefers content result_meta over legacy tool_result metadata", () => {
  const metadata = readToolResultMetadata({
    content: {
      result_meta: {
        tool_slug: "browser",
        artifact_label: "Primary artifact",
      },
    },
    metadata: {
      tool_result: {
        data: {
          tool_slug: "legacy-browser",
          artifact_label: "Legacy artifact",
        },
      },
    },
  } as never);

  assert.equal(metadata.tool_slug, "browser");
  assert.equal(metadata.artifact_label, "Primary artifact");
});

test("task result metadata ignores encrypted content metadata until local decryption is available", () => {
  const metadata = readToolResultMetadata({
    content: {
      result_meta: {
        tool_slug: "hidden-browser",
        artifact_label: "Hidden artifact",
      },
      ciphertext: "abc123",
      nonce: "nonce123",
    },
    encryption: { scheme: "xchacha20-poly1305", key_id: "device-key" },
    metadata: {
      tool_result: {
        data: {
          tool_slug: "safe-metadata",
          artifact_label: "Safe metadata artifact",
        },
      },
    },
  } as never);

  assert.equal(metadata.tool_slug, "safe-metadata");
  assert.equal(metadata.artifact_label, "Safe metadata artifact");

  assert.equal(readTaskExecutionExplanation({
    content: {
      execution_explanation: {
        code: "approval_required",
        text: "Hidden approval reason",
      },
      ciphertext: "abc123",
      nonce: "nonce123",
    },
    encryption: { scheme: "xchacha20-poly1305", key_id: "device-key" },
    metadata: {},
  } as never), null);
});

test("task result metadata tolerates malformed metadata containers", () => {
  const metadata = readToolResultMetadata({
    content: "bad",
    metadata: {
      tool_result: {
        data: ["bad"],
      },
    },
  } as never);

  assert.deepEqual(metadata, {
    schema_version: "",
    tool_slug: "",
    tool_name: "",
    capability: "",
    connector_label: "",
    artifact_label: "",
    artifact_kind: "",
    url: "",
    title: "",
    channel: "",
    filename: "",
  });
});

test("task execution explanation prefers content payload and normalizes trimmed values", () => {
  const explanation = readTaskExecutionExplanation({
    content: {
      execution_explanation: {
        code: " approval_required ",
        bounded: true,
        text: " Waiting ",
        detail: " Needs human approval ",
      },
    },
    metadata: {
      execution_explanation: {
        code: "timeout",
      },
    },
  } as never);

  assert.deepEqual(explanation, {
    code: "approval_required",
    status: undefined,
    bounded: true,
    text: "Waiting",
    detail: "Needs human approval",
  });
});

test("task execution explanation normalization drops empty payloads and trims usable rows", () => {
  assert.equal(normalizeTaskExecutionExplanation({}), null);
  assert.deepEqual(
    normalizeTaskExecutionExplanation({
      status: " partial_completion ",
      text: "  Partial ",
      detail: " Additional detail ",
      bounded: false,
    }),
    {
      code: undefined,
      status: "partial_completion",
      text: "Partial",
      detail: "Additional detail",
      bounded: false,
    },
  );
});

test("task execution explanation text appends non-duplicate detail", () => {
  assert.equal(
    taskExecutionExplanationText({
      text: "Waiting",
      detail: "Needs approval",
    }),
    "Waiting Needs approval",
  );
  assert.equal(
    taskExecutionExplanationText({
      text: "Waiting",
      detail: "Waiting",
    }),
    "Waiting",
  );
});

test("task execution explanation chip covers approval and bounded outcomes", () => {
  assert.deepEqual(taskExecutionExplanationChip("pending", { code: "approval_required" }), {
    label: "Approval required",
    className: "border-violet-200/70 bg-violet-50/85 text-violet-700",
  });
  assert.deepEqual(taskExecutionExplanationChip("timeout", null), {
    label: "Time bounded",
    className: "border-rose-200/70 bg-rose-50/85 text-rose-700",
  });
  assert.deepEqual(taskExecutionExplanationChip("pending", { code: "budget_blocked" }), {
    label: "Budget bounded",
    className: "border-amber-200/70 bg-amber-50/85 text-amber-700",
  });
});
