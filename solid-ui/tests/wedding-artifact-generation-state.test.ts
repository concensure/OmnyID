import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingArtifactGenerationState } from "../src/lib/weddingArtifactGenerationState.ts";
import { buildWeddingArtifactExportManifest } from "../src/lib/weddingExportState.ts";
import { buildWeddingResponseWorkspaceState } from "../src/lib/weddingResponseWorkspaceState.ts";

const metadata = {
  wedding_plan_id: "wedding_plan:harbour",
  response_workspace_id: "response_workspace:planning-pass",
  source_response_id: "afp:response-1",
};

test("buildWeddingArtifactGenerationState creates research notes with source and verification sections", () => {
  const state = buildWeddingArtifactGenerationState({
    metadata,
    title: "Harbour venue research",
    researchNotes: ["Harbour venues need wet-weather backup.", "Transport access should be checked."],
    assumptions: ["Spring 2027 timing"],
    verificationActions: ["Call venues for availability."],
    sourceLabels: ["Agent research"],
    locationLabels: ["Sydney"],
  });
  const research = state.artifacts.find((artifact) => artifact.summary.kind === "research");

  assert.equal(state.metadata.weddingPlanId, "wedding_plan:harbour");
  assert.equal(state.summaryLabel, "1 generated wedding artifact");
  assert.ok(research);
  assert.match(research.markdown, /## Research notes/);
  assert.match(research.markdown, /## Next verification actions/);
  assert.match(research.markdown, /Agent research/);
  assert.equal(research.summary.locationLabels[0], "Sydney");
});

test("buildWeddingArtifactGenerationState creates vendor comparison markdown and CSV without live claims", () => {
  const state = buildWeddingArtifactGenerationState({
    metadata,
    vendors: [{
      name: "Harbour House",
      category: "venue",
      location: "Sydney Harbour",
      priceEstimate: "$20k-$30k",
      capacity: "100",
      fitReason: "Water views",
      contact: "hello@example.com",
      source: "Public website",
    }],
  });
  const vendor = state.artifacts.find((artifact) => artifact.summary.kind === "vendor_table");

  assert.ok(vendor);
  assert.equal(vendor.summary.vendorLabels[0], "Harbour House");
  assert.equal(vendor.summary.locationLabels[0], "Sydney Harbour");
  assert.match(vendor.markdown, /Unknown price, capacity, and availability are labelled/);
  assert.match(vendor.markdown, /Unknown risks; verify before booking/);
  assert.match(vendor.csv ?? "", /"Harbour House"/);
  assert.ok(state.caveatLabels.some((label) => /live verification/i.test(label)));

  const manifest = buildWeddingArtifactExportManifest(vendor.summary);
  assert.deepEqual(manifest.entries.map((entry) => entry.id), ["csv", "html", "pdf"]);
});

test("buildWeddingArtifactGenerationState creates budget sheets with hidden-cost warnings", () => {
  const state = buildWeddingArtifactGenerationState({
    metadata,
    budgetRows: [{
      category: "Venue",
      estimate: "$25000",
      confirmedCost: "$24000",
      paidAmount: "$5000",
      dueAmount: "$19000",
      dueDate: "2027-01-15",
      vendor: "Harbour House",
    }],
  });
  const budget = state.artifacts.find((artifact) => artifact.summary.kind === "budget_sheet");

  assert.ok(budget);
  assert.match(budget.markdown, /hidden-cost warnings remain separate/i);
  assert.match(budget.csv ?? "", /"Check hidden costs before confirming"/);
  assert.ok(buildWeddingArtifactExportManifest(budget.summary).warningLabels.some((warning) => /Budget exports/i.test(warning)));
});

test("buildWeddingArtifactGenerationState creates approval-gated email drafts", () => {
  const state = buildWeddingArtifactGenerationState({
    metadata,
    emailDrafts: [{
      recipientLabel: "Harbour House events team",
      subject: "Wedding availability request",
      body: "Could you confirm availability for Spring 2027?",
      disclosureSummary: "Shares approximate season and venue interest only.",
      vendor: "Harbour House",
    }],
  });
  const email = state.artifacts.find((artifact) => artifact.summary.kind === "email_draft");

  assert.ok(email);
  assert.equal(email.summary.approvalState, "pending_user_approval");
  assert.match(email.markdown, /No email is sent without explicit approval|Shares approximate season/);
  assert.ok(state.caveatLabels.some((label) => /approval-gated/i.test(label)));
});

test("buildWeddingArtifactGenerationState creates local registry draft artifacts", () => {
  const state = buildWeddingArtifactGenerationState({
    metadata,
    registryRows: [{
      item: "Dinnerware set",
      category: "Kitchen",
      priority: "high",
      priceBand: "$100-$200",
      source: "Couple preference",
    }],
  });
  const registry = state.artifacts.find((artifact) => artifact.summary.kind === "registry");

  assert.ok(registry);
  assert.match(registry.markdown, /does not publish to an external registry/i);
  assert.match(registry.csv ?? "", /"Dinnerware set"/);
  assert.ok(state.caveatLabels.some((label) => /not published registries/i.test(label)));
});

test("generated artifact inputs feed the response workspace without extra adapters", () => {
  const generated = buildWeddingArtifactGenerationState({
    metadata,
    researchNotes: ["Venue options need source verification."],
    vendors: [{ name: "Harbour House", location: "Sydney", category: "venue" }],
  });
  const workspace = buildWeddingResponseWorkspaceState({
    metadata,
    artifacts: generated.artifactInputs,
    query: "harbour",
  });

  assert.equal(workspace.totalArtifacts, 2);
  assert.equal(workspace.results.length, 2);
  assert.ok(workspace.results.some((artifact) => artifact.kind === "vendor_table"));
});
