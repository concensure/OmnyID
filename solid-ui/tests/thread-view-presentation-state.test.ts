import test from "node:test";
import assert from "node:assert/strict";

import type { AfpMessage } from "@/lib/api";
import {
  FEDERATION_BODY_MAX_CHARS,
  FEDERATION_SUBJECT_MAX_CHARS,
  acceptedFederationAttemptIds,
  federatedComposerValidationError,
  federatedTextCharCount,
  federationDeliveryReceiptSummary,
  federationDeliveryStatus,
  isFederatedAgentId,
  senderColorClassForThreadView,
  threadViewAtSuggestions,
  threadViewMentionAliases,
  threadViewMessageCostCents,
  threadViewMessageDates,
  threadViewMessageMentionsCurrentUser,
  threadViewMessageStringValues,
  threadViewMessageObjectSearchSeed,
  threadViewMessageSmtpId,
  threadViewObjectSearchSeed,
  threadViewRecentTitles,
  threadViewSenderCounts,
  threadViewSenderLabel,
  threadViewSenderRole,
  threadViewTokenEstimate,
  threadViewTotalCostCents,
  threadViewTypingStatusLabel,
  threadViewTypingTask,
} from "@/lib/threadViewPresentationState";

function message(overrides: Partial<AfpMessage> & Pick<AfpMessage, "id" | "thread_id" | "type">): AfpMessage {
  return {
    id: overrides.id,
    thread_id: overrides.thread_id,
    from: overrides.from ?? "agent/research/Atlas",
    to: overrides.to ?? [],
    timestamp: overrides.timestamp ?? "2026-08-31T12:00:00.000Z",
    type: overrides.type,
    kind: overrides.kind ?? "chat_thread",
    subtype: overrides.subtype ?? null,
    supertags: overrides.supertags ?? [],
    content: overrides.content ?? {},
    metadata: overrides.metadata ?? {},
    views: overrides.views ?? [],
    attachments: overrides.attachments ?? [],
    references: overrides.references ?? [],
    encryption: overrides.encryption ?? null,
    signature: overrides.signature ?? "",
  };
}

test("thread view presentation centralizes sender formatting and deterministic colors", () => {
  assert.equal(threadViewSenderLabel("agent/research/Atlas_Bot"), "Atlas Bot");
  assert.equal(threadViewSenderRole("agent/research/Atlas_Bot"), "research");
  assert.equal(senderColorClassForThreadView("Atlas"), senderColorClassForThreadView("Atlas"));
});

test("thread view presentation centralizes mention aliases and detection", () => {
  const aliases = threadViewMentionAliases("Alex Stone");
  assert.deepEqual(aliases, ["alex stone", "alexstone", "alex_stone", "alex-stone", "alex"]);

  const msg = message({
    id: "m-mention",
    thread_id: "t-mention",
    type: "chat",
    content: { text: "Please review this with @alex-stone before shipping." },
  });
  assert.equal(threadViewMessageMentionsCurrentUser(msg, aliases), true);
});

test("thread view presentation does not expose encrypted message payloads", () => {
  const encrypted = message({
    id: "m-encrypted",
    thread_id: "t-encrypted",
    type: "chat",
    content: { ciphertext: "secret-ciphertext", nonce: "secret-nonce", text: "@alex secret body" },
    encryption: { scheme: "omnyid-envelope-v1" },
  });

  assert.deepEqual(threadViewMessageStringValues(encrypted), []);
  assert.equal(threadViewMessageMentionsCurrentUser(encrypted, ["alex"]), false);
  assert.equal(threadViewTokenEstimate([encrypted]), 0);
  assert.deepEqual(threadViewRecentTitles([encrypted]), []);
  assert.equal(threadViewMessageSmtpId({ ...encrypted, type: "email_inbound" }), null);
});

test("thread view presentation centralizes metadata-derived cost smtp ids and search seeds", () => {
  const inbound = message({
    id: "m-email",
    thread_id: "t-email",
    type: "email_inbound",
    kind: "Email_Notice",
    supertags: [" Project:Apollo ", "Urgent"],
    content: { message_id: "<smtp-1>", subject: "Launch update" },
    metadata: { cost_cents: 12 },
  });
  const fallback = message({
    id: "m-fallback",
    thread_id: "t-fallback",
    type: "note",
    kind: "",
    supertags: [],
  });

  assert.equal(threadViewMessageCostCents(inbound), 12);
  assert.equal(threadViewMessageSmtpId(inbound), "<smtp-1>");
  assert.equal(threadViewMessageSmtpId(fallback), null);
  assert.equal(threadViewMessageObjectSearchSeed(inbound), "kind:email_notice #project:apollo #urgent");
  assert.equal(threadViewMessageObjectSearchSeed(fallback), "target:m-fallback");
});

