import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWeddingArtifactSummary, type WeddingArtifactInput } from "../src/lib/weddingArtifactState.ts";
import {
  buildWeddingArtifactExportManifest,
  buildWeddingExportBundleState,
  buildWeddingPacketExportCapabilityState,
  weddingArtifactWarningLabels,
} from "../src/lib/weddingExportState.ts";

const metadata = {
  wedding_plan_id: "wedding_plan:harbour",
  response_workspace_id: "response_workspace:planning-pass",
  source_response_id: "afp:response-1",
};

function artifact(input: WeddingArtifactInput) {
  const summary = normalizeWeddingArtifactSummary({ metadata, ...input });
  assert.ok(summary);
  return summary;
}

test("buildWeddingArtifactExportManifest maps wedding artifact targets to concrete export actions", () => {
  const manifest = buildWeddingArtifactExportManifest(artifact({
    id: "artifact:venue-table",
    title: "Venue comparison",
    kind: "vendor_table",
    vendorLabels: ["Harbour House"],
    locationLabels: ["Sydney"],
    sourceLabels: ["Agent research"],
  }));

  assert.equal(manifest.artifactId, "artifact:venue-table");
  assert.equal(manifest.baseFilename, "venue-comparison.md");
  assert.deepEqual(manifest.entries.map((entry) => entry.id), ["csv", "html", "pdf"]);
  assert.deepEqual(manifest.readyEntries.map((entry) => entry.action), ["download", "download", "print"]);
  assert.equal(manifest.entries.find((entry) => entry.id === "pdf")?.filename, "venue-comparison.pdf");
  assert.ok(manifest.metadataLabels.includes("Vendors"));
  assert.ok(manifest.metadataLabels.includes("Harbour House"));
  assert.deepEqual(manifest.warningLabels, []);
});

test("buildWeddingArtifactExportManifest exposes Word, browser PDF, and planned image/native conversions", () => {
  const manifest = buildWeddingArtifactExportManifest(artifact({
    id: "artifact:map",
    title: "Photo map",
    kind: "map_collection",
    exportTargets: ["html", "browser_pdf", "image_planned", "bundle_planned"],
  }));

  assert.deepEqual(manifest.entries.map((entry) => entry.id), ["html", "pdf", "jpg", "png", "bundle"]);
  assert.deepEqual(manifest.readyEntries.map((entry) => entry.id), ["html", "pdf"]);
  assert.ok(manifest.plannedEntries.some((entry) => entry.id === "jpg"));
  assert.ok(manifest.plannedEntries.some((entry) => entry.id === "png"));
  assert.ok(manifest.plannedEntries.some((entry) => entry.id === "bundle"));
});

test("buildWeddingArtifactExportManifest redacts imported source filenames from export UI metadata", () => {
  const manifest = buildWeddingArtifactExportManifest(artifact({
    id: "wedding_import:guest_list:workspace:rsvp-csv",
    title: "Imported CSV: rsvp.csv",
    kind: "guest_list",
    metadata: {
      ...metadata,
      supertags: ["wedding_import", "wedding_import:csv", "wedding_import_status:synthesized"],
    },
    sourceLabels: ["CSV import: rsvp.csv", "original upload saved"],
    exportTargets: ["markdown", "csv", "browser_pdf"],
  }));
  const serialized = JSON.stringify(manifest);

  assert.equal(manifest.title, "Imported private planning file");
  assert.equal(manifest.baseFilename, "imported-private-planning-file.md");
  assert.deepEqual(manifest.entries.map((entry) => entry.filename), [
    "imported-private-planning-file.md",
    "imported-private-planning-file.csv",
    "imported-private-planning-file.pdf",
  ]);
  assert.ok(manifest.metadataLabels.includes("Imported private planning file"));
  assert.equal(serialized.includes("rsvp.csv"), false);
  assert.equal(JSON.stringify(manifest.metadataLabels).includes("original upload saved"), false);
});

test("weddingArtifactWarningLabels flags sensitive or pending artifacts", () => {
  const budget = artifact({
    id: "artifact:budget",
    title: "Budget ceiling",
    kind: "budget_sheet",
    metadata: {
      ...metadata,
      privacy_scope: "shared_partner",
      approval_state: "pending_user_approval",
    },
  });

  const warnings = weddingArtifactWarningLabels(budget);
  assert.ok(warnings.some((warning) => /Budget exports/i.test(warning)));
  assert.ok(warnings.some((warning) => /shared partner/i.test(warning)));
  assert.ok(warnings.some((warning) => /needs your approval/i.test(warning)));
});

