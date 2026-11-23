import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingApprovalRequestState } from "@/lib/weddingApprovalState";
import {
  buildWeddingProviderExecutorReadinessState,
  buildWeddingVendorSearchProviderReadinessFromConnectedApps,
  connectedAppsHaveWeddingVendorSearchProvider,
} from "@/lib/weddingProviderExecutorReadinessState";

const metadata = {
  wedding_plan_id: "wedding_plan:harbour",
  response_workspace_id: "response_workspace:planning-pass",
  source_response_id: "afp:response-1",
};

test("provider executor readiness separates email credentials from executor availability", () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send venue email",
    metadata,
    recipients: ["events@harbour.example"],
    userApproved: true,
  });

  const connectedNoExecutor = buildWeddingProviderExecutorReadinessState({
    request,
    gmailStatus: {
      connected: true,
      configured: true,
      gmail_email: "planner@example.com",
      connected_at: "2026-09-13T00:00:00.000Z",
    },
  });

  assert.equal(connectedNoExecutor.capability, "email");
  assert.equal(connectedNoExecutor.credentialStatus, "connected");
  assert.equal(connectedNoExecutor.executorStatus, "missing");
  assert.equal(connectedNoExecutor.productionReady, false);

  const productionReady = buildWeddingProviderExecutorReadinessState({
    request,
    gmailStatus: {
      connected: true,
      configured: true,
      gmail_email: "planner@example.com",
    },
    availableExecutors: { send_email: true },
  });

  assert.equal(productionReady.productionReady, true);
  assert.equal(productionReady.executorStatus, "available");
});

test("provider executor readiness keeps calendar blocked until both credential and executor exist", () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "create_external_calendar_event",
    title: "Create venue tour",
    metadata,
    externalProvider: "google_calendar",
    userApproved: true,
  });

  const missingCredential = buildWeddingProviderExecutorReadinessState({
    request,
    availableExecutors: { create_external_calendar_event: true },
  });
  const ready = buildWeddingProviderExecutorReadinessState({
    request,
    calendarConnected: true,
    availableExecutors: { create_external_calendar_event: true },
  });

  assert.equal(missingCredential.credentialStatus, "missing");
  assert.equal(missingCredential.productionReady, false);
  assert.equal(ready.credentialStatus, "connected");
  assert.equal(ready.executorStatus, "available");
  assert.equal(ready.productionReady, true);
});

test("provider executor readiness treats OmnyID-only sharing as not requiring external executors", () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "share_artifact",
    title: "Share safe overview",
    metadata,
    userApproved: true,
  });

  const state = buildWeddingProviderExecutorReadinessState({ request });

  assert.equal(state.capability, "sharing");
  assert.equal(state.credentialStatus, "not_required");
  assert.equal(state.executorStatus, "not_required");
  assert.equal(state.productionReady, true);
});

test("vendor-search readiness derives credentials from supported connected search providers", () => {
  const disconnected = buildWeddingVendorSearchProviderReadinessFromConnectedApps({
    connectedAppIds: ["gcal"],
    executorAvailable: true,
  });
  const connectedWithoutExecutor = buildWeddingVendorSearchProviderReadinessFromConnectedApps({
    connectedAppIds: ["GOOGLE-PLACES-API"],
    executorAvailable: false,
  });
  const ready = buildWeddingVendorSearchProviderReadinessFromConnectedApps({
    connectedAppIds: ["overpass-api"],
    executorAvailable: true,
  });

  assert.equal(connectedAppsHaveWeddingVendorSearchProvider([" brave-search-api "]), true);
  assert.equal(connectedAppsHaveWeddingVendorSearchProvider([" google-places-api "]), true);
  assert.equal(connectedAppsHaveWeddingVendorSearchProvider([" overpass-api "]), true);
  assert.equal(disconnected.credentialStatus, "missing");
  assert.equal(disconnected.executorStatus, "available");
  assert.equal(disconnected.productionReady, false);
  assert.equal(connectedWithoutExecutor.credentialStatus, "connected");
  assert.equal(connectedWithoutExecutor.executorStatus, "missing");
  assert.equal(connectedWithoutExecutor.productionReady, false);
  assert.equal(ready.productionReady, true);
});
