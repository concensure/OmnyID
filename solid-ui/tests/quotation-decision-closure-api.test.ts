import assert from "node:assert/strict";
import test from "node:test";

import {
  persistQuotationClosureAction,
  QuotationActionError,
} from "@/lib/quotationDecisionClosureApi";
import type { QuotationClosureAction } from "@/lib/quotationDecisionClosureState";

const emptyStorage = {
  length: 0,
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

function installBrowserStorage(): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage: emptyStorage, localStorage: emptyStorage },
  });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  };
}

const action: QuotationClosureAction = {
  id: "closure:closure-reviewed-v3:deposit_requested",
  label: "Record deposit request",
  effect: "Records a schedule only.",
  pattern: "record",
  kind: "closure_transition",
  targetState: "deposit_requested",
  binding: {
    decisionRevision: "decision-v5",
    quotationId: "quote-1",
    quotationVersionId: "quote-1-v2",
    comparisonId: "comparison-1",
    comparisonRevision: "comparison-message-v3",
    closureRevision: "closure-reviewed-v3",
    grantRevision: "grant-message-v2",
  },
};

test("closure API sends exact comparison and closure revisions to the AFP boundary", async () => {
  const originalFetch = globalThis.fetch;
  const restoreWindow = installBrowserStorage();
  let body: Record<string, unknown> = {};
  globalThis.fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ message_ids: ["message-1"] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const result = await persistQuotationClosureAction({
      threadId: "thread-1",
      action,
      eventId: "deposit-requested-v1",
      idempotencyKey: "idem-deposit-requested-v1",
      evidenceSources: [{ source_id: "source-1", source_version_id: "source-1-v1", media_type: "application/pdf" }],
      userAuthority: true,
    });
    assert.deepEqual(result.messageIds, ["message-1"]);
    assert.equal(body.expected_comparison_revision, "comparison-message-v3");
    assert.equal(body.expected_closure_revision, "closure-reviewed-v3");
    assert.equal(body.quotation_version_id, "quote-1-v2");
    assert.equal(body.expected_state, "contract_reviewed");
    assert.equal(body.target_state, "deposit_requested");
  } finally {
    globalThis.fetch = originalFetch;
    restoreWindow();
  }
});

test("stale closure responses become explicit recoverable refresh errors", async () => {
  const originalFetch = globalThis.fetch;
  const restoreWindow = installBrowserStorage();
  globalThis.fetch = async () => new Response("quotation closure state is stale", { status: 409 });
  try {
    await assert.rejects(
      () => persistQuotationClosureAction({
        threadId: "thread-1",
        action,
        eventId: "deposit-requested-v1",
        idempotencyKey: "idem-deposit-requested-v1",
        evidenceSources: [],
        userAuthority: true,
      }),
      (error: unknown) => {
        assert.ok(error instanceof QuotationActionError);
        assert.equal(error.recoverable, true);
        assert.match(error.message, /refresh/i);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreWindow();
  }
});
