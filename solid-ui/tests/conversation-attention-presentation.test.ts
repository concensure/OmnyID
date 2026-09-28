import assert from "node:assert/strict";
import test from "node:test";

import {
  artifactSummary,
  attentionRank,
  attentionTone,
  conversationAttentionArtifactNavigationPlan,
  conversationAttentionCountLabel,
  conversationAttentionItemNavigationPlan,
  conversationAttentionSourceEventNavigationPlan,
  conversationAttentionStatusBadge,
  conversationAttentionSubtitleLabel,
  executeConversationAttentionNavigationPlan,
  familyFallbackLabel,
  familyLabel,
  hasReviewTarget,
  navigateConversationAttentionArtifact,
  navigateConversationAttentionItem,
  navigateConversationAttentionSourceEvent,
  reviewLabel,
  singleItemHeaderDetail,
  type ConversationAttentionItem,
  type ConversationAttentionSummary,
} from "../src/lib/conversationAttentionPresentation.ts";

function makeItem(
  patch: Partial<ConversationAttentionItem> = {},
): ConversationAttentionItem {
  return {
    id: "attn_1",
    summary: "Need follow-up",
    latest_attention_kind: "prepared_draft",
    latest_attention_label: "draft ready",
    conversation_family: "forms",
    conversation_family_label: null,
    review_action_label: null,
    thread_id: null,
    source_event_id: null,
    latest_artifact_id: null,
    latest_message_ref: null,
    latest_artifact_destination_view: null,
    latest_artifact_summary: null,
    latest_value_hint: null,
    latest_form_owner: null,
    latest_submission_mode: null,
    latest_sensitive_form: false,
    attention_rank: null,
    ...patch,
  };
}

function makeSummary(
  patch: Partial<NonNullable<ConversationAttentionSummary>> = {},
): NonNullable<ConversationAttentionSummary> {
  return {
    count: 1,
    prepared_draft_count: 0,
    approval_request_count: 0,
    background_follow_up_count: 1,
    communication_count: 0,
    renewal_count: 0,
    bill_count: 0,
    form_count: 0,
    ...patch,
  };
}

test("conversation attention presentation uses expected tone, family, and review labels", () => {
  assert.equal(attentionTone("approval_request"), "border-amber-200/70 bg-amber-50/80 text-amber-700");
  assert.equal(attentionTone("other"), "border-sky-200/70 bg-sky-50/80 text-sky-700");
  assert.equal(familyFallbackLabel(" communications "), "communication");
  assert.equal(familyLabel(makeItem({ conversation_family_label: " Forms queue " })), "Forms queue");
  assert.equal(reviewLabel(makeItem({ review_action_label: " Review now " })), "Review now");
  assert.equal(reviewLabel(makeItem()), "Open work item");
});

test("conversation attention presentation detects review targets and suppresses duplicate artifact summaries", () => {
  assert.equal(hasReviewTarget(makeItem()), false);
  assert.equal(hasReviewTarget(makeItem({ latest_artifact_id: "artifact_1" })), true);
  assert.equal(hasReviewTarget(makeItem({ latest_attention_kind: "approval_request" })), true);
  assert.equal(
    artifactSummary(makeItem({ latest_artifact_summary: " Need follow-up " })),
    null,
  );
  assert.equal(
    artifactSummary(makeItem({ latest_artifact_summary: " Signed PDF attached " })),
    "Signed PDF attached",
  );
});

test("conversation attention presentation builds single-item form detail without duplicate fragments", () => {
  const item = makeItem({
    latest_value_hint: "Today",
    latest_form_owner: "Jordan",
    latest_submission_mode: "portal",
    latest_sensitive_form: true,
  });
  assert.equal(
    singleItemHeaderDetail(item),
    "Today For Jordan. Submit via portal. Sensitive form.",
  );
  assert.equal(singleItemHeaderDetail(makeItem({ latest_value_hint: "Soon" })), "Soon");
  assert.equal(singleItemHeaderDetail(undefined), null);
});

test("conversation attention presentation uses zero as the default rank", () => {
  assert.equal(attentionRank(makeItem()), 0);
  assert.equal(attentionRank(makeItem({ attention_rank: 7 })), 7);
});

test("conversation attention presentation derives status, count, and subtitle summaries", () => {
  const singleItem = makeItem({
    conversation_family_label: "forms",
    latest_attention_label: "draft ready",
    latest_value_hint: "Today",
  });
  assert.equal(
    conversationAttentionStatusBadge({ items: [singleItem], summary: makeSummary() }),
    "draft ready",
  );
  assert.equal(
    conversationAttentionCountLabel({ items: [singleItem], summary: makeSummary() }),
    "Forms draft ready",
  );
  assert.equal(
    conversationAttentionSubtitleLabel({ items: [singleItem], summary: makeSummary() }),
    "Today",
  );

  const approvalSummary = makeSummary({ count: 3, approval_request_count: 2 });
  assert.equal(
    conversationAttentionStatusBadge({ items: [makeItem(), makeItem()], summary: approvalSummary }),
    "gated",
  );
  assert.equal(
    conversationAttentionCountLabel({ items: [makeItem(), makeItem()], summary: approvalSummary }),
    "2 approval requests",
  );
  assert.equal(
    conversationAttentionSubtitleLabel({ items: [makeItem(), makeItem()], summary: approvalSummary }),
    "2 approval requests need a human decision.",
  );
});

