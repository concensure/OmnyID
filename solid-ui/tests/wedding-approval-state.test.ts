import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWeddingArtifactSummary, type WeddingArtifactInput } from "../src/lib/weddingArtifactState.ts";
import {
  approveWeddingApprovalRequestState,
  buildWeddingApprovalReceiptState,
  buildWeddingIntegrationReadinessState,
  buildWeddingApprovalRequestState,
} from "../src/lib/weddingApprovalState.ts";

const metadata = {
  wedding_plan_id: "wedding_plan:harbour",
  response_workspace_id: "response_workspace:planning-pass",
  source_response_id: "afp:response-1",
};

function artifact(input: WeddingArtifactInput) {
  const summary = normalizeWeddingArtifactSummary({ metadata, ...input });
  assert.ok(summary);
  return summary;
}

test("buildWeddingApprovalRequestState blocks consequential actions until explicit approval", () => {
  const emailArtifact = artifact({
    id: "artifact:email",
    title: "Venue email",
    kind: "email_draft",
    metadata: { ...metadata, approval_state: "pending_user_approval" },
    vendorLabels: ["Harbour House"],
  });
  const request = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send venue email",
    metadata,
    artifacts: [emailArtifact],
    recipients: ["events@harbour.example"],
    proposedMessage: "Could you confirm Spring 2027 availability?",
  });

  assert.equal(request.requiresApproval, true);
  assert.equal(request.userApproved, false);
  assert.equal(request.canExecute, false);
  assert.equal(request.blockKind, "needs_user_approval");
  assert.match(request.blockedReason ?? "", /Explicit user approval/i);
  assert.ok(request.disclosureLines.some((line) => /Recipients: events@harbour\.example/i.test(line)));
  assert.ok(request.disclosureLines.some((line) => /Venue email/i.test(line)));
  assert.ok(request.riskLabels.some((line) => /pending user approval/i.test(line)));
});

test("buildWeddingApprovalRequestState discloses selected decision scope", () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Contact selected venue",
    metadata,
    recipients: ["events@harbour.example"],
    decisionScopes: [{
      title: "Harbour Hall",
      detail: "Selected waterfront venue.",
      artifactId: "artifact:venues",
      artifactTitle: "Venue shortlist",
    }],
  });

  assert.ok(request.disclosureLines.some((line) => /Selected decision scope: Harbour Hall from Venue shortlist/i.test(line)));
  assert.ok(request.riskLabels.some((line) => /scoped to the selected shortlist item/i.test(line)));
});

test("buildWeddingApprovalRequestState redacts imported selected decision scope artifact titles", () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Contact selected vendor",
    metadata,
    recipients: ["events@harbour.example"],
    decisionScopes: [{
      title: "Garden Hall",
      detail: "Selected from imported planning evidence.",
      artifactId: "artifact:imported-budget",
      artifactTitle: "Imported XLSX: private-family-budget.xlsx",
    }],
  });
  const serialized = JSON.stringify(request.disclosureLines);

  assert.ok(request.disclosureLines.some((line) => /Selected decision scope: Garden Hall from Imported private planning file/i.test(line)));
  assert.equal(serialized.includes("private-family-budget.xlsx"), false);
  assert.equal(serialized.includes("Imported XLSX"), false);
});

test("buildWeddingApprovalRequestState blocks unsafe vendor-facing shares", () => {
  const budget = artifact({
    id: "artifact:budget",
    title: "Budget ceiling",
    kind: "budget_sheet",
  });
  const guestList = artifact({
    id: "artifact:guests",
    title: "Guest list",
    kind: "guest_list",
  });
  const request = buildWeddingApprovalRequestState({
    actionKind: "share_artifact",
    title: "Share with vendor",
    metadata,
    artifacts: [budget, guestList],
    recipients: ["vendor@example.com"],
    shareScope: "shared_vendor",
    userApproved: true,
  });

  assert.equal(request.canExecute, false);
  assert.equal(request.blockKind, "privacy_scope");
  assert.match(request.blockedReason ?? "", /Vendor-facing shares cannot include private planning files/i);
  assert.ok(request.riskLabels.some((label) => /private budget ceilings/i.test(label)));
  assert.ok(request.riskLabels.some((label) => /unrelated guest details/i.test(label)));
  assert.ok(request.disclosureLines.some((line) => /Scope: shared vendor/i.test(line)));
});

