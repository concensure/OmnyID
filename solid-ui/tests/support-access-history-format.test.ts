import assert from "node:assert/strict";
import test from "node:test";

import { dateTimeLabel, durationLabel, relativeTimeLabel } from "../src/lib/agentSettingsRuntimeFormat.ts";
import {
  supportAccessHistoryCard,
  supportAccessHistoryCards,
  supportAccessHistoryLines,
} from "../src/lib/supportAccessHistoryFormat.ts";

test("support access history formatters provide stable fallbacks", () => {
  assert.deepEqual(supportAccessHistoryCards(null), []);
});

test("support access history formatters expose card presentation consistently", () => {
  const entry = {
    id: "support-1",
    status: "granted",
    access_scope: "runtime_recovery",
    granted_at: "2026-08-14T07:00:00Z",
    expires_at: "2026-08-14T09:00:00Z",
    revoked_at: "2026-08-14T08:00:00Z",
    reason: "Operator review",
  };

  assert.deepEqual(supportAccessHistoryLines(entry), [
    `granted ${dateTimeLabel(entry.granted_at)} | expires ${dateTimeLabel(entry.expires_at)}`,
    `consent window ${durationLabel(entry.granted_at, entry.revoked_at ?? entry.expires_at) ?? "unknown"} | revoked ${dateTimeLabel(entry.revoked_at)}`,
    `granted ${relativeTimeLabel(entry.granted_at)} | revoked ${relativeTimeLabel(entry.revoked_at)}`,
    "Operator review",
  ]);
  assert.deepEqual(supportAccessHistoryCard(entry), {
    title: "granted | runtime_recovery",
    lines: supportAccessHistoryLines(entry),
  });
  assert.deepEqual(supportAccessHistoryCards([entry]), [
    {
      title: "granted | runtime_recovery",
      lines: supportAccessHistoryLines(entry),
    },
  ]);
});
