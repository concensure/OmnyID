import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("onboarding uses compact local photos and confirmation for clearing vendor choices", () => {
  const intake = read("../src/components/WeddingSiteIntakeWizard.tsx");
  assert.match(intake, /assets\/images\/quiz\/restaurant\.webp/);
  assert.match(intake, /loading=\{index\(\) < 2 \? "eager" : "lazy"\}/);
  assert.match(intake, /WeddingConfirmDialog/);
  assert.match(intake, /Clear your first vendor choices/);
});

test("seating instructions are persistent and material saves are confirmed", () => {
  const panel = read("../src/components/WeddingSeatingPanel.tsx");
  const canvas = read("../src/components/WeddingSeatingCanvas.tsx");
  assert.match(panel, /Click or tap a guest/);
  assert.match(panel, /Apply this seating change/);
  assert.match(canvas, /Drag a guest name onto a table, or select names and tap a table/);
  assert.match(canvas, /Full screen/);
  assert.match(canvas, /Zoom in/);
  assert.match(canvas, /setPointerCapture/);
  assert.match(canvas, /Table name for/);
  assert.match(canvas, /selectedPersonIds/);
});

test("RSVP setup offers deadline guidance, couple names and an inline event form", () => {
  const setup = read("../src/components/WeddingRsvpSetupPanel.tsx");
  assert.match(setup, /suggestedWeddingRsvpDeadline/);
  assert.match(setup, /Six weeks before the wedding is a practical default/);
  assert.match(setup, /props\.defaultHostLabel\?\.trim\(\)/);
  assert.match(setup, /Add an event/);
  assert.match(setup, /setCustomEvents/);
  assert.match(setup, /weddingRsvpEventNameOptions/);
  assert.match(setup, /Include cultural or community traditions in this wedding plan/);
  assert.match(setup, /hostLabelEdited/);
});

test("uploaded Wedding documents retain an original-format preview surface", () => {
  const detail = read("../src/components/WeddingArtifactDetailPanel.tsx");
  const attachments = read("../src/components/renderers/AttachmentsRenderer.tsx");
  const projection = read("../src/lib/weddingResponseWorkspacePresentationState.ts");
  assert.match(detail, /Original uploaded file/);
  assert.match(detail, /originalAttachment/);
  assert.match(attachments, /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/);
  assert.match(attachments, /application\/msword/);
  assert.match(attachments, /application\/pdf/);
  assert.match(attachments, /text\/markdown/);
  assert.match(projection, /originalAttachment/);
});

test("Wedding overflow navigation closes after a one-second idle hover", () => {
  const menu = read("../src/components/WeddingWorkspaceMoreMenu.tsx");
  assert.match(menu, /setTimeout\(\(\) => setOpen\(false\), 1_000\)/);
  assert.match(menu, /onMouseLeave=\{scheduleClose\}/);
  assert.match(menu, /onMouseEnter=\{cancelClose\}/);
});

test("operator blog uploads are database-backed and require a publish confirmation", () => {
  const publisher = read("../src/components/UsageAdminWeddingBlogPublisher.tsx");
  const migration = read("../../postgres/migrations/0120_wedding_blog_publications.sql");
  assert.match(publisher, /Nothing is uploaded until you confirm/);
  assert.match(publisher, /Publish this article now/);
  assert.match(migration, /wedding_blog_publications/);
});