test("buildWeddingApprovalRequestState blocks imported research in vendor-facing shares", () => {
  const importedResearch = artifact({
    id: "artifact:imported-notes",
    title: "Imported planning notes",
    kind: "research",
    metadata: {
      ...metadata,
      supertags: ["wedding_import", "wedding_import:text", "wedding_import_status:synthesized"],
    },
  });
  const request = buildWeddingApprovalRequestState({
    actionKind: "share_artifact",
    title: "Share import with vendor",
    metadata,
    artifacts: [importedResearch],
    recipients: ["vendor@example.com"],
    shareScope: "shared_vendor",
    userApproved: true,
  });

  assert.equal(request.canExecute, false);
  assert.equal(request.blockKind, "privacy_scope");
  assert.match(request.blockedReason ?? "", /imported file/i);
  assert.ok(request.riskLabels.some((label) => /Imported wedding files are private source evidence/i.test(label)));
});

test("buildWeddingApprovalRequestState redacts imported artifact titles in disclosure lines", () => {
  const importedGuestList = artifact({
    id: "wedding_import:guest_list:workspace:rsvp-csv",
    title: "Imported CSV: rsvp.csv",
    kind: "guest_list",
    metadata: {
      ...metadata,
      supertags: ["wedding_import", "wedding_import:csv", "wedding_import_status:synthesized"],
    },
    sourceLabels: ["CSV import: rsvp.csv", "original upload saved"],
  });
  const request = buildWeddingApprovalRequestState({
    actionKind: "share_artifact",
    title: "Review imported guest list",
    metadata,
    artifacts: [importedGuestList],
    shareScope: "private",
  });
  const serialized = JSON.stringify(request.disclosureLines);

  assert.ok(request.disclosureLines.some((line) => /Imported private planning file \(guest list\)/i.test(line)));
  assert.equal(serialized.includes("rsvp.csv"), false);
  assert.equal(serialized.includes("original upload saved"), false);
});

test("buildWeddingApprovalRequestState allows approved vendor shares for vendor-safe artifacts", () => {
  const vendorTable = artifact({
    id: "artifact:venues",
    title: "Venue comparison",
    kind: "vendor_table",
    vendorLabels: ["Harbour House"],
  });
  const request = buildWeddingApprovalRequestState({
    actionKind: "share_artifact",
    title: "Share shortlist with venue",
    metadata,
    artifacts: [vendorTable],
    recipients: ["events@harbour.example"],
    shareScope: "shared_vendor",
    userApproved: true,
  });

  assert.equal(request.canExecute, true);
  assert.equal(request.blockKind, null);
  assert.equal(request.blockedReason, null);
  assert.ok(request.disclosureLines.some((line) => /Vendor sharing may disclose comparison context/i.test(line)));
});

test("buildWeddingApprovalRequestState requires connected provider for external calendar creation", () => {
  const blocked = buildWeddingApprovalRequestState({
    actionKind: "create_external_calendar_event",
    title: "Create venue tour event",
    metadata,
    userApproved: true,
    scheduleItems: [{
      id: "venue-tour",
      title: "Venue tour",
      kind: "venue_tour",
      startAt: "2027-02-06T10:00:00+11:00",
    }],
  });
  const ready = buildWeddingApprovalRequestState({
    actionKind: "create_external_calendar_event",
    title: "Create venue tour event",
    metadata,
    userApproved: true,
    externalProvider: "google_calendar",
    scheduleItems: [{
      id: "venue-tour",
      title: "Venue tour",
      kind: "venue_tour",
      startAt: "2027-02-06T10:00:00+11:00",
    }],
  });

  assert.equal(blocked.canExecute, false);
  assert.equal(blocked.blockKind, "provider_missing");
  assert.match(blocked.blockedReason ?? "", /Connect a calendar provider/i);
  assert.equal(ready.canExecute, true);
  assert.equal(ready.blockKind, null);
  assert.equal(ready.blockedReason, null);
  assert.ok(ready.disclosureLines.some((line) => /Provider: google_calendar/i.test(line)));
});

test("buildWeddingIntegrationReadinessState explains provider and unsupported integration states", () => {
  const calendar = buildWeddingApprovalRequestState({
    actionKind: "create_external_calendar_event",
    title: "Create venue tour event",
    metadata,
    userApproved: true,
  });
  const email = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send venue email",
    metadata,
    recipients: ["events@harbour.example"],
  });
  const registry = buildWeddingApprovalRequestState({
    actionKind: "publish_registry",
    title: "Publish registry",
    metadata,
    userApproved: true,
  });
  const connectedCalendar = buildWeddingApprovalRequestState({
    actionKind: "create_external_calendar_event",
    title: "Create venue tour event",
    metadata,
    externalProvider: "google_calendar",
    userApproved: true,
  });

  assert.equal(buildWeddingIntegrationReadinessState(calendar).status, "needs_provider");
  assert.equal(buildWeddingIntegrationReadinessState(calendar).setupActionLabel, "Connect calendar");
  assert.equal(buildWeddingIntegrationReadinessState(email).capability, "email");
  assert.equal(buildWeddingIntegrationReadinessState(email).setupActionLabel, "Connect email");
  assert.equal(buildWeddingIntegrationReadinessState(registry).status, "needs_provider");
  assert.equal(buildWeddingIntegrationReadinessState(registry).setupActionLabel, "Connect registry");
  assert.equal(buildWeddingIntegrationReadinessState(connectedCalendar).providerLabel, "Google Calendar");
  assert.equal(buildWeddingIntegrationReadinessState(connectedCalendar).status, "ready");
});

