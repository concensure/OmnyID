import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEmailItems,
  emailLabelOptions,
  emailMailboxCounts,
  emailSmartFolderCounts,
  extractEmailMessage,
  filterEmailItems,
  initialComposerBody,
  mailboxLabel,
  relativeEmailTime,
  selectedEmailItem,
  splitQuotedEmailBody,
  unreadEmailItemCount,
} from "../src/lib/emailViewState.ts";

const NOW_MS = Date.UTC(2026, 7, 14, 12, 0, 0);

test("email view state extracts normalized email messages from AFP payloads", () => {
  const item = extractEmailMessage({
    id: "msg-1",
    thread_id: "thread-1",
    type: "email_inbox",
    timestamp: "2026-08-14T10:00:00Z",
    from: "agent:mailbox",
    content: {
      mailbox: "inbox",
      from_name: "Jordan Lee",
      from_email: "jordan@example.com",
      subject: "Invoice follow-up",
      preview: "Please confirm payment timing.",
      body_text: "Please confirm payment timing and approval.",
      unread: true,
      requires_approval: true,
      labels: ["Finance"],
    },
    metadata: {},
    supertags: ["relationship:vip"],
    views: [],
    attachments: [],
    references: [],
  } as any);

  assert.equal(item.mailbox, "inbox");
  assert.equal(item.sender, "Jordan Lee");
  assert.equal(item.senderDetail, "jordan@example.com");
  assert.equal(item.subject, "Invoice follow-up");
  assert.equal(item.preview, "Please confirm payment timing.");
  assert.equal(item.body, "Please confirm payment timing and approval.");
  assert.equal(item.unread, true);
  assert.equal(item.actionable, true);
  assert.equal(item.requiresApproval, true);
  assert.deepEqual(item.labels, ["Finance"]);
});

test("email view state hides encrypted email content until local decryption is available", () => {
  const item = extractEmailMessage({
    id: "msg-encrypted-email",
    thread_id: "thread-encrypted-email",
    type: "email_inbox",
    timestamp: "2026-08-14T10:00:00Z",
    from: "agent:mailbox",
    content: {
      from_name: "Hidden Vendor",
      subject: "Hidden Quote",
      preview: "Private price quote",
      body_text: "Ciphertext should not leak.",
      ciphertext: "abc123",
      nonce: "nonce123",
    },
    encryption: { scheme: "xchacha20-poly1305", key_id: "device-key" },
    metadata: {},
    supertags: ["wedding"],
    views: [],
    attachments: [],
    references: [],
  } as any);

  assert.equal(item.sender, "agent:mailbox");
  assert.equal(item.subject, "Encrypted message - unlock this device to view");
  assert.equal(item.preview, "No structured email preview yet. Open the thread to inspect the AFP message details.");
  assert.equal(item.body, item.preview);
  assert.equal(filterEmailItems({
    items: [item],
    selectedMailbox: "inbox",
    selectedSmartFolder: null,
    query: "hidden",
  }).length, 0);
});

test("email view state splits quoted email bodies into primary and hidden history", () => {
  assert.deepEqual(
    splitQuotedEmailBody("Latest response\n\nOn Tue, Jordan wrote:\n> Prior reply"),
    {
      primaryBody: "Latest response",
      quotedBody: "On Tue, Jordan wrote:\n> Prior reply",
      hiddenMessageCount: 1,
    },
  );
});

