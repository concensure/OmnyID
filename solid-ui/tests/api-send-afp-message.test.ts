import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchGmailOAuthUrl,
  fetchGmailStatus,
  retryFederatedAgentMessage,
  sendAfpMessage,
  sendAfpPayloadMessage,
  sendFederatedAgentMessage,
  sendGmailApprovedDraft,
} from "@/lib/api";

const localStorageState = new Map<string, string>();
const sessionStorageState = new Map<string, string>();
const storageStub = (state: Map<string, string>) => ({
  getItem: (key: string) => state.get(key) ?? null,
  setItem: (key: string, value: string) => state.set(key, value),
  removeItem: (key: string) => state.delete(key),
});

Object.defineProperty(globalThis, "window", {
  value: {
    localStorage: storageStub(localStorageState),
    sessionStorage: storageStub(sessionStorageState),
  },
  configurable: true,
  writable: true,
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

test("sendAfpMessage keeps top-level supertags in the /send body", async () => {
  const originalFetch = globalThis.fetch;
  let seenBody: Record<string, unknown> | null = null;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "/send");
    seenBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return jsonResponse({ success: true, message_id: "afp-1" });
  };

  try {
    await sendAfpMessage({
      thread_id: "thread-1",
      from: "agent://wedding-planning",
      to: ["agent://knowledge-graph"],
      type: "task",
      content: { title: "Review payment schedule" },
      supertags: ["wedding_budget", "wedding_budget:payment_schedule", "topology:budget_drift"],
      store_in_relational: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(seenBody?.supertags, [
    "wedding_budget",
    "wedding_budget:payment_schedule",
    "topology:budget_drift",
  ]);
  assert.equal(seenBody?.store_in_relational, true);
});

test("sendAfpPayloadMessage filters malformed supertags but preserves valid routing tags", async () => {
  const originalFetch = globalThis.fetch;
  let seenBody: Record<string, unknown> | null = null;
  globalThis.fetch = async (_input, init) => {
    seenBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return jsonResponse({ success: true, message_id: "afp-2" });
  };

  try {
    await sendAfpPayloadMessage({
      thread_id: "thread-1",
      from: "agent://wedding-planning",
      to: ["agent://decision-queue"],
      type: "decision",
      content: { title: "Approve venue shortlist" },
      supertags: ["wedding_decision", 7, "decisionos", null],
      store_in_relational: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(seenBody?.supertags, ["wedding_decision", "decisionos"]);
});

test("sendFederatedAgentMessage posts the signed relay compose request shape", async () => {
  const originalFetch = globalThis.fetch;
  let seenPath = "";
  let seenBody: Record<string, unknown> | null = null;
  globalThis.fetch = async (input, init) => {
    seenPath = String(input);
    seenBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return jsonResponse({
      success: true,
      message_id: "01K8FEDERATEDMESSAGE0000000",
      thread_id: "01K8DELIVERYTHREAD00000000",
      source_thread_id: "wedding_vendor_quote:workspace-1:chloes-florals",
      recipient_agent_id: "agent:casey@example.net",
    });
  };

  try {
    const response = await sendFederatedAgentMessage({
      recipient_agent_id: "agent:casey@example.net",
      thread_id: "01K8THREAD0000000000000000",
      subject: "Planning handoff",
      body: "Can your agent review this plan?",
    });

    assert.equal(response.success, true);
    assert.equal(response.message_id, "01K8FEDERATEDMESSAGE0000000");
    assert.equal(response.thread_id, "01K8DELIVERYTHREAD00000000");
    assert.equal(response.source_thread_id, "wedding_vendor_quote:workspace-1:chloes-florals");
    assert.equal(response.recipient_agent_id, "agent:casey@example.net");
    assert.equal(seenPath, "/federation/send");
    assert.deepEqual(seenBody, {
      recipient_agent_id: "agent:casey@example.net",
      thread_id: "01K8THREAD0000000000000000",
      subject: "Planning handoff",
      body: "Can your agent review this plan?",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("retryFederatedAgentMessage posts the retry request shape", async () => {
  const originalFetch = globalThis.fetch;
  let seenPath = "";
  let seenBody: Record<string, unknown> | null = null;
  globalThis.fetch = async (input, init) => {
    seenPath = String(input);
    seenBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return jsonResponse({
      success: true,
      retried: true,
      message_id: "01K8FEDERATEDMESSAGE0000000",
      thread_id: "01K8DELIVERYTHREAD00000000",
      recipient_agent_id: "agent:casey@example.net",
      delivery_status: "already_accepted",
    });
  };

  try {
    const response = await retryFederatedAgentMessage({
      attempted_message_id: "01K8FEDERATEDMESSAGE0000000",
    });

    assert.equal(response.success, true);
    assert.equal(response.retried, true);
    assert.equal(response.message_id, "01K8FEDERATEDMESSAGE0000000");
    assert.equal(response.thread_id, "01K8DELIVERYTHREAD00000000");
    assert.equal(response.recipient_agent_id, "agent:casey@example.net");
    assert.equal(response.delivery_status, "already_accepted");
    assert.equal(seenPath, "/federation/retry");
    assert.deepEqual(seenBody, {
      attempted_message_id: "01K8FEDERATEDMESSAGE0000000",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sendGmailApprovedDraft preserves provider failure messages and delivery payload", async () => {
  const originalFetch = globalThis.fetch;
  let seenBody: Record<string, unknown> | null = null;
  const seenPaths: string[] = [];
  globalThis.fetch = async (input, init) => {
    seenPaths.push(String(input));
    assert.equal(String(input), "/integrations/gmail/send-draft");
    seenBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return jsonResponse({
      ok: false,
      sent: false,
      error: "Gmail token expired. Reconnect Gmail before sending.",
    });
  };

  try {
    const response = await sendGmailApprovedDraft({
      to: "hello@chloes.example",
      subject: "Floral quote",
      html: "<p>Thanks Chloe.</p>",
      text: "Thanks Chloe.",
      thread_id: "wedding_vendor_quote:workspace-1:chloes-florals",
      in_reply_to: "gmail-thread-1",
      references: ["gmail-thread-1"],
    });

    assert.equal(response.ok, false);
    assert.equal(response.sent, false);
    assert.equal(response.messageId, null);
    assert.equal(response.message, "Gmail token expired. Reconnect Gmail before sending.");
    assert.equal(seenBody?.to, "hello@chloes.example");
    assert.equal(seenBody?.thread_id, "wedding_vendor_quote:workspace-1:chloes-florals");
    assert.deepEqual(seenBody?.references, ["gmail-thread-1"]);
    assert.deepEqual(seenPaths, ["/integrations/gmail/send-draft"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sendGmailApprovedDraft accepts durable receipt aliases from provider adapters", async () => {
  const originalFetch = globalThis.fetch;
  const responses = [
    { ok: true, messageId: "gmail-camel-1", clientMessageId: "local-camel-1", draftMessageId: "draft-camel-1" },
    { sent: true, id: "gmail-id-1", client_message_id: "local-snake-1" },
  ];
  let call = 0;
  globalThis.fetch = async () => jsonResponse(responses[call++]);

  try {
    const camel = await sendGmailApprovedDraft({
      to: "hello@chloes.example",
      subject: "Floral quote",
      html: "<p>Thanks Chloe.</p>",
      text: "Thanks Chloe.",
    });
    const idFallback = await sendGmailApprovedDraft({
      to: "hello@chloes.example",
      subject: "Floral quote",
      html: "<p>Thanks Chloe.</p>",
      text: "Thanks Chloe.",
    });

    assert.equal(camel.ok, true);
    assert.equal(camel.messageId, "gmail-camel-1");
    assert.equal(camel.clientMessageId, "local-camel-1");
    assert.equal(camel.draftMessageId, "draft-camel-1");
    assert.equal(idFallback.sent, true);
    assert.equal(idFallback.messageId, "gmail-id-1");
    assert.equal(idFallback.clientMessageId, "local-snake-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gmail integration API helpers use integration-scoped setup routes", async () => {
  const originalFetch = globalThis.fetch;
  const seenPaths: string[] = [];
  globalThis.fetch = async (input) => {
    seenPaths.push(String(input));
    if (String(input) === "/integrations/gmail/status") {
      return jsonResponse({
        connected: true,
        gmailEmail: "admin@omnyid.com",
        configured: true,
        tokenExpired: false,
        expiresWithin24h: false,
      });
    }
    if (String(input) === "/integrations/gmail/oauth-url") {
      return jsonResponse({ url: "https://accounts.google.com/o/oauth2/v2/auth" });
    }
    return jsonResponse({ error: "unexpected" });
  };

  try {
    const status = await fetchGmailStatus("integration");
    const oauthUrl = await fetchGmailOAuthUrl("integration");

    assert.equal(status.connected, true);
    assert.equal(status.gmail_email, "admin@omnyid.com");
    assert.equal(oauthUrl, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.deepEqual(seenPaths, [
      "/integrations/gmail/status",
      "/integrations/gmail/oauth-url",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
