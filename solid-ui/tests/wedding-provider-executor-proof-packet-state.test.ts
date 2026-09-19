import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingProviderExecutorProofPacketState } from "@/lib/weddingProviderExecutorProofPacketState";
import { buildWeddingProviderExecutorSuiteReadinessState } from "@/lib/weddingProviderExecutorSuiteReadinessState";

test("provider executor proof packet summarizes blocked capabilities for Oracle operators", () => {
  const suite = buildWeddingProviderExecutorSuiteReadinessState({ providers: [] });
  const packet = buildWeddingProviderExecutorProofPacketState(suite);
  const vendorSearch = packet.capabilityPackets.find((item) => item.capability === "vendor_search");

  assert.equal(packet.status, "blocked");
  assert.equal(packet.canClearOracleProviderGate, false);
  assert.match(packet.summary, /fresh credentials, callable handlers, smoke receipts/i);
  assert.ok(packet.missingProofRefs.some((label) => /Gmail or email provider/i.test(label)));
  assert.ok(vendorSearch?.envHints.includes("OMNYID_GOOGLE_PLACES_API_KEY_FILE"));
  assert.ok(vendorSearch?.proofHints.includes("source URL count"));
  assert.ok(vendorSearch?.nextRequiredStepKinds.includes("connect_credentials"));
  assert.ok(vendorSearch?.nextRequiredStepKinds.includes("build_executor"));
  assert.ok(vendorSearch?.setupSurfaces.includes("connected_apps"));
  assert.ok(packet.operatorChecklist.some((item) => /Master Agent queries/i.test(item)));
});

test("provider executor proof packet does not clear gate when ready booleans lack proof refs", () => {
  const suite = buildWeddingProviderExecutorSuiteReadinessState({
    proofReferencePolicy: "required",
    requiredCapabilities: ["email"],
    providers: [
      {
        capability: "email",
        requiredProvider: "Gmail or email provider",
        credentialStatus: "connected",
        executorStatus: "available",
        productionReady: true,
      } as any,
    ],
  });
  const packet = buildWeddingProviderExecutorProofPacketState(suite);

  assert.equal(packet.status, "blocked");
  assert.equal(packet.canClearOracleProviderGate, false);
  assert.ok(packet.missingProofRefs.includes("Gmail or email provider: proof receipt required"));
});

test("provider executor proof packet does not clear gate with local receipt ids or links", () => {
  const suite = buildWeddingProviderExecutorSuiteReadinessState({
    proofReferencePolicy: "required",
    requiredCapabilities: ["email", "calendar"],
    executorProofRefs: {
      email: "receipt:local-email-1",
      calendar: "https://calendar.example/event-1",
    },
    providers: [
      {
        capability: "email",
        requiredProvider: "Gmail or email provider",
        credentialStatus: "connected",
        executorStatus: "available",
        productionReady: true,
      } as any,
      {
        capability: "calendar",
        requiredProvider: "Google Calendar or calendar provider",
        credentialStatus: "connected",
        executorStatus: "available",
        productionReady: true,
      } as any,
    ],
  });
  const packet = buildWeddingProviderExecutorProofPacketState(suite);

  assert.equal(packet.status, "blocked");
  assert.equal(packet.canClearOracleProviderGate, false);
  assert.equal(packet.capabilityPackets[0]?.proofRef, null);
  assert.equal(packet.capabilityPackets[1]?.proofRef, null);
  assert.ok(packet.missingProofRefs.includes("Gmail or email provider: proof receipt required"));
  assert.ok(packet.missingProofRefs.includes("Google Calendar or calendar provider: proof receipt required"));
  assert.ok(packet.capabilityPackets.some((capability) =>
    capability.blockers.some((label) => /local receipt ID or display link/i.test(label)),
  ));
});

test("provider executor proof packet clears gate only with ready suite proof references", () => {
  const suite = buildWeddingProviderExecutorSuiteReadinessState({
    proofReferencePolicy: "required",
    requiredCapabilities: ["vendor_search"],
    executorProofRefs: { vendor_search: "vendor-search-smoke:oracle-prod-1:2026-09-15" },
    providers: [
      {
        capability: "vendor_search",
        requiredProvider: "Brave Search, Google Places, or OSM/Overpass provider",
        credentialStatus: "connected",
        executorStatus: "available",
        productionReady: true,
      } as any,
    ],
  });
  const packet = buildWeddingProviderExecutorProofPacketState(suite);

  assert.equal(packet.status, "ready");
  assert.equal(packet.canClearOracleProviderGate, true);
  assert.deepEqual(packet.missingProofRefs, []);
  assert.equal(packet.capabilityPackets[0]?.proofRef, "vendor-search-smoke:oracle-prod-1:2026-09-15");
});