test("email view state builds items counts filters and selection consistently", () => {
  const items = buildEmailItems({
    messages: [
      {
        id: "msg-inbox",
        thread_id: "thread-a",
        type: "email_inbox",
        timestamp: "2026-08-14T11:00:00Z",
        from: "agent:mailbox",
        content: {
          mailbox: "inbox",
          from_name: "Alex Morgan",
          subject: "Travel itinerary",
          preview: "Flight and hotel details attached.",
          unread: true,
          labels: ["Travel"],
        },
        metadata: {},
        supertags: ["trip"],
        views: [],
        attachments: [],
        references: [],
      },
      {
        id: "msg-archive",
        thread_id: "thread-b",
        type: "email_archive",
        timestamp: "2026-08-13T10:00:00Z",
        from: "agent:mailbox",
        content: {
          mailbox: "archive",
          from_name: "Priya Shah",
          subject: "Quarterly finance review",
          preview: "Updated expense notes.",
          unread: false,
          labels: ["Finance"],
        },
        metadata: {},
        supertags: ["finance"],
        views: [],
        attachments: [],
        references: [],
      },
    ] as any,
    localDrafts: [
      {
        id: "draft-1",
        threadId: "thread-draft",
        sender: "You",
        senderDetail: "Local shell draft",
        subject: "Draft reply",
        preview: "Prepared locally",
        body: "Prepared locally",
        timestamp: "2026-08-14T09:00:00Z",
        supertags: ["Tone:Short"],
      },
    ],
    mailboxOverrides: { "msg-archive": "trash" },
    readMessageIds: new Set(["msg-inbox"]),
  });

  assert.deepEqual(items.map((item) => item.id), ["msg-inbox", "draft-1", "msg-archive"]);
  assert.equal(items[0]?.unread, false);
  assert.equal(items[2]?.mailbox, "trash");
  assert.deepEqual(emailLabelOptions(items), ["Travel", "Local draft", "Finance"]);
  assert.deepEqual(
    emailMailboxCounts(items).map((entry) => [entry.key, entry.count]),
    [["inbox", 1], ["sent", 0], ["drafts", 1], ["archive", 0], ["trash", 1]],
  );
  assert.deepEqual(
    emailSmartFolderCounts(items).map((entry) => [entry.id, entry.count]),
    [["finance", 1], ["travel", 1]],
  );

  const filteredInbox = filterEmailItems({
    items,
    selectedMailbox: "inbox",
    selectedSmartFolder: null,
    query: "",
  });
  assert.deepEqual(filteredInbox.map((item) => item.id), ["msg-inbox"]);

  const filteredTravel = filterEmailItems({
    items,
    selectedMailbox: "inbox",
    selectedSmartFolder: "travel",
    query: "alex",
  });
  assert.deepEqual(filteredTravel.map((item) => item.id), ["msg-inbox"]);
  assert.equal(unreadEmailItemCount(filteredTravel), 0);
  assert.equal(selectedEmailItem(items, "draft-1")?.subject, "Draft reply");
});

test("email view state surfaces Gmail passive incoming AFP events in the inbox", () => {
  const items = buildEmailItems({
    messages: [
      {
        id: "passive-gmail-1",
        thread_id: "passive-thread",
        type: "passive_event",
        timestamp: "2026-08-14T11:30:00Z",
        from: "background_watcher",
        content: {
          event_type: "email_incoming",
          source: "gmail_watch",
          metadata: {
            provider: "gmail",
            gmail_email: "concensure@gmail.com",
            message_id: "gmail-provider-message-1",
            subject: "OmnyID Gmail provider verification",
            snippet: "Live Gmail provider verification received.",
            from_address: "sender@example.com",
            to_address: "concensure@gmail.com",
            requires_action: true,
          },
          payload: {
            provider: "gmail",
            subject: "OmnyID Gmail provider verification",
            snippet: "Live Gmail provider verification received.",
            from_address: "sender@example.com",
            to_address: "concensure@gmail.com",
          },
        },
        metadata: {},
        supertags: [],
        views: [],
        attachments: [],
        references: [],
      },
    ] as any,
    localDrafts: [],
    mailboxOverrides: {},
    readMessageIds: new Set(),
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.mailbox, "inbox");
  assert.equal(items[0]?.sender, "sender@example.com");
  assert.equal(items[0]?.senderDetail, "concensure@gmail.com");
  assert.equal(items[0]?.subject, "OmnyID Gmail provider verification");
  assert.equal(items[0]?.preview, "Live Gmail provider verification received.");
  assert.equal(items[0]?.unread, true);
});

test("email view state exposes stable format helpers", () => {
  assert.equal(relativeEmailTime(new Date(NOW_MS - 15 * 60 * 1000).toISOString(), NOW_MS), "15m ago");
  assert.equal(relativeEmailTime("2026-08-01T00:00:00.000Z", NOW_MS), "Aug 1, 2026");
  assert.equal(mailboxLabel("drafts"), "Drafts");
  assert.ok(initialComposerBody({ subject: "Plan", sender: "Jordan Lee" } as any).includes("Hi Jordan,"));
});
