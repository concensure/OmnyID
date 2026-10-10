import assert from "node:assert/strict";
import test from "node:test";

import { activeSubscribersCsv, normalizeAdminWeddingNewsletterList } from "@/lib/weddingNewsletterApi";

test("newsletter list normalizes rows and drops malformed entries", () => {
  const list = normalizeAdminWeddingNewsletterList({
    subscribers: [
      { subscriber_id: "s1", email: "a@example.com", source: "wedding_blog", subscribed_at: "2026-10-10", unsubscribed_at: null },
      { email: "missing-id@example.com" },
      "not-a-row",
    ],
    active_count: 1,
    unsubscribed_count: 2,
  });
  assert.equal(list.subscribers.length, 1);
  assert.equal(list.subscribers[0]?.unsubscribedAt, null);
  assert.equal(list.activeCount, 1);
  assert.equal(list.unsubscribedCount, 2);
});

test("newsletter list tolerates an unexpected payload", () => {
  assert.deepEqual(normalizeAdminWeddingNewsletterList(null), {
    subscribers: [],
    activeCount: 0,
    unsubscribedCount: 0,
  });
});

test("active CSV excludes unsubscribed addresses and neutralises spreadsheet formulas", () => {
  const csv = activeSubscribersCsv([
    { subscriberId: "1", email: "keep@example.com", source: "wedding_home", subscribedAt: "2026-10-10", unsubscribedAt: null },
    { subscriberId: "2", email: "gone@example.com", source: "wedding_home", subscribedAt: "2026-10-09", unsubscribedAt: "2026-10-10" },
    { subscriberId: "3", email: "=cmd@example.com", source: "wedding_blog", subscribedAt: "2026-10-08", unsubscribedAt: null },
  ]);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "email,source,subscribed_at");
  assert.equal(lines.length, 3);
  assert.ok(!csv.includes("gone@example.com"));
  assert.ok(lines[2]?.startsWith(`"'=cmd@example.com"`));
});
