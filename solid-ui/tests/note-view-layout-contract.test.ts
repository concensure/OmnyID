import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/components/NoteView.tsx", import.meta.url), "utf8");

test("Notes exposes one primary save control and keeps the rich editor footer hidden", () => {
  assert.match(source, /showFooter=\{false\}/);
  assert.match(source, /Unsaved local edits\./);
  assert.match(source, /Save changes/);
  assert.doesNotMatch(source, /submitLabel=\{/);
});

test("Notes keeps auxiliary work in a collapsible inspector and avoids a repeated inspector title", () => {
  assert.match(source, /Hide inspector/);
  assert.match(source, /Show inspector/);
  assert.match(source, /NoteSupportSection title="Ask \/ AI"/);
  assert.match(source, /NoteSupportSection title="AI Summary"/);
  assert.match(source, /NoteSupportSection title="Backlinks"/);
  assert.match(source, /NoteSupportSection title="Version History"/);
  assert.doesNotMatch(source, /<h1[^>]*>[\s\S]{0,120}\{note\(\)\.title\}/);
});

test("Notes prioritises folders and collapses user tags and system domains", () => {
  assert.match(source, /Folders<\/p>/);
  assert.match(source, /<summary[^>]*>Tags<\/summary>/);
  assert.match(source, /<summary[^>]*>System domains<\/summary>/);
  assert.match(source, /order: 1/);
  assert.match(source, /order: 2/);
  assert.match(source, /order: 3/);
});
