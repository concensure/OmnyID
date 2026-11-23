import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWeddingRsvpHouseholdExperience,
  weddingRsvpCalendarUrl,
  weddingRsvpDirectionsUrl,
  weddingRsvpMaterialPreflightGap,
  weddingRsvpTestEnvelopeFromHash,
  weddingRsvpTestLink,
} from "../src/lib/weddingRsvpHouseholdExperienceState.ts";
import type { WeddingRsvpSetupState, WeddingRsvpInvitationPreview } from "../src/lib/weddingRsvpSetupState.ts";

const setup: WeddingRsvpSetupState = {
  setupId: "setup", contractVersion: 1, revision: 1, status: "draft", eventId: "event", eventLabel: "Rivera wedding",
  hostLabel: "Maya and Sam", responseDeadline: "2027-08-01", eventDate: "2027-09-10", eventLocalTime: "16:30",
  eventTimeZone: "Australia/Sydney", venueName: "Garden Room", venueAddress: "1 Harbour Street, Sydney NSW",
  encryptionKeyId: null, encryptionPublicKeyHex: null, questions: [], updatedAt: "2027-01-01T00:00:00Z",
};
const preview: WeddingRsvpInvitationPreview = {
  householdId: "rivera", householdLabel: "Rivera household", hostLabel: setup.hostLabel, eventLabel: setup.eventLabel,
  responseDeadline: setup.responseDeadline, eventDate: setup.eventDate, eventLocalTime: setup.eventLocalTime,
  eventTimeZone: setup.eventTimeZone, venueName: setup.venueName, venueAddress: setup.venueAddress,
  recipients: [{ displayName: "Alex Rivera", invitationId: "inv-1", responseStatus: "pending", plusOneAllowed: false, childrenInvited: false }],
  questionLabels: ["Attendance"], questions: [{ label: "Attendance", required: true, sensitive: false }], privacyLabel: "Private stays private",
};

test("one pure projection drives preview and short-lived non-submitting test mode", () => {
  const experience = buildWeddingRsvpHouseholdExperience(setup, preview, "preview");
  assert.equal(experience.recipientLabels[0], "Alex Rivera");
  assert.match(weddingRsvpDirectionsUrl(experience.venueAddress)!, /destination=1\+Harbour|destination=1%20Harbour/);
  assert.match(weddingRsvpCalendarUrl(experience)!, /calendar\.google\.com/);
  const now = new Date("2027-01-01T00:00:00Z");
  const link = weddingRsvpTestLink({ ...experience, mode: "test" }, "https://omnyid.test", now);
  const envelope = weddingRsvpTestEnvelopeFromHash(`#${link.split("#")[1]}`, new Date("2027-01-01T00:14:00Z"));
  assert.equal(envelope?.experience.mode, "test");
  assert.equal(weddingRsvpTestEnvelopeFromHash(`#${link.split("#")[1]}`, new Date("2027-01-01T00:16:00Z")), null);
  assert.ok(!link.split("#")[1].match(/^[A-Za-z0-9_-]{43}$/), "test fragment cannot be accepted as a production capability token");
});

test("Rivera missing-address preview exposes one material fix and hides directions", () => {
  const facts = { ...setup, venueAddress: null };
  assert.equal(weddingRsvpDirectionsUrl(facts.venueAddress), null);
  assert.deepEqual(weddingRsvpMaterialPreflightGap(facts), { label: "Venue address is missing, so directions are not shown.", actionLabel: "Add venue address" });
});
