import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWeddingTaskAssignmentEmail,
  hasWeddingAssignmentContact,
  weddingAssignmentContactKey,
} from "../src/lib/weddingTaskAssignmentEmailState.ts";

test("task assignment email includes couple task brief due date and contact details", () => {
  const email = buildWeddingTaskAssignmentEmail({
    assigneeName: "Mia",
    coupleNames: "Alex and Sam",
    coupleEmail: "couple@example.com",
    taskName: "Confirm the florist",
    taskBrief: "Compare the final two quotes.",
    expiry: "20 October 2026",
  });
  assert.match(email.subject, /Alex and Sam.*Confirm the florist/);
  assert.match(email.text, /Mia/);
  assert.match(email.text, /Compare the final two quotes/);
  assert.match(email.text, /20 October 2026/);
  assert.match(email.text, /couple@example\.com/);
  assert.match(email.text, /Made by OmnyID Wedding Planner/);
  assert.match(email.html, /<br>/);
});

test("task assignment email provides safe fallbacks and escapes html", () => {
  const email = buildWeddingTaskAssignmentEmail({
    assigneeName: "<Helper>",
    taskName: "Venue & catering",
  });
  assert.match(email.text, /No due date has been set yet/);
  assert.doesNotMatch(email.html, /<Helper>/);
  assert.match(email.html, /&lt;Helper&gt;/);
  assert.match(email.html, /Venue &amp; catering/);
});

test("assignment contacts deduplicate by normalized email and role", () => {
  const contacts = [{ email: "MIA@EXAMPLE.COM", roles: ["Wedding Party", "Friend"] }];
  assert.equal(hasWeddingAssignmentContact(contacts, " mia@example.com ", "wedding   party"), true);
  assert.equal(hasWeddingAssignmentContact(contacts, "mia@example.com", "Planner"), false);
  assert.equal(weddingAssignmentContactKey(" MIA@EXAMPLE.COM ", " Wedding   Party "), "mia@example.com|wedding party");
});
