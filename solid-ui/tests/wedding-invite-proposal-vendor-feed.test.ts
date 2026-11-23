import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("vendor proposal feeds are capability-bound and available from claimed and operator views", () => {
  const api = read("../src/lib/vendorProposalOpportunityApi.ts");
  const vendor = read("../src/components/vendor/VendorProposalOpportunitiesPanel.tsx");
  const publicFlow = read("../src/components/vendor/PublicVendorProposalLeadFeed.tsx");
  const admin = read("../src/components/UsageAdminWeddingProposalOpportunitiesPanel.tsx");
  const entry = read("../src/vendor-claim-main.tsx");
  assert.match(api, /proposal-lead-link/);
  assert.match(vendor, /Create private lead link/);
  assert.match(publicFlow, /Offer a suitable date/);
  assert.match(publicFlow, /Ask OmnyID to notify the couple/);
  assert.match(admin, /Submitted proposal intents/);
  assert.match(admin, /Generate private link/);
  assert.match(entry, /proposal_feed/);
});

test("Wedding Database exposes ledger projections before user-created databases", () => {
  const database = read("../src/components/DatabaseView.tsx");
  const registry = read("../src/lib/databaseRegistryState.ts");
  assert.match(database, /projectWeddingPlanningDatabaseRecords/);
  assert.match(database, /same Wedding ledger/);
  assert.match(registry, /wedding_plan_projection\.v1/);
  assert.match(registry, /defaultTable: "budget"/);
});