test("buildWeddingExportBundleState excludes sensitive artifacts unless explicitly included", () => {
  const publicResearch = artifact({
    id: "artifact:research",
    title: "Venue research",
    kind: "research",
  });
  const guestList = artifact({
    id: "artifact:guests",
    title: "Guest list",
    kind: "guest_list",
  });

  const safeBundle = buildWeddingExportBundleState({
    title: "Harbour planning packet",
    artifacts: [publicResearch, guestList],
  });
  assert.deepEqual(safeBundle.selectedArtifactIds, ["artifact:research"]);
  assert.equal(safeBundle.excludedArtifacts[0]?.id, "artifact:guests");
  assert.ok(safeBundle.warningLabels.some((warning) => /Guest list exports/i.test(warning)));
  assert.equal(safeBundle.bundleFilename, "harbour-planning-packet.zip");
  assert.equal(safeBundle.canExportNow, true);

  const fullBundle = buildWeddingExportBundleState({
    title: "Harbour planning packet",
    artifacts: [publicResearch, guestList],
    includeSensitive: true,
  });
  assert.deepEqual(fullBundle.selectedArtifactIds, ["artifact:research", "artifact:guests"]);
  assert.deepEqual(fullBundle.excludedArtifacts, []);
  assert.ok(fullBundle.warningLabels.some((warning) => /Guest list exports/i.test(warning)));
});

test("buildWeddingExportBundleState treats imported files as sensitive even when inferred as research", () => {
  const importedResearch = artifact({
    id: "artifact:imported-notes",
    title: "Imported planning notes",
    kind: "research",
    metadata: {
      ...metadata,
      supertags: ["wedding_import", "wedding_import:text", "wedding_import_status:synthesized"],
    },
  });
  const directResearch = artifact({
    id: "artifact:direct-research",
    title: "Venue research",
    kind: "research",
  });

  const safeBundle = buildWeddingExportBundleState({
    artifacts: [importedResearch, directResearch],
  });

  assert.deepEqual(safeBundle.selectedArtifactIds, ["artifact:direct-research"]);
  assert.equal(safeBundle.excludedArtifacts[0]?.id, "artifact:imported-notes");
  assert.ok(safeBundle.warningLabels.some((warning) => /Imported wedding files are private source evidence/i.test(warning)));

  const reviewedBundle = buildWeddingExportBundleState({
    artifacts: [importedResearch, directResearch],
    includeSensitive: true,
  });

  assert.deepEqual(reviewedBundle.selectedArtifactIds, ["artifact:imported-notes", "artifact:direct-research"]);
  assert.ok(reviewedBundle.warningLabels.some((warning) => /Imported wedding files are private source evidence/i.test(warning)));
});

test("buildWeddingExportBundleState honors explicit artifact selection before sensitivity filtering", () => {
  const research = artifact({ id: "artifact:research", title: "Venue research", kind: "research" });
  const budget = artifact({ id: "artifact:budget", title: "Budget sheet", kind: "budget_sheet" });
  const bundle = buildWeddingExportBundleState({
    artifacts: [research, budget],
    selectedArtifactIds: ["artifact:budget"],
  });

  assert.deepEqual(bundle.selectedArtifactIds, []);
  assert.equal(bundle.excludedArtifacts.length, 2);
  assert.equal(bundle.canExportNow, false);
});

test("buildWeddingPacketExportCapabilityState exposes ready and setup-gated download formats", () => {
  const state = buildWeddingPacketExportCapabilityState({ title: "Harbour planning bundle" });

  assert.deepEqual(state.readyFormats.map((format) => format.id), ["markdown", "html", "word_doc"]);
  assert.ok(state.readyFormats.some((format) => format.id === "word_doc" && /Word document/i.test(format.label)));
  assert.deepEqual(state.plannedConversions.map((conversion) => conversion.id), ["zip", "docx", "jpg", "png"]);
  assert.equal(state.plannedConversions[0]?.filename, "harbour-planning-bundle.zip");
  assert.match(state.plannedConversions[0]?.blockedReason ?? "", /not available yet/i);
  assert.match(state.summaryLabel, /4 extra download formats/i);
});
