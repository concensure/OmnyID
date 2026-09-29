import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingProviderExecutorProofPacketState } from "@/lib/weddingProviderExecutorProofPacketState";
import { buildWeddingProviderExecutorSuiteReadinessState } from "@/lib/weddingProviderExecutorSuiteReadinessState";
import { WEDDING_PRODUCTION_LABEL_MAX_LENGTH } from "@/lib/weddingProductionLabelState";

test("connected app proof packet summarizes blocked capabilities for Oracle operators", () => {
  const suite = buildWeddingProviderExecutorSuiteReadinessState({ providers: [] });
  const packet = buildWeddingProviderExecutorProofPacketState(suite);
  const vendorSearch = packet.capabilityPackets.find((item) => item.capability === "vendor_search");

  assert.equal(packet.status, "blocked");
  assert.equal(packet.canClearOracleProviderGate, false);
  assert.match(packet.summary, /fresh sign-in, callable actions, smoke receipts/i);
  assert.ok(packet.missingProofRefs.some((label) => /Gmail or email provider/i.test(label)));
  assert.ok(vendorSearch?.envHints.includes("OMNYID_GOOGLE_PLACES_API_KEY_FILE"));
  assert.ok(vendorSearch?.proofHints.includes("source URL count"));
  assert.ok(vendorSearch?.nextRequiredStepKinds.includes("connect_credentials"));
  assert.ok(vendorSearch?.nextRequiredStepKinds.includes("build_executor"));
  assert.ok(vendorSearch?.setupSurfaces.includes("connected_apps"));
  assert.ok(packet.operatorChecklist.some((item) => /Master Agent queries/i.test(item)));
});

test("connected app proof packet does not clear gate when ready booleans lack proof refs", () => {
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

test("connected app proof packet does not clear gate with local receipt ids or links", () => {
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
    capability.blockers.some((label) => /local, dry-run, placeholder, receipt, or display/i.test(label)),
  ));
});

test("connected app proof packet independently rejects forged weak proof refs", () => {
  const packet = buildWeddingProviderExecutorProofPacketState({
    status: "ready",
    productionEvidenceReady: true,
    checks: [
      {
        capability: "email",
        requiredProvider: "Gmail or email provider",
        status: "ready",
        blockerLabels: [],
        proofRef: "https://audit.omnyid.example/gmail-message-1",
      },
      {
        capability: "calendar",
        requiredProvider: "Google Calendar or calendar provider",
        status: "ready",
        blockerLabels: [],
        proofRef: "data:application/json,{}",
      },
      {
        capability: "registry",
        requiredProvider: "Registry provider",
        status: "ready",
        blockerLabels: [],
        proofRef: "provider-registry:publish-1",
      },
      {
        capability: "vendor_search",
        requiredProvider: "Brave Search, EXA Search, Google Places, or OSM/Overpass provider",
        status: "ready",
        blockerLabels: [],
        proofRef: "vendor-search:test:latest",
      },
    ],
    missingCapabilityLabels: [],
    blockerLabels: [],
    proofReferenceLabels: [],
    nextActionLabels: [],
    summary: "Forged ready provider suite.",
  });

  assert.equal(packet.status, "blocked");
  assert.equal(packet.canClearOracleProviderGate, false);
  assert.equal(packet.capabilityPackets.find((capability) => capability.capability === "email")?.proofRef, null);
  assert.equal(packet.capabilityPackets.find((capability) => capability.capability === "calendar")?.proofRef, null);
  assert.equal(packet.capabilityPackets.find((capability) => capability.capability === "registry")?.proofRef, "provider-registry:publish-1");
  assert.equal(packet.capabilityPackets.find((capability) => capability.capability === "vendor_search")?.proofRef, null);
  assert.ok(packet.missingProofRefs.includes("Gmail or email provider: proof receipt required"));
  assert.ok(packet.missingProofRefs.includes("Google Calendar or calendar provider: proof receipt required"));
  assert.ok(packet.missingProofRefs.includes("Brave Search, EXA Search, Google Places, or OSM/Overpass provider: proof receipt required"));
  assert.ok(packet.capabilityPackets.some((capability) =>
    capability.blockers.some((label) => /browser-only, or HTTP link/i.test(label)),
  ));
});

