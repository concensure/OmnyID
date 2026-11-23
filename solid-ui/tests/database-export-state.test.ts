import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDatabaseExportSnapshot,
  databaseSnapshotEmailBody,
  databaseSnapshotHtml,
  databaseSnapshotSvg,
} from "../src/lib/databaseExportState.ts";

test("database exports are bounded, escaped and preserve the selected table", () => {
  const snapshot = buildDatabaseExportSnapshot({
    databaseId: "database:guest-list",
    name: "Our <guests>",
    tableLabel: "guest_list",
    columns: ["guest", "rsvp"],
    rows: [
      { id: "1", table: "guest_list", data: { guest: "Mia & Jordan", rsvp: "Attending" } },
      { id: "2", table: "guest_list", data: { guest: "Sam", rsvp: "Pending" } },
    ],
    generatedAt: "2026-11-18T00:00:00.000Z",
    limit: 1,
  });
  assert.equal(snapshot.rows.length, 1);
  assert.equal(snapshot.truncated, true);
  assert.match(databaseSnapshotHtml(snapshot), /Our &lt;guests&gt;/);
  assert.doesNotMatch(databaseSnapshotHtml(snapshot), /Our <guests>/);
  assert.match(databaseSnapshotSvg(snapshot), /guest_list/);
  assert.match(databaseSnapshotEmailBody(snapshot), /Mia & Jordan/);
});
