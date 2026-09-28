import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import {
  buildWeddingVendorSmokeFixtureCleanupGateState,
  buildWeddingVendorSmokeFixtureState,
  isWeddingVendorSmokeFixtureArtifact,
  removeWeddingVendorSmokeFixtureArtifacts,
  saveWeddingVendorSmokeFixtureArtifacts,
  WEDDING_VENDOR_SMOKE_PLANNER_EMAIL,
  WEDDING_VENDOR_SMOKE_TEST_VENDOR_EMAIL,
} from "@/lib/weddingVendorSmokeFixtureState";
import {
  loadWeddingImportedArtifacts,
  saveWeddingImportedArtifacts,
} from "@/lib/weddingImportSynthesisState";
import { weddingMemoryStorage } from "./wedding-response-workspace-fixtures.ts";

const metadata = {
  wedding_plan_id: "wedding_plan:smoke",
  response_workspace_id: "response_workspace:smoke",
  source_response_id: "afp:smoke",
};

test("wedding vendor smoke fixture creates a quote reply flow for the disposable vendor", () => {
  const fixture = buildWeddingVendorSmokeFixtureState({ metadata });
  const workspace = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: fixture.generatedArtifacts.map((artifact) => artifact.input),
  });
  const flow = workspace.vendorQuoteReplyFlows[0];

  assert.equal(fixture.plannerEmail, WEDDING_VENDOR_SMOKE_PLANNER_EMAIL);
  assert.equal(fixture.vendorEmail, WEDDING_VENDOR_SMOKE_TEST_VENDOR_EMAIL);
  assert.ok(flow);
  assert.equal(flow.recipient, WEDDING_VENDOR_SMOKE_TEST_VENDOR_EMAIL);
  assert.match(flow.subject, /Smoke-test wedding quote reply/i);
  assert.match(flow.draftBody, /validate the OmnyID wedding vendor workflow/i);
  assert.match(flow.quote.vendorName, /Smoke Vendor/i);
  assert.match(flow.recommendationRationale, /Smoke-test ceremony florals/i);
});

test("wedding vendor smoke fixture artifacts are marked for cleanup", () => {
  const fixture = buildWeddingVendorSmokeFixtureState({ metadata });

  assert.equal(fixture.generatedArtifacts.length, 2);
  assert.ok(fixture.generatedArtifacts.every(isWeddingVendorSmokeFixtureArtifact));
  assert.ok(fixture.cleanupSearchLabels.includes(WEDDING_VENDOR_SMOKE_TEST_VENDOR_EMAIL));
});

test("wedding vendor smoke fixture can be saved and cleaned from workspace storage", () => {
  const storage = weddingMemoryStorage();
  const fixture = saveWeddingVendorSmokeFixtureArtifacts({
    responseWorkspaceId: "response_workspace:smoke",
    metadata,
    storage,
    userId: "concensure",
  });
  const loaded = loadWeddingImportedArtifacts("response_workspace:smoke", storage, "concensure");
  const workspace = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: loaded.map((artifact) => artifact.input),
  });

  assert.equal(loaded.length, 2);
  assert.ok(loaded.every(isWeddingVendorSmokeFixtureArtifact));
  assert.equal(workspace.vendorQuoteReplyFlows[0]?.recipient, WEDDING_VENDOR_SMOKE_TEST_VENDOR_EMAIL);

  const cleanup = removeWeddingVendorSmokeFixtureArtifacts({
    responseWorkspaceId: fixture.metadata.responseWorkspaceId,
    storage,
    userId: "concensure",
  });
  const afterCleanup = loadWeddingImportedArtifacts("response_workspace:smoke", storage, "concensure");

  assert.equal(cleanup.removedCount, 2);
  assert.equal(cleanup.remainingCount, 0);
  assert.equal(cleanup.cleanupComplete, true);
  assert.equal(afterCleanup.length, 0);
});

test("wedding vendor smoke cleanup preserves non-smoke artifacts", () => {
  const storage = weddingMemoryStorage();
  const fixture = buildWeddingVendorSmokeFixtureState({ metadata });
  const normalArtifact = {
    ...fixture.generatedArtifacts[0]!,
    input: {
      ...fixture.generatedArtifacts[0]!.input,
      id: "wedding_artifact:vendor_table:real-vendor",
      title: "Real florist notes",
      metadata: {
        ...(fixture.generatedArtifacts[0]!.input.metadata as Record<string, unknown>),
        source: "vendor_search_executor",
        disposableSmokeVendor: false,
        smokeVendorEmail: "",
      },
      searchLabels: ["real florist"],
      vendorLabels: ["Real Florist"],
      bodyText: "# Real florist notes\n\nVendor: Real Florist\nQuote amount: AUD $1,200",
    },
    markdown: "# Real florist notes\n\nVendor: Real Florist\nQuote amount: AUD $1,200",
  };

  saveWeddingImportedArtifacts("response_workspace:smoke", [...fixture.generatedArtifacts, normalArtifact], storage, "concensure");
  const cleanup = removeWeddingVendorSmokeFixtureArtifacts({
    responseWorkspaceId: "response_workspace:smoke",
    storage,
    userId: "concensure",
  });
  const afterCleanup = loadWeddingImportedArtifacts("response_workspace:smoke", storage, "concensure");

  assert.equal(cleanup.removedCount, 2);
  assert.equal(cleanup.remainingCount, 1);
  assert.equal(afterCleanup[0]?.summary.title, "Real florist notes");
  assert.equal(isWeddingVendorSmokeFixtureArtifact(afterCleanup[0]!), false);
});

test("wedding vendor smoke cleanup gate blocks real search while disposable artifacts remain", () => {
  const fixture = buildWeddingVendorSmokeFixtureState({ metadata });
  const blocked = buildWeddingVendorSmokeFixtureCleanupGateState({
    artifacts: fixture.generatedArtifacts,
  });
  const clear = buildWeddingVendorSmokeFixtureCleanupGateState({
    artifacts: [],
  });

  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.disposableArtifactCount, 2);
  assert.match(blocked.blockerLabel ?? "", /Remove 2 disposable smoke fixture artifacts/i);
  assert.equal(clear.status, "clear");
  assert.equal(clear.blockerLabel, null);
});