test("buildWeddingApprovalRequestState stages registry publishing as approved local handoff", () => {
  const registry = artifact({
    id: "artifact:registry",
    title: "Registry draft",
    kind: "registry",
  });
  const request = buildWeddingApprovalRequestState({
    actionKind: "publish_registry",
    title: "Publish registry",
    metadata,
    artifacts: [registry],
    userApproved: true,
  });

  assert.equal(request.canExecute, true);
  assert.equal(request.blockKind, null);
  assert.equal(request.blockedReason, null);
  assert.ok(request.riskLabels.some((label) => /local draft first/i.test(label)));
});

test("buildWeddingApprovalReceiptState records executed and blocked receipts", () => {
  const readyRequest = buildWeddingApprovalRequestState({
    actionKind: "contact_vendor",
    title: "Contact venue",
    metadata,
    recipients: ["events@harbour.example"],
    userApproved: true,
  });
  const blockedRequest = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send venue email",
    metadata,
  });
  const readyReceipt = buildWeddingApprovalReceiptState(readyRequest, "2026-09-11T00:00:00.000Z");
  const blockedReceipt = buildWeddingApprovalReceiptState(blockedRequest, "2026-09-11T00:00:00.000Z");

  assert.equal(readyReceipt.status, "executed");
  assert.equal(readyReceipt.metadata.wedding_plan_id, "wedding_plan:harbour");
  assert.equal(readyReceipt.metadata.share_scope, "shared_vendor");
  assert.equal(blockedReceipt.status, "blocked");
  assert.equal(blockedReceipt.metadata.block_kind, "needs_user_approval");
  assert.match(String(blockedReceipt.metadata.blocked_reason), /Explicit user approval/i);
});

test("approveWeddingApprovalRequestState clears only the explicit approval block", () => {
  const emailRequest = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send venue email",
    metadata,
  });
  const calendarRequest = buildWeddingApprovalRequestState({
    actionKind: "create_external_calendar_event",
    title: "Create venue tour event",
    metadata,
  });
  const registryRequest = buildWeddingApprovalRequestState({
    actionKind: "publish_registry",
    title: "Publish registry",
    metadata,
    userApproved: false,
  });

  const approvedEmail = approveWeddingApprovalRequestState(emailRequest);
  const approvedCalendar = approveWeddingApprovalRequestState(calendarRequest);
  const approvedRegistry = approveWeddingApprovalRequestState(registryRequest);

  assert.equal(approvedEmail.userApproved, true);
  assert.equal(approvedEmail.canExecute, true);
  assert.equal(approvedEmail.blockKind, null);
  assert.equal(approvedEmail.blockedReason, null);
  assert.equal(approvedEmail.executeButtonLabel, "Send email");
  assert.equal(approvedCalendar.userApproved, true);
  assert.equal(approvedCalendar.canExecute, false);
  assert.equal(approvedCalendar.blockKind, "provider_missing");
  assert.match(approvedCalendar.blockedReason ?? "", /Connect a calendar provider/i);
  assert.equal(approvedRegistry.userApproved, true);
  assert.equal(approvedRegistry.canExecute, true);
  assert.equal(approvedRegistry.blockKind, null);
  assert.equal(approvedRegistry.blockedReason, null);
});

test("approveWeddingApprovalRequestState does not clear vendor privacy blocks", () => {
  const guestList = artifact({
    id: "artifact:guests",
    title: "Guest list",
    kind: "guest_list",
  });
  const request = buildWeddingApprovalRequestState({
    actionKind: "share_artifact",
    title: "Share guest list with caterer",
    metadata,
    artifacts: [guestList],
    shareScope: "shared_vendor",
  });
  const approved = approveWeddingApprovalRequestState(request);

  assert.equal(approved.userApproved, true);
  assert.equal(approved.canExecute, false);
  assert.equal(approved.blockKind, "privacy_scope");
  assert.match(approved.blockedReason ?? "", /Vendor-facing shares cannot include private planning files/i);
});
