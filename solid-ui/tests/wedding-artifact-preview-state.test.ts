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
  assert.deepEqual(preview.columns?.map((column) => column.kind), ["option", "location", "risk"]);
  assert.deepEqual(preview.columns?.map((column) => column.label), ["Option", "Location", "Watch-outs"]);
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
  assert.deepEqual(preview.columns?.map((column) => column.kind), [
    "text",
    "price",
    "price",
    "text",
    "price",
    "risk",
  ]);
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

test("buildWeddingArtifactPreviewState creates structured quote previews before raw documents", () => {
  const preview = buildWeddingArtifactPreviewState({
    artifactKind: "vendor_table",
    bodyText: [
      "# Chloe's Florals quote",
      "",
      "Vendor: Chloe's Florals",
      "Vendor category: Florist",
      "Quote amount: AUD $799",
      "Budget delta: $200 over budget",
      "Valid until: 2026-10-15",
      "Date hold expires: 2026-10-12",
      "Booking status: selected",
      "Wedding date: 20 November 2027",
      "Guests: 90",
      "Availability: Available for the date",
      "Deposit: 25% on acceptance",
      "Original file: https://example.com/chloe-quote.docx",
      "",
      "## Inclusions",
      "",
      "- Bridal bouquet",
      "- Ceremony arrangements",
    ].join("\n"),
  });

  assert.equal(preview?.kind, "quote");
  if (preview?.kind !== "quote") return;
  assert.equal(preview.vendorName, "Chloe's Florals");
  assert.equal(preview.vendorCategory, "Florist");
  assert.equal(preview.amount, 799);
  assert.equal(preview.currency, "AUD");
  assert.equal(preview.budgetDeltaAmount, 200);
  assert.equal(preview.validUntil, "2026-10-15");
  assert.equal(preview.dateHoldExpiresAt, "2026-10-12");
  assert.equal(preview.bookingStatus, "chosen");
  assert.equal(preview.eventDate, "20 November 2027");
  assert.equal(preview.guestCount, 90);
  assert.equal(preview.availabilityLabel, "Available for the date");
  assert.equal(preview.depositLabel, "25% on acceptance");
  assert.equal(preview.attachmentUrl, "https://example.com/chloe-quote.docx");
  assert.equal(preview.attachmentTextStatus, "linked_unverified");
  assert.ok(preview.attachmentEvidenceLabels?.includes("Original quote attachment is linked but text extraction is not verified"));
  assert.deepEqual(preview.inclusions, ["Bridal bouquet", "Ceremony arrangements"]);
});

test("buildWeddingArtifactPreviewState records extracted quote attachment evidence", () => {
  const preview = buildWeddingArtifactPreviewState({
    artifactKind: "vendor_table",
    bodyText: [
      "# Chloe's Florals quote",
      "",
      "Vendor: Chloe's Florals",
      "Quote amount: AUD $799",
      "Original PDF: https://example.com/chloe-quote.pdf",
      "Attachment text status: extracted",
      "Attachment parser: server document parser",
      "",
      "## Attachment text",
      "",
      "Total package AUD $799 including ceremony arrangements.",
    ].join("\n"),
  });

  assert.equal(preview?.kind, "quote");
  if (preview?.kind !== "quote") return;
  assert.equal(preview.attachmentTextStatus, "extracted");
  assert.ok(preview.attachmentEvidenceLabels?.includes("Original quote attachment text was extracted"));
  assert.ok(preview.attachmentEvidenceLabels?.includes("server document parser"));
});

test("buildWeddingArtifactPreviewState keeps scenario terms and source snippets attached to normalized quote rows", () => {
  const preview = buildWeddingArtifactPreviewState({
    artifactKind: "vendor_table",
    bodyText: [
      "# Harbour Garden quote",
      "",
      "Vendor: Harbour Garden",
      "Quote amount: AUD $5,200",
      "Minimum spend: AUD $5,000",
      "Minimum guests: 20",
      "Maximum guests: 120",
      "Event length: 6 hours",
      "Cancellation terms: Deposit retained within 60 days",
      "",
      "## Inclusions",
      "",
      "- Food and beverage AUD $4,800",
      "",
      "## Optional extras",
      "",
      "- Drinks upgrade AUD $400",
    ].join("\n"),
  });

  assert.equal(preview?.kind, "quote");
  if (preview?.kind !== "quote") return;
  assert.equal(preview.minimumSpendAmount, 5_000);
  assert.equal(preview.minGuestCount, 20);
  assert.equal(preview.maxGuestCount, 120);
  assert.equal(preview.quotedDurationHours, 6);
  assert.match(preview.cancellationTerms ?? "", /Deposit retained/);
  assert.equal(preview.scenarioItems?.length, 2);
  assert.equal(preview.scenarioItems?.[1]?.inclusion, "optional");
  assert.equal(preview.scenarioItems?.[1]?.unitAmount, 400);
  assert.match(preview.scenarioItems?.[1]?.sourceSnippet ?? "", /Drinks upgrade/);
});

test("buildWeddingArtifactPreviewState keeps explicit quote currencies distinct from dollar fallback", () => {
  const usdPreview = buildWeddingArtifactPreviewState({
    artifactKind: "vendor_table",
    bodyText: [
      "# Destination florist quote",
      "",
      "Vendor: Pacific Florals",
      "Quote amount: USD $1,250",
      "Budget delta: USD $150 over budget",
    ].join("\n"),
  });
  const audPreview = buildWeddingArtifactPreviewState({
    artifactKind: "vendor_table",
    bodyText: [
      "# Local florist quote",
      "",
      "Vendor: Chloe's Florals",
      "Quote amount: AUD $799",
    ].join("\n"),
  });

  assert.equal(usdPreview?.kind, "quote");
  assert.equal(audPreview?.kind, "quote");
  if (usdPreview?.kind !== "quote" || audPreview?.kind !== "quote") return;
  assert.equal(usdPreview.currency, "USD");
  assert.equal(usdPreview.amount, 1250);
  assert.equal(usdPreview.budgetDeltaAmount, 150);
  assert.equal(audPreview.currency, "AUD");
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

test("map previews ignore unrelated provider tables and strip raw snippet markup", () => {
  const preview = buildWeddingArtifactPreviewState({
    artifactKind: "map_collection",
    bodyText: [
      "# Live location and weather evidence",
      "",
      "| Provider | Snippet |",
      "| --- | --- |",
      "| Brave Search | The RSL has <strong>oceanfront spaces</strong> for 50 to 280 guests |",
      "",
      "## Weather evidence",
      "",
      "- No weather forecast returned.",
    ].join("\n"),
  });

  assert.equal(preview?.kind, "map");
  if (preview?.kind !== "map") return;
  assert.deepEqual(preview.locations, []);
  assert.match(preview.locationSearchUrl, /google\.com\/maps\/search/);
});

test("map previews use requested locations and expose a location-search link", () => {
  const preview = buildWeddingArtifactPreviewState({
    artifactKind: "map_collection",
    bodyText: [
      "# Live location and weather evidence",
      "",
      "## Requested locations",
      "",
      "- Cronulla NSW",
      "",
      "## Map evidence",
      "",
      "- Cronulla NSW (-34.05, 151.15) via Google Maps",
    ].join("\n"),
  });

  assert.equal(preview?.kind, "map");
  if (preview?.kind !== "map") return;
  assert.equal(preview.locations[0]?.label, "Cronulla NSW");
  assert.match(preview.locationSearchUrl, /Cronulla%20NSW/);
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
