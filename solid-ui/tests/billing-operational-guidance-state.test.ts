import test from "node:test";
import assert from "node:assert/strict";

import { readBillingOperationalGuidanceCard } from "../src/lib/billingOperationalGuidanceState.ts";

test("readBillingOperationalGuidanceCard returns null when no billing guidance is mounted", () => {
  assert.equal(readBillingOperationalGuidanceCard(null), null);
  assert.equal(readBillingOperationalGuidanceCard({}), null);
});

test("readBillingOperationalGuidanceCard formats no-go guidance for compact billing surfaces", () => {
  assert.deepEqual(
    readBillingOperationalGuidanceCard({
      operational_guidance: {
        status: "no_go",
        summary: "Execute bounded cleanup before trusting runtime pressure state.",
        command: "./scripts/oracle-prune-operational-history.ps1 -Apply",
        source: "artifacts/production-go-no-go-current/production-go-no-go.json",
        pressure_status: "operational_history_present",
        pressure_total_rows: 19_800,
        cleanup_mode: "dry_run",
        generated_at: "2026-08-28T08:55:00Z",
      },
    }),
    {
      title: "Operational cleanup required",
      detail:
        "Execute bounded cleanup before trusting runtime pressure state. operational history present (19,800 rows) Cleanup mode: dry run.",
      command: "./scripts/oracle-prune-operational-history.ps1 -Apply",
      source: "artifacts/production-go-no-go-current/production-go-no-go.json",
      generatedAt: "2026-08-28T08:55:00Z",
      tone: "warning",
    },
  );
});
