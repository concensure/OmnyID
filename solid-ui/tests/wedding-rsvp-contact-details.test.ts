import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("RSVP contact-detail request extends the existing private capability", async () => {
  const [publisher, guest, route, capability, migration] = await Promise.all([
    read("solid-ui/src/components/WeddingRsvpPublishingPanel.tsx"),
    read("solid-ui/src/rsvp.tsx"),
    read("src/server/wedding_rsvp_response_routes.rs"),
    read("src/server/wedding_rsvp_capability_routes.rs"),
    read("postgres/migrations/0150_wedding_rsvp_contact_detail_requests.sql"),
  ]);
  assert.match(publisher, /requestContactDetails/);
  assert.match(publisher, /mailto:/);
  assert.match(publisher, /Email \{recipient\.displayName\}/);
  for (const field of ["displayName", "email", "phone", "relationshipToCouple"]) {
    assert.match(guest, new RegExp(field));
  }
  assert.match(capability, /request_contact_details/);
  assert.match(route, /wedding_boundary_guest_profile/);
  assert.match(route, /This RSVP link did not request contact details/);
  assert.match(migration, /request_contact_details BOOLEAN NOT NULL DEFAULT FALSE/);
});

test("contact details are written only after a protected guest submission", async () => {
  const route = await read("src/server/wedding_rsvp_response_routes.rs");
  assert.match(route, /matches!\(source, ResponseSource::Guest\)/);
  assert.match(route, /append_guest_contact_successor/);
  assert.doesNotMatch(route, /contact_details[^\n]+tracing::/);
});