test("thread view presentation centralizes aggregate thread derivations", () => {
  const messages = [
    message({
      id: "m-1",
      thread_id: "t-1",
      type: "chat",
      from: "agent/research/Atlas",
      kind: "research_note",
      supertags: ["project:apollo", "topic:launch"],
      timestamp: "2026-08-30T12:00:00.000Z",
      content: { title: "Briefing", text: "alpha beta gamma delta" },
      metadata: { cost_cents: 3 },
    }),
    message({
      id: "m-2",
      thread_id: "t-1",
      type: "chat",
      from: "agent/research/Atlas",
      kind: "summary",
      supertags: ["project:apollo"],
      timestamp: "2026-08-31T13:00:00.000Z",
      content: { subject: "Follow-up", body: "epsilon zeta" },
      metadata: { cost_cents: 4 },
    }),
    message({
      id: "m-3",
      thread_id: "t-1",
      type: "chat",
      from: "user/human/Alex",
      kind: "summary",
      supertags: ["topic:launch"],
      timestamp: "2026-08-31T14:00:00.000Z",
      content: { label: "Decision" },
      metadata: {},
    }),
  ];

  assert.equal(threadViewObjectSearchSeed(messages), "#project:apollo");
  assert.equal(threadViewTokenEstimate(messages), 16);
  assert.deepEqual(threadViewSenderCounts(messages), [["Atlas", 2], ["Alex", 1]]);
  assert.equal(threadViewTotalCostCents(messages), 7);
  assert.deepEqual(threadViewMessageDates(messages), ["Aug 30", "Aug 31"]);
  assert.deepEqual(threadViewRecentTitles(messages), ["Briefing", "Follow-up", "Decision"]);
});

test("thread view presentation centralizes at-suggestions and typing status", () => {
  assert.deepEqual(threadViewAtSuggestions("a", ["atlas", "beacon", "argo"]), ["atlas", "argo"]);
  assert.deepEqual(threadViewAtSuggestions(null, ["atlas"]), []);

  const nowMs = Date.parse("2026-08-31T12:00:30.000Z");
  const typing = message({
    id: "m-typing",
    thread_id: "t-typing",
    type: "daemon_typing",
    timestamp: "2026-08-31T12:00:10.000Z",
    content: { action: "web_search" },
  });
  const staleTyping = message({
    id: "m-stale",
    thread_id: "t-typing",
    type: "daemon_typing",
    timestamp: "2026-08-31T11:59:00.000Z",
    content: { action: "email_triage" },
  });

  assert.equal(threadViewTypingTask([typing], nowMs), "Searching the web...");
  assert.equal(threadViewTypingTask([staleTyping], nowMs), null);
  assert.equal(
    threadViewTypingStatusLabel(null, 11, ["Searching...", "Reading context...", "Drafting..."]),
    "Drafting...",
  );
});

test("thread view presentation derives federation delivery status", () => {
  const outbound = message({
    id: "attempt-1",
    thread_id: "thread-fed",
    type: "agent_message",
    subtype: "federated_outbound",
    content: {
      recipient_agent_id: "agent:casey@example.net",
      delivery_status: "pending_relay",
    },
  });
  const failed = message({
    id: "failure-1",
    thread_id: "thread-fed",
    type: "agent_message",
    subtype: "federated_delivery_failed",
    content: {
      attempted_message_id: "attempt-1",
      error: "remote rejected relay: 503 unavailable",
    },
  });
  const sent = message({
    id: "sent-1",
    thread_id: "thread-fed",
    type: "agent_message",
    subtype: "federated_delivery_sent",
    content: {
      attempted_message_id: "attempt-1",
    },
  });

  assert.deepEqual(federationDeliveryStatus(outbound), {
    label: "Federation pending",
    detail: "Queued for agent:casey@example.net; pending relay.",
    tone: "pending",
  });
  assert.deepEqual(federationDeliveryStatus(failed), {
    label: "Federation failed",
    detail: "remote rejected relay: 503 unavailable",
    tone: "failed",
    attemptedMessageId: "attempt-1",
  });
  assert.deepEqual(federationDeliveryStatus(sent), {
    label: "Federation accepted",
    detail: "Peer homeserver accepted the relay request.",
    tone: "sent",
    attemptedMessageId: "attempt-1",
  });
  assert.deepEqual([...acceptedFederationAttemptIds([outbound, failed, sent])], ["attempt-1"]);
});

