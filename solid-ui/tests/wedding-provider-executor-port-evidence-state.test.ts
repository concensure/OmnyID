import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingProviderExecutorEvidenceFromPorts } from "@/lib/weddingProviderExecutorPortEvidenceState";
import { buildWeddingProviderExecutorSuiteReadinessState } from "@/lib/weddingProviderExecutorSuiteReadinessState";

test("buildWeddingProviderExecutorEvidenceFromPorts derives provider readiness from live ports and credentials", () => {
  const providers = buildWeddingProviderExecutorEvidenceFromPorts({
    ports: {
      sendEmail: () => ({ ok: true }),
      contactVendor: () => ({ ok: true }),
      createCalendarEvent: () => ({ ok: true }),
      publishRegistry: () => ({ ok: true }),
    },
    gmailStatus: {
      connected: true,
      configured: true,
      gmail_email: "planner@example.com",
    },
    calendarConnected: true,
    registryConnected: true,
    vendorSearchConnected: true,
    vendorSearchExecutorAvailable: true,
  });

  assert.deepEqual(providers.map((provider) => provider.capability), ["email", "calendar", "registry", "vendor_search"]);
  assert.ok(providers.every((provider) => provider.productionReady));

  const suite = buildWeddingProviderExecutorSuiteReadinessState({ providers });
  assert.equal(suite.productionEvidenceReady, true);
});

test("buildWeddingProviderExecutorEvidenceFromPorts does not let ports mask missing credentials", () => {
  const providers = buildWeddingProviderExecutorEvidenceFromPorts({
    ports: {
      sendEmail: () => ({ ok: true }),
      createCalendarEvent: () => ({ ok: true }),
      publishRegistry: () => ({ ok: true }),
    },
    calendarConnected: true,
    registryConnected: true,
    vendorSearchConnected: true,
    vendorSearchExecutorAvailable: true,
  });
  const email = providers.find((provider) => provider.capability === "email");
  const suite = buildWeddingProviderExecutorSuiteReadinessState({ providers });

  assert.equal(email?.credentialStatus, "missing");
  assert.equal(email?.executorStatus, "available");
  assert.equal(email?.productionReady, false);
  assert.equal(suite.productionEvidenceReady, false);
  assert.ok(suite.blockerLabels.includes("Gmail or email provider credentials are missing."));
});

test("buildWeddingProviderExecutorEvidenceFromPorts does not let credentials mask missing executors", () => {
  const providers = buildWeddingProviderExecutorEvidenceFromPorts({
    gmailStatus: {
      connected: true,
      configured: true,
      gmail_email: "planner@example.com",
    },
    calendarConnected: true,
    registryConnected: true,
    vendorSearchConnected: true,
    vendorSearchExecutorAvailable: false,
  });
  const email = providers.find((provider) => provider.capability === "email");
  const calendar = providers.find((provider) => provider.capability === "calendar");
  const vendorSearch = providers.find((provider) => provider.capability === "vendor_search");

  assert.equal(email?.credentialStatus, "connected");
  assert.equal(email?.executorStatus, "missing");
  assert.equal(email?.productionReady, false);
  assert.equal(calendar?.executorStatus, "missing");
  assert.equal(vendorSearch?.executorStatus, "missing");
});

test("buildWeddingProviderExecutorEvidenceFromPorts accepts explicit executor availability without ports", () => {
  const providers = buildWeddingProviderExecutorEvidenceFromPorts({
    availableExecutors: {
      contact_vendor: true,
      create_external_calendar_event: true,
      publish_registry: true,
    },
    gmailStatus: {
      connected: true,
      configured: true,
      gmail_email: "planner@example.com",
    },
    calendarConnected: true,
    registryConnected: true,
    vendorSearchConnected: true,
    vendorSearchExecutorAvailable: true,
  });

  assert.equal(providers.find((provider) => provider.capability === "email")?.productionReady, true);
  assert.equal(providers.find((provider) => provider.capability === "calendar")?.productionReady, true);
  assert.equal(providers.find((provider) => provider.capability === "registry")?.productionReady, true);
});
