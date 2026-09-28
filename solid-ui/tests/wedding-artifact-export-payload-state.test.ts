import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingArtifactExportPayload,
  buildWeddingWorkspaceBundleExportPayload,
} from "@/lib/weddingArtifactExportPayloadState";
import type { WeddingExportManifestEntry } from "@/lib/weddingExportState";

const metadata = {
  wedding_plan_id: "wedding_plan:harbour",
  response_workspace_id: "response_workspace:planning-pass",
  source_response_id: "afp:response-1",
};

function entry(input: Partial<WeddingExportManifestEntry> & Pick<WeddingExportManifestEntry, "id">): WeddingExportManifestEntry {
  return {
    id: input.id,
    label: input.label ?? input.id,
    extension: input.extension ?? ".md",
    mimeType: input.mimeType ?? "text/markdown;charset=utf-8",
    availability: input.availability ?? "ready",
    detail: input.detail ?? "Ready now.",
    filename: input.filename ?? `artifact${input.extension ?? ".md"}`,
    enabled: input.enabled ?? true,
    action: input.action ?? "download",
  };
}

test("buildWeddingArtifactExportPayload downloads markdown bodies", () => {
  const payload = buildWeddingArtifactExportPayload({
    title: "Venue research",
    bodyText: "# Venue research\n\n- Harbour Hall",
    entry: entry({ id: "markdown", filename: "venue.md" }),
  });

  assert.equal(payload.filename, "venue.md");
  assert.equal(payload.action, "download");
  assert.match(payload.content, /Harbour Hall/);
  assert.equal(payload.disabledReason, null);
});

test("buildWeddingArtifactExportPayload converts markdown to html and word-openable doc", () => {
  const payload = buildWeddingArtifactExportPayload({
    title: "Budget",
    bodyText: "## Budget\n\n- Venue estimate",
    entry: entry({
      id: "word_doc",
      label: "Word (.doc)",
      filename: "budget.doc",
      extension: ".doc",
      mimeType: "application/msword;charset=utf-8",
    }),
  });

  assert.equal(payload.filename, "budget.doc");
  assert.match(payload.content, /<h2>Budget<\/h2>/);
  assert.match(payload.content, /Venue estimate/);
});

test("buildWeddingArtifactExportPayload keeps planned native conversions disabled", () => {
  const payload = buildWeddingArtifactExportPayload({
    title: "Map",
    bodyText: "Map body",
    entry: entry({
      id: "jpg",
      filename: "map.jpg",
      extension: ".jpg",
      enabled: false,
      availability: "planned",
      action: "planned",
      detail: "Requires image rendering.",
    }),
  });

  assert.equal(payload.content, "");
  assert.equal(payload.disabledReason, "Requires image rendering.");
});

test("buildWeddingArtifactExportPayload marks browser pdf as print action", () => {
  const payload = buildWeddingArtifactExportPayload({
    title: "Run sheet",
    bodyText: "# Run sheet",
    entry: entry({
      id: "pdf",
      label: "PDF",
      filename: "run-sheet.pdf",
      extension: ".pdf",
      mimeType: "application/pdf",
      availability: "browser_print",
      action: "print",
    }),
  });

  assert.equal(payload.action, "print");
  assert.match(payload.content, /<h1>Run sheet<\/h1>/);
});

