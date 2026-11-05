import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const homeSource = readFileSync(new URL("../src/components/WeddingVendorSearchHomeSections.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../src/components/WeddingInviteProposalsPanel.tsx", import.meta.url), "utf8");

test("vendor home exposes accessible in-place Find and Invite tabs", () => {
  assert.match(homeSource, /role="tablist"/);
  assert.match(homeSource, />Find vendors<\/button>/);
  assert.match(homeSource, />Invite Proposals<\/button>/);
  assert.match(homeSource, /role="tabpanel"/);
  assert.match(homeSource, /hidden=\{vendorMode\(\) !== "find"\}/);
});

test("proposal panel labels the private draft boundary and explicit sharing controls", () => {
  assert.match(panelSource, /No vendor has been contacted/);
  assert.match(panelSource, /Saving this draft does not send it/);
  assert.match(panelSource, /Approximate category budget/);
  assert.match(panelSource, /Allow phone contact/);
  assert.match(panelSource, /Save private draft/);
  assert.match(panelSource, /disabled=\{!vendor\.eligible\}/);
  assert.match(panelSource, /vendor\.eligibilityReason/);
});
