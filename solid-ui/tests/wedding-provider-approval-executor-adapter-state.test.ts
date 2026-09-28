import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingApprovalRequestState } from "@/lib/weddingApprovalState";
import { runWeddingApprovalExecution } from "@/lib/weddingApprovalExecutionState";
import {
  buildWeddingProviderApprovalExecutionHandlers,
  weddingProviderApprovalExecutorAvailability,
} from "@/lib/weddingProviderApprovalExecutorAdapterState";

const metadata = {
  wedding_plan_id: "wedding_plan:harbour",
  response_workspace_id: "response_workspace:planning-pass",
  source_response_id: "afp:response-1",
};

test("provider approval executor adapter dry-runs approved email without external delivery", async () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send photographer follow-up",
    metadata,
    recipients: ["studio@example.com"],
    userApproved: true,
  });

  const result = await runWeddingApprovalExecution({
    request,
    nowIso: "2026-09-14T00:00:00.000Z",
    handlers: buildWeddingProviderApprovalExecutionHandlers({
      mode: "dry_run",
      providerLabel: "Gmail smoke test",
    }),
  });

  assert.equal(result.status, "executed");
  assert.match(result.externalId ?? "", /^omnyid:wedding_provider_dry_run:/);
  assert.equal(result.receipt.metadata.provider_executor_mode, "dry_run");
  assert.equal(result.receipt.metadata.provider_smoke_test_only, true);
  assert.equal(result.receipt.metadata.external_delivery_performed, false);
  assert.equal(result.receipt.metadata.dry_run_recipient_count, 1);
});

test("provider approval executor adapter does not run dry-run handler before user approval", async () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "contact_vendor",
    title: "Contact venue",
    metadata,
    recipients: ["events@example.com"],
  });

  const result = await runWeddingApprovalExecution({
    request,
    handlers: buildWeddingProviderApprovalExecutionHandlers({ mode: "dry_run" }),
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.receipt.metadata.provider_executor_mode, undefined);
});

test("provider approval executor adapter executes live port and annotates receipt", async () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "create_external_calendar_event",
    title: "Create venue tour",
    metadata,
    externalProvider: "google_calendar",
    userApproved: true,
    scheduleItems: [{
      id: "schedule:venue-tour",
      title: "Venue tour",
      kind: "venue_tour",
      startAt: "2027-02-06T10:00:00+11:00",
    }],
  });

  const result = await runWeddingApprovalExecution({
    request,
    handlers: buildWeddingProviderApprovalExecutionHandlers({
      mode: "live",
      providerLabel: "Google Calendar",
      ports: {
        createCalendarEvent: () => ({
          ok: true,
          externalId: "gcal:event-123",
          message: "Calendar event created.",
          metadata: { provider_event_link: "https://calendar.example/event-123" },
        }),
      },
    }),
  });

  assert.equal(result.status, "executed");
  assert.equal(result.externalId, "gcal:event-123");
  assert.equal(result.receipt.metadata.provider_executor_mode, "live");
  assert.equal(result.receipt.metadata.provider_label, "Google Calendar");
  assert.equal(result.receipt.metadata.external_delivery_performed, true);
  assert.equal(result.receipt.metadata.provider_event_link, "https://calendar.example/event-123");
});

test("provider approval executor adapter fails live success without durable receipt", async () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send florist follow-up",
    metadata,
    recipients: ["florist@example.com"],
    userApproved: true,
  });

  const result = await runWeddingApprovalExecution({
    request,
    handlers: buildWeddingProviderApprovalExecutionHandlers({
      mode: "live",
      providerLabel: "Gmail",
      ports: {
        sendEmail: () => ({
          ok: true,
          message: "Email accepted.",
          metadata: {
            external_delivery_performed: true,
          },
        }),
      },
    }),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.receipt.status, "blocked");
  assert.equal(result.externalId, null);
  assert.equal(result.receipt.metadata.provider_executor_mode, "live");
  assert.equal(result.receipt.metadata.provider_result_ok, true);
  assert.equal(result.receipt.metadata.external_delivery_performed, false);
  assert.equal(result.receipt.metadata.missing_durable_provider_receipt, true);
});

test("provider approval executor adapter accepts live metadata receipt ids", async () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send stylist follow-up",
    metadata,
    recipients: ["stylist@example.com"],
    userApproved: true,
  });

  const result = await runWeddingApprovalExecution({
    request,
    handlers: buildWeddingProviderApprovalExecutionHandlers({
      mode: "live",
      providerLabel: "Gmail",
      ports: {
        sendEmail: () => ({
          ok: true,
          message: "Email sent.",
          metadata: { provider_message_id: "gmail:message-456" },
        }),
      },
    }),
  });

  assert.equal(result.status, "executed");
  assert.equal(result.externalId, "gmail:message-456");
  assert.equal(result.receipt.metadata.external_id, "gmail:message-456");
  assert.equal(result.receipt.metadata.provider_message_id, "gmail:message-456");
});

test("provider approval executor adapter fails safely when live port is missing", async () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "publish_registry",
    title: "Publish registry",
    metadata,
    userApproved: true,
  });

  const result = await runWeddingApprovalExecution({
    request,
    handlers: buildWeddingProviderApprovalExecutionHandlers({ mode: "live" }),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.canRetry, true);
  assert.equal(result.receipt.status, "blocked");
  assert.equal(result.receipt.metadata.provider_executor_mode, "live");
  assert.equal(result.receipt.metadata.provider_executor_status, "missing");
  assert.equal(result.receipt.metadata.provider_executor_connected, false);
  assert.equal(result.receipt.metadata.provider_capability, "publish_registry");
  assert.equal(result.receipt.metadata.external_delivery_performed, false);
  assert.equal(result.receipt.metadata.missing_provider_port, "publish_registry");
  assert.match(String(result.receipt.metadata.blocked_reason), /connected app is not ready/i);
});

test("weddingProviderApprovalExecutorAvailability exposes live port coverage", () => {
  const availability = weddingProviderApprovalExecutorAvailability({
    sendEmail: () => ({ ok: true }),
    createCalendarEvent: () => ({ ok: true }),
  });

  assert.equal(availability.send_email, true);
  assert.equal(availability.create_external_calendar_event, true);
  assert.equal(availability.contact_vendor, false);
  assert.equal(availability.publish_registry, false);
});