test("conversation attention presentation prioritizes family and communication summary labels", () => {
  const formsSummary = makeSummary({ count: 2, form_count: 2, prepared_draft_count: 1 });
  assert.equal(
    conversationAttentionCountLabel({ items: [makeItem(), makeItem()], summary: formsSummary }),
    "2 form reviews",
  );
  assert.equal(
    conversationAttentionSubtitleLabel({ items: [makeItem(), makeItem()], summary: formsSummary }),
    "1 form review is ready for review.",
  );

  const communicationSummary = makeSummary({
    count: 3,
    background_follow_up_count: 3,
    communication_count: 3,
    prepared_draft_count: 2,
  });
  assert.equal(
    conversationAttentionCountLabel({ items: [makeItem(), makeItem(), makeItem()], summary: communicationSummary }),
    "2 communication drafts",
  );
  assert.equal(
    conversationAttentionSubtitleLabel({ items: [makeItem(), makeItem(), makeItem()], summary: communicationSummary }),
    "2 communication drafts are ready for review.",
  );
});

test("conversation attention presentation derives navigation plans for item actions", () => {
  assert.deepEqual(
    conversationAttentionItemNavigationPlan(makeItem({
      latest_artifact_destination_view: " calendar ",
    })),
    { view: "calendar" },
  );
  assert.deepEqual(
    conversationAttentionItemNavigationPlan(makeItem({
      latest_attention_kind: "approval_request",
    })),
    { view: "decision_queue" },
  );
  assert.deepEqual(
    conversationAttentionItemNavigationPlan(makeItem({
      thread_id: "thread_1",
      latest_artifact_id: "msg_1",
    })),
    { view: "threads", threadId: "thread_1", messageId: "msg_1" },
  );
  assert.deepEqual(conversationAttentionItemNavigationPlan(makeItem()), { view: "home" });
});

test("conversation attention presentation derives artifact and source-event navigation plans", () => {
  assert.deepEqual(
    conversationAttentionArtifactNavigationPlan(makeItem({
      latest_artifact_destination_view: "agent_settings",
      thread_id: "thread_1",
    })),
    { view: "agent_settings" },
  );
  assert.deepEqual(
    conversationAttentionArtifactNavigationPlan(makeItem({
      latest_artifact_id: "artifact_1",
      latest_message_ref: "fallback_1",
    })),
    { view: "threads", threadId: undefined, messageId: "artifact_1" },
  );
  assert.deepEqual(
    conversationAttentionSourceEventNavigationPlan(makeItem({
      thread_id: "thread_2",
      source_event_id: "source_1",
    })),
    { view: "threads", threadId: "thread_2", messageId: "source_1" },
  );
  assert.deepEqual(
    conversationAttentionSourceEventNavigationPlan(makeItem({
      latest_attention_kind: "approval_request",
    })),
    { view: "decision_queue" },
  );
});

test("conversation attention presentation executes navigation plans with normalized view extras", () => {
  const calls: Array<{ view: string; extra?: Record<string, unknown> }> = [];
  const navigate = (view: string, extra?: Record<string, unknown>) => {
    calls.push({ view, extra });
  };

  executeConversationAttentionNavigationPlan(
    { view: "threads", threadId: "thread_1", messageId: "msg_1" },
    navigate,
  );
  executeConversationAttentionNavigationPlan(
    { view: "calendar", eventId: "event_1", date: "2026-07-20" },
    navigate,
  );
  executeConversationAttentionNavigationPlan(
    { view: "agent_settings", settingsTab: "skills" },
    navigate,
  );
  executeConversationAttentionNavigationPlan(
    { view: "decision_queue" },
    navigate,
  );

  assert.deepEqual(calls, [
    { view: "threads", extra: { threadId: "thread_1", messageId: "msg_1" } },
    { view: "calendar", extra: { eventId: "event_1", date: "2026-07-20" } },
    { view: "agent_settings", extra: { settingsTab: "skills" } },
    { view: "decision_queue", extra: undefined },
  ]);
});

test("conversation attention presentation exposes direct navigation helpers for item actions", () => {
  const calls: Array<{ view: string; extra?: Record<string, unknown> }> = [];
  const navigate = (view: string, extra?: Record<string, unknown>) => {
    calls.push({ view, extra });
  };

  navigateConversationAttentionItem(
    makeItem({
      thread_id: "thread_1",
      latest_artifact_id: "artifact_1",
    }),
    navigate,
  );
  navigateConversationAttentionArtifact(
    makeItem({
      latest_artifact_destination_view: "calendar",
    }),
    navigate,
  );
  navigateConversationAttentionSourceEvent(
    makeItem({
      thread_id: "thread_2",
      source_event_id: "source_1",
    }),
    navigate,
  );

  assert.deepEqual(calls, [
    { view: "threads", extra: { threadId: "thread_1", messageId: "artifact_1" } },
    { view: "calendar", extra: { eventId: undefined, date: undefined } },
    { view: "threads", extra: { threadId: "thread_2", messageId: "source_1" } },
  ]);
});
