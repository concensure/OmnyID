import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "../src/components/WeddingDecisionRsvpFollowUp.tsx"), "utf8");

test("RSVP decision follow-up exposes exact editable recipient, message, contact detail and explicit send controls", () => {
  assert.match(source, /type="email"/);
  assert.match(source, /<textarea/);
  assert.match(source, /View other details about this person/);
  assert.match(source, /Phone:/);
  assert.match(source, /Save draft/);
  assert.match(source, /Send reminder/);
  assert.match(source, /weddingRsvpReminderApprovalToAfpSendInput/);
});