test("buildWeddingWorkspaceBundleExportPayload exports safe artifacts and excludes sensitive files by default", () => {
  const payload = buildWeddingWorkspaceBundleExportPayload({
    title: "Harbour planning packet",
    artifacts: [
      {
        id: "artifact:research",
        title: "Venue research",
        kind: "research",
        metadata,
        sourceLinks: [{ label: "Venue source", url: "https://example.com/venue" }],
        bodyText: "# Venue research\n\nShortlist harbour venues.",
      },
      {
        id: "artifact:guests",
        title: "Guest list",
        kind: "guest_list",
        metadata,
        bodyText: "# Guest list\n\nPrivate RSVP notes.",
      },
    ],
  });

  assert.equal(payload.filename, "harbour-planning-packet.md");
  assert.equal(payload.disabledReason, null);
  assert.deepEqual(payload.includedArtifactIds, ["artifact:research"]);
  assert.deepEqual(payload.excludedArtifactIds, ["artifact:guests"]);
  assert.match(payload.content, /Venue research/);
  assert.match(payload.content, /## Where this came from/);
  assert.match(payload.content, /Files with web links: 1/);
  assert.match(payload.content, /Files that need a fact check: 0/);
  assert.match(payload.content, /Venue research: web links included; 1 source listed/);
  assert.doesNotMatch(payload.content, /Private RSVP notes/);
  assert.ok(payload.warningLabels.some((warning) => /Guest list exports/i.test(warning)));
});

test("buildWeddingWorkspaceBundleExportPayload excludes imported research by default", () => {
  const payload = buildWeddingWorkspaceBundleExportPayload({
    title: "Import privacy packet",
    artifacts: [
      {
        id: "artifact:direct-research",
        title: "Venue research",
        kind: "research",
        metadata,
        bodyText: "# Venue research\n\nPublic venue notes.",
      },
      {
        id: "artifact:imported-notes",
        title: "Imported planning notes",
        kind: "research",
        metadata: {
          ...metadata,
          supertags: ["wedding_import", "wedding_import:text", "wedding_import_status:synthesized"],
        },
        bodyText: "# Imported planning notes\n\nPrivate family notes from an uploaded file.",
      },
    ],
  });

  assert.deepEqual(payload.includedArtifactIds, ["artifact:direct-research"]);
  assert.deepEqual(payload.excludedArtifactIds, ["artifact:imported-notes"]);
  assert.match(payload.content, /Venue research/);
  assert.doesNotMatch(payload.content, /Private family notes/);
  assert.ok(payload.warningLabels.some((warning) => /Imported wedding files are private source evidence/i.test(warning)));
});

test("buildWeddingWorkspaceBundleExportPayload includes source caveats for weakly sourced downloads", () => {
  const payload = buildWeddingWorkspaceBundleExportPayload({
    title: "Trust packet",
    includeSensitive: true,
    artifacts: [
      {
        id: "artifact:budget",
        title: "Budget assumptions",
        kind: "budget_sheet",
        metadata,
        sourceLabels: ["Agent estimate"],
        bodyText: "# Budget assumptions\n\nTBC costs.",
      },
      {
        id: "artifact:registry",
        title: "Registry ideas",
        kind: "registry",
        metadata,
        bodyText: "# Registry ideas\n\nSuggested items.",
      },
    ],
  });

  assert.match(payload.content, /Files with named sources: 1/);
  assert.match(payload.content, /Files that need a fact check: 1/);
  assert.match(payload.content, /Budget assumptions: sources named; 1 source listed; source is named, but no web link is included/);
  assert.match(payload.content, /Registry ideas: needs a fact check; 0 sources listed; no source name or web link is included/);
  assert.match(payload.content, /Check live availability, prices, legal details, map routes, registry details, and vendor terms/i);
});

test("buildWeddingWorkspaceBundleExportPayload can emit printable html packets", () => {
  const payload = buildWeddingWorkspaceBundleExportPayload({
    title: "Printable packet",
    targetId: "html",
    artifacts: [
      {
        id: "artifact:research",
        title: "Venue research",
        kind: "research",
        metadata,
        sourceLinks: [{ label: "Venue source", url: "https://example.com/venue" }],
        bodyText: "# Venue research\n\nConfirm availability.",
      },
    ],
  });

  assert.equal(payload.filename, "printable-packet.html");
  assert.equal(payload.mimeType, "text/html;charset=utf-8");
  assert.match(payload.content, /<!doctype html>/);
  assert.match(payload.content, /Confirm availability/);
  assert.match(payload.content, /Where this came from/);
});

test("buildWeddingWorkspaceBundleExportPayload can emit word-openable packet documents", () => {
  const payload = buildWeddingWorkspaceBundleExportPayload({
    title: "Word packet",
    targetId: "word_doc",
    artifacts: [
      {
        id: "artifact:research",
        title: "Venue research",
        kind: "research",
        metadata,
        sourceLinks: [{ label: "Venue source", url: "https://example.com/venue" }],
        bodyText: "# Venue research\n\nConfirm availability.",
      },
    ],
  });

  assert.equal(payload.targetId, "word_doc");
  assert.equal(payload.filename, "word-packet.doc");
  assert.equal(payload.mimeType, "application/msword;charset=utf-8");
  assert.match(payload.content, /<!doctype html>/);
  assert.match(payload.content, /Confirm availability/);
});

test("buildWeddingWorkspaceBundleExportPayload includes selected decision scope summaries", () => {
  const payload = buildWeddingWorkspaceBundleExportPayload({
    title: "Selected venue packet",
    artifacts: [{
      id: "artifact:venues",
      title: "Venue shortlist",
      kind: "vendor_table",
      metadata,
      bodyText: "# Venue shortlist\n\nHarbour Hall and Garden Hall.",
    }],
    decisionScopes: [{
      title: "Harbour Hall",
      detail: "Selected waterfront venue.",
      artifactTitle: "Venue shortlist",
      metadataLabels: ["vendor table", "source: local_selection"],
      sourceLabels: ["Google Places API"],
      sourceUrls: ["https://example.com/harbour-hall"],
      sourceProviderLabels: ["google_places"],
    }],
  });

  assert.match(payload.content, /## Selected choice/);
  assert.match(payload.content, /Harbour Hall from Venue shortlist: Selected waterfront venue/);
  assert.match(payload.content, /providers: google_places/);
  assert.match(payload.content, /sources: Google Places API/);
  assert.match(payload.content, /1 source web link/);
  assert.match(payload.content, /unticked alternatives available in the source files/i);
});

test("buildWeddingWorkspaceBundleExportPayload ignores malformed decision scope source URLs", () => {
  const payload = buildWeddingWorkspaceBundleExportPayload({
    title: "Selected vendor packet",
    artifacts: [{
      id: "artifact:vendors",
      title: "Vendor shortlist",
      kind: "vendor_table",
      metadata,
      bodyText: "# Vendor shortlist\n\nSafe vendor and unsafe source rows.",
    }],
    decisionScopes: [{
      title: "Safe Vendor",
      detail: "Selected after source review.",
      artifactTitle: "Vendor shortlist",
      sourceLabels: ["Mixed source packet"],
      sourceUrls: ["javascript:alert(1)", "https://example.com/safe-vendor"],
      sourceProviderLabels: ["manual_review"],
    }],
  });

  assert.match(payload.content, /1 source web link/);
  assert.doesNotMatch(payload.content, /javascript:alert/);
});

test("buildWeddingWorkspaceBundleExportPayload ignores local decision scope source URLs", () => {
  const payload = buildWeddingWorkspaceBundleExportPayload({
    title: "Selected vendor packet",
    artifacts: [{
      id: "artifact:vendors",
      title: "Vendor shortlist",
      kind: "vendor_table",
      metadata,
      bodyText: "# Vendor shortlist\n\nSafe vendor and local source rows.",
    }],
    decisionScopes: [{
      title: "Safe Vendor",
      detail: "Selected after source review.",
      artifactTitle: "Vendor shortlist",
      sourceLabels: ["Mixed source packet"],
      sourceUrls: [
        "http://localhost:8787/vendor/source",
        "https://127.0.0.1/vendor/source",
        "https://example.com/safe-vendor",
      ],
      sourceProviderLabels: ["manual_review"],
    }],
  });

  assert.match(payload.content, /1 source web link/);
  assert.doesNotMatch(payload.content, /localhost/);
  assert.doesNotMatch(payload.content, /127\.0\.0\.1/);
});

test("buildWeddingWorkspaceBundleExportPayload redacts imported decision scope source filenames", () => {
  const payload = buildWeddingWorkspaceBundleExportPayload({
    title: "Imported decision packet",
    artifacts: [{
      id: "artifact:guest-budget",
      title: "Guest budget",
      kind: "budget_sheet",
      metadata,
      bodyText: "# Guest budget\n\nSelected imported budget row.",
    }],
    decisionScopes: [{
      title: "Family budget row",
      detail: "Selected from imported planning evidence.",
      artifactTitle: "Imported XLSX: guest-budget.xlsx",
      metadataLabels: ["wedding_import:spreadsheet"],
      sourceLabels: ["CSV import: family-budget.csv", "source: guest-budget.xlsx"],
      sourceUrls: [
        "https://storage.example.test/uploads/guest-budget.xlsx?token=private",
        "https://example.com/audit-source",
      ],
      sourceProviderLabels: ["spreadsheet_import"],
    }],
  });

  assert.match(payload.content, /Family budget row from Imported private planning file/);
  assert.match(payload.content, /sources: Imported private planning file/);
  assert.match(payload.content, /1 source web link/);
  assert.doesNotMatch(payload.content, /family-budget\.csv/);
  assert.doesNotMatch(payload.content, /guest-budget\.xlsx/);
  assert.doesNotMatch(payload.content, /storage\.example\.test/);
  assert.doesNotMatch(payload.content, /token=private/);
  assert.doesNotMatch(payload.content, /audit-source/);
});

test("buildWeddingWorkspaceBundleExportPayload includes bounded decision focus summaries", () => {
  const payload = buildWeddingWorkspaceBundleExportPayload({
    title: "Decision focus packet",
    artifacts: [{
      id: "artifact:budget",
      title: "Budget review",
      kind: "budget_sheet",
      metadata,
      sourceLabels: ["User budget"],
      bodyText: "# Budget review\n\nVerify venue balance.",
    }],
    decisionFocus: {
      summaryLabel: "Focus on 2 wedding decisions now; 1 can wait.",
      backlogCount: 1,
      focusItems: [{
        title: "Verify venue balance before payment",
        pressureFamily: "obligation",
        sourceSurface: "tasks",
        dueLabel: "Before deposit",
        evidenceLabels: ["payment review", "cached workbook values"],
      }],
      reliefLabels: ["Keeps vendor search, budget, guest, and logistics work as ranked next actions instead of an unbounded checklist."],
    },
  });

  assert.match(payload.content, /## Three things worth your attention/);
  assert.match(payload.content, /Focus on 2 wedding decisions now; 1 can wait/);
  assert.match(payload.content, /Verify venue balance before payment/);
  assert.match(payload.content, /Backlog context: 1 lower-priority decision can wait/);
  assert.match(payload.content, /unbounded checklist/i);
});
