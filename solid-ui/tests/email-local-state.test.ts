import test from "node:test";
import assert from "node:assert/strict";

import { accountScopedStorageKey } from "../src/lib/accountScopedStorage.ts";
import {
  LOCAL_EMAIL_DRAFTS_KEY,
  LOCAL_EMAIL_MAILBOX_OVERRIDES_KEY,
  LOCAL_EMAIL_READ_STATE_KEY,
  LOCAL_GMAIL_SYNC_PREFERENCE_KEY,
  loadLocalEmailDrafts,
  loadLocalEmailMailboxOverrides,
  loadLocalEmailReadState,
  loadLocalGmailSyncPreference,
  persistLocalEmailDrafts,
  persistLocalEmailMailboxOverrides,
  persistLocalEmailReadState,
  persistLocalGmailSyncPreference,
} from "../src/lib/emailLocalState.ts";

const localStorageState = new Map<string, string>();
const userId = "user-1";

Object.assign(globalThis, {
  localStorage: {
    getItem(key: string) {
      return localStorageState.has(key) ? localStorageState.get(key)! : null;
    },
    setItem(key: string, value: string) {
      localStorageState.set(key, value);
    },
    removeItem(key: string) {
      localStorageState.delete(key);
    },
  },
});

test("loadLocalEmailDrafts trims valid drafts and drops malformed entries", () => {
  localStorageState.clear();
  localStorageState.set(
    accountScopedStorageKey(LOCAL_EMAIL_DRAFTS_KEY, userId),
    JSON.stringify([
      {
        id: " draft-1 ",
        threadId: " thread-1 ",
        sender: " Jane Doe ",
        senderDetail: " jane@example.com ",
        subject: " Quarterly update ",
        preview: " Numbers attached ",
        body: " Please review the attached numbers. ",
        timestamp: " 2026-07-18T10:00:00.000Z ",
        supertags: [" finance ", "", 7],
      },
      {
        id: "draft-2",
        threadId: "",
        sender: "Broken",
        subject: "Bad",
        preview: "Bad",
        body: "Bad",
        timestamp: "2026-07-18T10:00:00.000Z",
        supertags: [],
      },
    ]),
  );

  assert.deepEqual(loadLocalEmailDrafts(userId), [
    {
      id: "draft-1",
      threadId: "thread-1",
      sender: "Jane Doe",
      senderDetail: "jane@example.com",
      subject: "Quarterly update",
      preview: "Numbers attached",
      body: "Please review the attached numbers.",
      timestamp: "2026-07-18T10:00:00.000Z",
      supertags: ["finance"],
    },
  ]);
});

test("loadLocalEmailReadState keeps only non-empty trimmed ids", () => {
  localStorageState.clear();
  localStorageState.set(
    accountScopedStorageKey(LOCAL_EMAIL_READ_STATE_KEY, userId),
    JSON.stringify([" msg-1 ", "", "msg-2", 7]),
  );

  assert.deepEqual([...loadLocalEmailReadState(userId)], ["msg-1", "msg-2"]);
  assert.equal(
    localStorageState.get(accountScopedStorageKey(LOCAL_EMAIL_READ_STATE_KEY, userId)),
    JSON.stringify(["msg-1", "msg-2"]),
  );
});

test("loadLocalEmailMailboxOverrides keeps only valid mailbox mappings", () => {
  localStorageState.clear();
  localStorageState.set(
    accountScopedStorageKey(LOCAL_EMAIL_MAILBOX_OVERRIDES_KEY, userId),
    JSON.stringify({
      " thread-1 ": "archive",
      "thread-2": "invalid",
      "": "trash",
    }),
  );

  assert.deepEqual(loadLocalEmailMailboxOverrides(userId), {
    "thread-1": "archive",
  });
  assert.equal(
    localStorageState.get(accountScopedStorageKey(LOCAL_EMAIL_MAILBOX_OVERRIDES_KEY, userId)),
    JSON.stringify({ "thread-1": "archive" }),
  );
});

test("local email loaders clear unparseable persisted json buckets", () => {
  localStorageState.clear();
  localStorageState.set(accountScopedStorageKey(LOCAL_EMAIL_DRAFTS_KEY, userId), "{bad-json");
  localStorageState.set(accountScopedStorageKey(LOCAL_EMAIL_READ_STATE_KEY, userId), "{bad-json");
  localStorageState.set(accountScopedStorageKey(LOCAL_EMAIL_MAILBOX_OVERRIDES_KEY, userId), "{bad-json");

  assert.deepEqual(loadLocalEmailDrafts(userId), []);
  assert.deepEqual([...loadLocalEmailReadState(userId)], []);
  assert.deepEqual(loadLocalEmailMailboxOverrides(userId), {});
  assert.equal(localStorageState.has(accountScopedStorageKey(LOCAL_EMAIL_DRAFTS_KEY, userId)), false);
  assert.equal(localStorageState.has(accountScopedStorageKey(LOCAL_EMAIL_READ_STATE_KEY, userId)), false);
  assert.equal(localStorageState.has(accountScopedStorageKey(LOCAL_EMAIL_MAILBOX_OVERRIDES_KEY, userId)), false);
});

