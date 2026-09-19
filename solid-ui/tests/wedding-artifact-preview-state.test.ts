import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingArtifactPreviewState } from "@/lib/weddingArtifactPreviewState";

test("buildWeddingArtifactPreviewState extracts markdown tables for vendor artifacts", () => {
  const preview = buildWeddingArtifactPreviewState({
    artifactKind: "vendor_table",
    bodyText: [
      "# Vendor comparison",
      "",
      "| Name | Location | Risk |",
      "| --- | --- | --- |",
      "| Harbour Hall | Sydney | Verify availability |",
      "| Garden Hall | Inner West | Check inclusions |",
    ].join("\n"),
  });

  assert.equal(preview?.kind, "table");
  if (preview?.kind !== "table") return;
  assert.deepEqual(preview.headers, ["Name", "Location", "Risk"]);
  assert.equal(preview.rows.length, 2);
  assert.equal(preview.rows[0]?.[0], "Harbour Hall");
  assert.equal(preview.rowCountLabel, "2 rows");
});

test("buildWeddingArtifactPreviewState summarizes budget sheet risk evidence", () => {
  const preview = buildWeddingArtifactPreviewState({
    artifactKind: "budget_sheet",
    bodyText: [
      "# Budget",
      "",
      "| Category | Estimate | Confirmed cost | Paid | Due | Warning |",
      "| --- | --- | --- | --- | --- | --- |",
      "| Venue | TBC | Unknown | No | $5000 | Check minimum spend |",
      "| Celebrant | $900 | $900 | Paid | $0 | None |",
      "| Catering | Quote pending | Unknown | No | TBC | Service fee not confirmed |",
    ].join("\n"),
  });

  assert.equal(preview?.kind, "table");
  if (preview?.kind !== "table") return;
  assert.equal(preview.budgetSummary?.unknownCostCount, 2);
  assert.equal(preview.budgetSummary?.dueAmountCount, 1);
  assert.equal(preview.budgetSummary?.unpaidCount, 2);
  assert.equal(preview.budgetSummary?.warningCount, 2);
  assert.match(preview.budgetSummary?.summaryLabel ?? "", /2 unknown costs/);
  assert.deepEqual(preview.budgetSummary?.warningLabels, [
    "Check minimum spend",
    "Service fee not confirmed",
  ]);
});

test("buildWeddingArtifactPreviewState does not invent budget risks for clear rows", () => {
  const preview = buildWeddingArtifactPreviewState({
    artifactKind: "budget_sheet",
    bodyText: [
      "# Budget",
      "",
      "| Category | Estimate | Confirmed cost | Paid | Due | Warning |",
      "| --- | --- | --- | --- | --- | --- |",
      "| Venue | $10000 | $10000 | Paid | $0 | None |",
    ].join("\n"),
  });

  assert.equal(preview?.kind, "table");
  if (preview?.kind !== "table") return;
  assert.equal(preview.budgetSummary?.unknownCostCount, 0);
  assert.equal(preview.budgetSummary?.dueAmountCount, 0);
  assert.equal(preview.budgetSummary?.unpaidCount, 0);
  assert.equal(preview.budgetSummary?.warningCount, 0);
  assert.match(preview.budgetSummary?.summaryLabel ?? "", /No budget risk markers/i);
});

test("buildWeddingArtifactPreviewState extracts approval-gated email details", () => {
  const preview = buildWeddingArtifactPreviewState({
    artifactKind: "email_draft",
    bodyText: [
      "# Email draft - Harbour Hall",
      "",
      "Recipient: Harbour Hall events team",
      "Subject: Availability request",
      "",
      "## Disclosure summary",
      "",
      "Includes date and guest count.",
      "",
      "## Draft",
      "",
      "Can you confirm package inclusions?",
    ].join("\n"),
  });

  assert.equal(preview?.kind, "email");
  if (preview?.kind !== "email") return;
  assert.equal(preview.recipient, "Harbour Hall events team");
  assert.equal(preview.subject, "Availability request");
  assert.match(preview.disclosureSummary, /guest count/);
  assert.match(preview.body, /package inclusions/);
});

test("buildWeddingArtifactPreviewState falls back to document highlights", () => {
  const preview = buildWeddingArtifactPreviewState({
    artifactKind: "research",
    bodyText: "# Research\n\nGenerated as a planning artifact.\n\n- Verify vendors",
  });

  assert.equal(preview?.kind, "document");
  if (preview?.kind !== "document") return;
  assert.deepEqual(preview.summaryLines.slice(0, 3), [
    "Research",
    "Generated as a planning artifact.",
    "Verify vendors",
  ]);
});

test("buildWeddingArtifactPreviewState creates legal setup previews from clear sections", () => {
  const preview = buildWeddingArtifactPreviewState({
    artifactKind: "legal",
    bodyText: [
      "# Australian legal setup",
      "",
      "## Current status",
      "",
      "- NOIM form status: user says the form has not been downloaded yet.",
      "- Celebrant path: compare public/registry-style authorised celebrant options.",
      "- Jurisdiction focus: NSW.",
      "",
      "## How",
      "",
      "- Use the official NOIM resource.",
      "",
      "## When",
      "",
      "- Create a calendar reminder when the wedding date is known.",
      "",
      "## Where",
      "",
      "- Compare authorised celebrants or registry/public ceremony options.",
      "",
      "## Cost questions",
      "",
      "- Confirm certificate-related fees.",
    ].join("\n"),
  });

  assert.equal(preview?.kind, "legal");
  if (preview?.kind !== "legal") return;
  assert.ok(preview.statusLines.some((line) => /NOIM form status/i.test(line)));
  assert.ok(preview.guidanceCards.some((card) => card.title === "Cost questions" && /certificate/i.test(card.body)));
  assert.match(preview.caveatLabel, /no forms are submitted/i);
});