test("thread view presentation resolves outbound federation status from receipts", () => {
  const outbound = message({
    id: "attempt-effective",
    thread_id: "thread-fed",
    type: "agent_message",
    subtype: "federated_outbound",
    content: {
      recipient_agent_id: "agent:casey@example.net",
      delivery_status: "pending_relay",
    },
  });
  const failed = message({
    id: "failure-effective",
    thread_id: "thread-fed",
    type: "agent_message",
    subtype: "federated_delivery_failed",
    content: {
      attempted_message_id: "attempt-effective",
      error: "remote rejected relay: 503 unavailable",
    },
  });
  const sent = message({
    id: "sent-effective",
    thread_id: "thread-fed",
    type: "agent_message",
    subtype: "federated_delivery_sent",
    content: {
      attempted_message_id: "attempt-effective",
    },
  });

  assert.equal(federationDeliveryStatus(outbound)?.tone, "pending");
  assert.deepEqual(
    federationDeliveryStatus(outbound, federationDeliveryReceiptSummary([outbound, failed])),
    {
      label: "Federation failed",
      detail: "remote rejected relay: 503 unavailable",
      tone: "failed",
      attemptedMessageId: "attempt-effective",
    },
  );
  assert.deepEqual(
    federationDeliveryStatus(outbound, federationDeliveryReceiptSummary([outbound, failed, sent])),
    {
      label: "Federation accepted",
      detail: "Peer homeserver accepted the relay request.",
      tone: "sent",
      attemptedMessageId: "attempt-effective",
    },
  );
  assert.deepEqual(
    federationDeliveryStatus(outbound, federationDeliveryReceiptSummary([sent, failed, outbound])),
    {
      label: "Federation accepted",
      detail: "Peer homeserver accepted the relay request.",
      tone: "sent",
      attemptedMessageId: "attempt-effective",
    },
  );
});

test("thread view presentation detects accepted federation attempts from metadata fallback", () => {
  const sent = message({
    id: "sent-2",
    thread_id: "thread-fed",
    type: "agent_message",
    subtype: "federated_delivery_sent",
    content: {},
    metadata: {
      attempted_message_id: "attempt-from-metadata",
    },
  });

  assert.equal(federationDeliveryStatus(sent)?.attemptedMessageId, "attempt-from-metadata");
  assert.deepEqual([...acceptedFederationAttemptIds([sent])], ["attempt-from-metadata"]);
});

test("thread view presentation validates federated agent ids", () => {
  assert.equal(isFederatedAgentId("agent:casey@example.net"), true);
  assert.equal(isFederatedAgentId(" agent:casey.smith+ops@relay.example.net "), true);
  assert.equal(isFederatedAgentId("casey@example.net"), false);
  assert.equal(isFederatedAgentId("agent:.casey@example.net"), false);
  assert.equal(isFederatedAgentId("agent:casey@example..net"), false);
  assert.equal(isFederatedAgentId("agent:casey@-example.net"), false);
});

test("thread view presentation validates federation composer inputs", () => {
  assert.equal(federatedTextCharCount("A😀B"), 3);
  assert.equal(
    federatedComposerValidationError({
      recipientAgentId: "agent:casey@example.net",
      subject: "Planning handoff",
      body: "Can your agent review this plan?",
    }),
    null,
  );
  assert.equal(
    federatedComposerValidationError({
      recipientAgentId: "casey@example.net",
      body: "Hello",
    }),
    "Enter an agent id like agent:name@example.com.",
  );
  assert.equal(
    federatedComposerValidationError({
      recipientAgentId: "agent:casey@example.net",
      subject: "x".repeat(FEDERATION_SUBJECT_MAX_CHARS + 1),
      body: "Hello",
    }),
    "Subject must be 200 characters or fewer.",
  );
  assert.equal(
    federatedComposerValidationError({
      recipientAgentId: "agent:casey@example.net",
      body: "x".repeat(FEDERATION_BODY_MAX_CHARS + 1),
    }),
    "Message must be 8,000 characters or fewer.",
  );
  assert.equal(
    federatedComposerValidationError({
      recipientAgentId: "agent:casey@example.net",
      body: `${"😀".repeat(FEDERATION_BODY_MAX_CHARS)}`,
    }),
    null,
  );
  assert.equal(
    federatedComposerValidationError({
      recipientAgentId: "agent:casey@example.net",
      body: "   ",
    }),
    "Message body is required.",
  );
});