test("persistLocalEmailDrafts writes only normalized draft rows", () => {
  localStorageState.clear();

  persistLocalEmailDrafts([
    {
      id: " draft-1 ",
      threadId: " thread-1 ",
      sender: " Jane Doe ",
      senderDetail: " jane@example.com ",
      subject: " Quarterly update ",
      preview: " Numbers attached ",
      body: " Please review the attached numbers. ",
      timestamp: " 2026-07-18T10:00:00.000Z ",
      supertags: [" finance ", "", "finance"],
    },
    {
      id: "draft-2",
      threadId: "",
      sender: "Broken",
      subject: "Bad",
      preview: "Bad",
      body: "Bad",
      timestamp: "2026-07-18T10:00:00.000Z",
      supertags: [],
    } as any,
  ], userId);

  assert.equal(
    localStorageState.get(accountScopedStorageKey(LOCAL_EMAIL_DRAFTS_KEY, userId)),
    JSON.stringify([
      {
        id: "draft-1",
        threadId: "thread-1",
        sender: "Jane Doe",
        senderDetail: "jane@example.com",
        subject: "Quarterly update",
        preview: "Numbers attached",
        body: "Please review the attached numbers.",
        timestamp: "2026-07-18T10:00:00.000Z",
        supertags: ["finance", "finance"],
      },
    ]),
  );
});

test("persistLocalEmailReadState writes only non-empty trimmed read ids", () => {
  localStorageState.clear();

  persistLocalEmailReadState(new Set([" msg-1 ", "", "msg-2"]), userId);

  assert.equal(
    localStorageState.get(accountScopedStorageKey(LOCAL_EMAIL_READ_STATE_KEY, userId)),
    JSON.stringify(["msg-1", "msg-2"]),
  );
});

test("persistLocalEmailMailboxOverrides writes only normalized mailbox mappings", () => {
  localStorageState.clear();

  persistLocalEmailMailboxOverrides({
    " thread-1 ": "archive",
    "thread-2": "invalid" as any,
    "": "trash",
  }, userId);

  assert.equal(
    localStorageState.get(accountScopedStorageKey(LOCAL_EMAIL_MAILBOX_OVERRIDES_KEY, userId)),
    JSON.stringify({
      "thread-1": "archive",
    }),
  );
});

test("local email loaders migrate legacy global buckets into scoped keys", () => {
  localStorageState.clear();
  localStorageState.set(LOCAL_EMAIL_DRAFTS_KEY, JSON.stringify([{ id: "draft-1", threadId: "thread-1", sender: "Jane", subject: "Hello", preview: "World", body: "World", timestamp: "2026-07-18T10:00:00.000Z", supertags: [] }]));
  localStorageState.set(LOCAL_EMAIL_READ_STATE_KEY, JSON.stringify(["msg-1"]));
  localStorageState.set(LOCAL_EMAIL_MAILBOX_OVERRIDES_KEY, JSON.stringify({ "thread-1": "archive" }));

  assert.deepEqual(loadLocalEmailDrafts(userId).map((draft) => draft.id), ["draft-1"]);
  assert.deepEqual([...loadLocalEmailReadState(userId)], ["msg-1"]);
  assert.deepEqual(loadLocalEmailMailboxOverrides(userId), { "thread-1": "archive" });
  assert.equal(localStorageState.has(LOCAL_EMAIL_DRAFTS_KEY), false);
  assert.equal(localStorageState.has(LOCAL_EMAIL_READ_STATE_KEY), false);
  assert.equal(localStorageState.has(LOCAL_EMAIL_MAILBOX_OVERRIDES_KEY), false);
});

test("local Gmail sync preference normalizes and persists mailbox scope", () => {
  localStorageState.clear();

  assert.equal(loadLocalGmailSyncPreference(userId), "new_only");

  persistLocalGmailSyncPreference("full_inbox", userId);
  assert.equal(
    localStorageState.get(accountScopedStorageKey(LOCAL_GMAIL_SYNC_PREFERENCE_KEY, userId)),
    JSON.stringify("full_inbox"),
  );
  assert.equal(loadLocalGmailSyncPreference(userId), "full_inbox");

  localStorageState.set(accountScopedStorageKey(LOCAL_GMAIL_SYNC_PREFERENCE_KEY, userId), JSON.stringify("everything"));
  assert.equal(loadLocalGmailSyncPreference(userId), "new_only");
  assert.equal(
    localStorageState.get(accountScopedStorageKey(LOCAL_GMAIL_SYNC_PREFERENCE_KEY, userId)),
    JSON.stringify("new_only"),
  );
});