test("buildWeddingArtifactPreviewState creates timeline previews from tables", () => {
  const preview = buildWeddingArtifactPreviewState({
    artifactKind: "timeline",
    bodyText: [
      "# Timeline",
      "",
      "| Milestone | Detail | Owner |",
      "| --- | --- | --- |",
      "| Venue tour | Confirm accessibility | Couple |",
      "| NOIM check | Ask celebrant | Couple |",
    ].join("\n"),
  });

  assert.equal(preview?.kind, "timeline");
  if (preview?.kind !== "timeline") return;
  assert.equal(preview.items.length, 2);
  assert.equal(preview.items[0]?.label, "Venue tour");
  assert.equal(preview.items[0]?.stageLabel, "Core planning");
  assert.ok(preview.stageGroups.some((group) => group.label === "Core planning" && group.items.length === 2));
  assert.match(preview.readinessLabel, /2 timeline items/);
});

test("buildWeddingArtifactPreviewState groups timeline previews by timing stage", () => {
  const preview = buildWeddingArtifactPreviewState({
    artifactKind: "timeline",
    bodyText: [
      "# Run sheet",
      "",
      "## Timeline",
      "",
      "- Anytime moodboard: Can be refined when ready",
      "- RSVP numbers: Final month estimate",
      "- Morning of kit: Final check",
    ].join("\n"),
  });

  assert.equal(preview?.kind, "timeline");
  if (preview?.kind !== "timeline") return;
  assert.deepEqual(
    preview.stageGroups.map((group) => group.label),
    ["Anytime", "Final month", "Final checks"],
  );
  assert.equal(preview.stageGroups[0]?.timingLabel, "No fixed deadline");
});

test("buildWeddingArtifactPreviewState surfaces day-of execution playbooks in timeline previews", () => {
  const preview = buildWeddingArtifactPreviewState({
    artifactKind: "timeline",
    bodyText: [
      "# Final run sheet",
      "",
      "## Timeline",
      "",
      "- Ceremony: Noon",
      "",
      "## Day-of execution incident playbooks",
      "",
      "### Vendor delay",
      "Trigger: Caterer is running 30 minutes late.",
      "Affected parties: venue, photographer, guests.",
      "Provider requirement: Needs live vendor intake.",
      "",
      "### Payment verification",
      "Trigger: Final payment needs confirmation.",
      "Affected parties: couple, vendor, budget tracker.",
      "Provider requirement: Needs receipt evidence.",
    ].join("\n"),
  });

  assert.equal(preview?.kind, "timeline");
  if (preview?.kind !== "timeline") return;
  const dayOfGroup = preview.stageGroups.find((group) => group.label === "Day-of execution");
  assert.ok(dayOfGroup);
  assert.equal(dayOfGroup?.timingLabel, "Wedding-day live coordination");
  assert.ok(dayOfGroup?.items.some((item) => /Vendor delay/i.test(item.label)));
  assert.ok(dayOfGroup?.items.some((item) => /receipt evidence/i.test(item.detail)));
});

test("buildWeddingArtifactPreviewState creates map previews from location sections", () => {
  const preview = buildWeddingArtifactPreviewState({
    artifactKind: "map_collection",
    bodyText: [
      "# Map collection",
      "",
      "## Locations",
      "",
      "- Ceremony: Sydney registry office candidate",
      "- Photos: Harbour foreshore",
    ].join("\n"),
  });

  assert.equal(preview?.kind, "map");
  if (preview?.kind !== "map") return;
  assert.deepEqual(preview.locations.map((location) => location.label), ["Ceremony", "Photos"]);
  assert.match(preview.locations[0]?.searchQuery ?? "", /Ceremony Sydney registry office/i);
  assert.match(preview.locations[0]?.mapUrl ?? "", /^https:\/\/www\.google\.com\/maps\/search/);
  assert.match(preview.mapReadinessLabel, /2 locations/);
  assert.match(preview.routeLabel, /planning hint/i);
});

test("buildWeddingArtifactPreviewState creates guest previews with privacy labels", () => {
  const preview = buildWeddingArtifactPreviewState({
    artifactKind: "guest_list",
    bodyText: [
      "# Guest list",
      "",
      "| Name | RSVP | Dietary |",
      "| --- | --- | --- |",
      "| Aisha | Yes | Vegetarian |",
    ].join("\n"),
  });

  assert.equal(preview?.kind, "guest");
  if (preview?.kind !== "guest") return;
  assert.deepEqual(preview.headers, ["Name", "RSVP", "Dietary"]);
  assert.equal(preview.rows[0]?.[0], "Aisha");
  assert.match(preview.privacyLabel, /private by default/i);
});