test("connected app proof packet allows smoke proof refs", () => {
  const packet = buildWeddingProviderExecutorProofPacketState({
    status: "ready",
    productionEvidenceReady: true,
    checks: [
      {
        capability: "email",
        requiredProvider: "Gmail or email provider",
        status: "ready",
        blockerLabels: [],
        proofRef: "gmail:prod-smoke:2026-09-28",
      },
    ],
    missingCapabilityLabels: [],
    blockerLabels: [],
    proofReferenceLabels: [],
    nextActionLabels: [],
    summary: "Ready provider suite.",
  });

  assert.equal(packet.status, "ready");
  assert.equal(packet.capabilityPackets[0]?.proofRef, "gmail:prod-smoke:2026-09-28");
});

test("connected app proof packet independently rejects duplicate durable proof refs", () => {
  const packet = buildWeddingProviderExecutorProofPacketState({
    status: "ready",
    productionEvidenceReady: true,
    checks: [
      {
        capability: "email",
        requiredProvider: "Gmail or email provider",
        status: "ready",
        blockerLabels: [],
        proofRef: "provider-smoke:shared-proof-1",
      },
      {
        capability: "calendar",
        requiredProvider: "Google Calendar or calendar provider",
        status: "ready",
        blockerLabels: [],
        proofRef: "provider-smoke:shared-proof-1",
      },
    ],
    missingCapabilityLabels: [],
    blockerLabels: [],
    proofReferenceLabels: [],
    nextActionLabels: [],
    summary: "Forged ready provider suite.",
  });

  assert.equal(packet.status, "blocked");
  assert.equal(packet.canClearOracleProviderGate, false);
  assert.ok(packet.missingProofRefs.includes("Gmail or email provider: proof receipt required"));
  assert.ok(packet.missingProofRefs.includes("Google Calendar or calendar provider: proof receipt required"));
  assert.equal(
    packet.capabilityPackets.filter((capability) =>
      capability.blockers.some((label) => /unique durable connected app proof reference/i.test(label)),
    ).length,
    2,
  );
});

test("connected app proof packet clears gate only with ready suite proof references", () => {
  const suite = buildWeddingProviderExecutorSuiteReadinessState({
    proofReferencePolicy: "required",
    requiredCapabilities: ["vendor_search"],
    executorProofRefs: { vendor_search: "vendor-search-smoke:oracle-prod-1:2026-09-15" },
    providers: [
      {
        capability: "vendor_search",
        requiredProvider: "Brave Search, EXA Search, Google Places, or OSM/Overpass provider",
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

test("connected app proof packet bounds noisy upstream labels", () => {
  const longLabel = `  Reconnect Gmail credentials ${"again ".repeat(80)}  `;
  const packet = buildWeddingProviderExecutorProofPacketState({
    status: "blocked",
    productionEvidenceReady: false,
    checks: [{
      capability: "email",
      requiredProvider: "Gmail or email provider",
      status: "blocked",
      blockerLabels: [longLabel, longLabel],
      proofRef: `gmail:message-${"x".repeat(400)}`,
    }],
    missingCapabilityLabels: [],
    blockerLabels: [longLabel],
    proofReferenceLabels: [],
    nextActionLabels: [longLabel, longLabel],
    summary: "External connected app suite is not production-ready.",
  });

  assert.equal(packet.capabilityPackets[0]?.blockers.length, 1);
  assert.ok(packet.capabilityPackets[0]?.blockers.every((label) => label.length <= WEDDING_PRODUCTION_LABEL_MAX_LENGTH));
  assert.ok(packet.nextActionLabels.every((label) => label.length <= WEDDING_PRODUCTION_LABEL_MAX_LENGTH));
  assert.ok((packet.capabilityPackets[0]?.proofRef?.length ?? 0) <= WEDDING_PRODUCTION_LABEL_MAX_LENGTH);
});
