import test from "node:test";
import assert from "node:assert/strict";
import {
  appendSpaceMessageIfCurrent,
  normalizeCreatedSpaceMessageResponse,
  normalizeCreatedSpaceResponse,
  normalizeSpaceMembersResponse,
  normalizeSpaceMessagesResponse,
  normalizeSpacesResponse,
  shouldApplySpaceState,
  shouldShowSpaceScopedPendingState,
} from "../src/lib/spacesViewState.ts";

test("shouldApplySpaceState only accepts matching active space ids", () => {
  assert.equal(shouldApplySpaceState("space_a", "space_a"), true);
  assert.equal(shouldApplySpaceState("space_b", "space_a"), false);
  assert.equal(shouldApplySpaceState(null, "space_a"), false);
});

test("appendSpaceMessageIfCurrent ignores stale responses for another space", () => {
  const original = [{ id: "msg_1" }];
  const result = appendSpaceMessageIfCurrent(
    original,
    "space_b",
    "space_a",
    { id: "msg_2" },
  );
  assert.deepEqual(result, original);
});

test("appendSpaceMessageIfCurrent appends when the active space still matches", () => {
  const original = [{ id: "msg_1" }];
  const result = appendSpaceMessageIfCurrent(
    original,
    "space_a",
    "space_a",
    { id: "msg_2" },
  );
  assert.deepEqual(result, [{ id: "msg_1" }, { id: "msg_2" }]);
});

test("shouldShowSpaceScopedPendingState only shows busy state for the matching space", () => {
  assert.equal(shouldShowSpaceScopedPendingState("space_a", "space_a"), true);
  assert.equal(shouldShowSpaceScopedPendingState("space_b", "space_a"), false);
  assert.equal(shouldShowSpaceScopedPendingState("space_a", null), false);
});

test("normalizeSpacesResponse keeps valid spaces and drops malformed rows", () => {
  const spaces = normalizeSpacesResponse({
    spaces: [
      {
        id: "space_1",
        name: "Launch",
        description: "Project room",
        owner_user_id: 42,
        afp_thread_id: "thread_1",
        is_public: true,
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-02T00:00:00Z",
      },
      { name: "missing id" },
    ],
  });

  assert.deepEqual(spaces, [
    {
      id: "space_1",
      name: "Launch",
      description: "Project room",
      owner_user_id: "42",
      afp_thread_id: "thread_1",
      is_public: true,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-02T00:00:00Z",
    },
  ]);
});

test("space response normalizers reject malformed message and member rows", () => {
  const messages = normalizeSpaceMessagesResponse({
    messages: [
      {
        id: "msg_1",
        space_id: "space_1",
        afp_message_id: null,
        from_agent: "user",
        author_user_id: "user_1",
        type: "text",
        content: { text: "hello" },
        created_at: "2026-08-03T00:00:00Z",
      },
      { space_id: "space_1" },
    ],
  });
  const members = normalizeSpaceMembersResponse({
    members: [
      { id: "member_1", user_id: "user_1", role: "owner", joined_at: "2026-08-03T00:00:00Z" },
      { user_id: "missing id" },
    ],
  });

  assert.deepEqual(messages, [{
    id: "msg_1",
    space_id: "space_1",
    afp_message_id: "msg_1",
    from_agent: "user",
    author_user_id: "user_1",
    type: "text",
    subtype: undefined,
    content: { text: "hello" },
    created_at: "2026-08-03T00:00:00Z",
  }]);
  assert.deepEqual(members, [{
    id: "member_1",
    user_id: "user_1",
    agent_id: undefined,
    role: "owner",
    joined_at: "2026-08-03T00:00:00Z",
  }]);
});

test("created response helpers return null when payloads omit created records", () => {
  assert.equal(normalizeCreatedSpaceResponse({}), null);
  assert.equal(normalizeCreatedSpaceMessageResponse({ message: { space_id: "space_1" } }), null);
  assert.equal(normalizeCreatedSpaceResponse({ space: { id: "space_1", name: "Launch" } })?.id, "space_1");
  assert.equal(normalizeCreatedSpaceMessageResponse({ message: { id: "msg_1" } })?.id, "msg_1");
});
