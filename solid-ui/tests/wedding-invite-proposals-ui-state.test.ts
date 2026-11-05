import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const homeSource = readFileSync(new URL("../src/components/WeddingVendorSearchHomeSections.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../src/components/WeddingInviteProposalsPanel.tsx", import.meta.url), "utf8");
const oracleComposeSource = readFileSync(new URL("../../docker-compose.oracle.minimal.yml", import.meta.url), "utf8");

test("vendor home exposes accessible in-place Find and Invite tabs", () => {
  assert.match(homeSource, /role="tablist"/);
  assert.match(homeSource, />Find vendors<\/button>/);
  assert.match(homeSource, />Invite Proposals<\/button>/);
  assert.match(homeSource, /role="tabpanel"/);
  assert.match(homeSource, /hidden=\{vendorMode\(\) !== "find"\}/);
});

test("proposal panel publishes a category opportunity without a recipient picker", () => {
  assert.match(panelSource, /Proposal opportunity published\. No vendor was contacted/);
  assert.match(panelSource, /Publishing does not send an enquiry/);
  assert.match(panelSource, /Approximate category budget/);
  assert.match(panelSource, /Allow phone contact/);
  assert.match(panelSource, /Publish opportunity/);
  assert.match(panelSource, /Create secure vendor link/);
  assert.doesNotMatch(panelSource, /Choose recipients/);
  assert.doesNotMatch(panelSource, /What should vendors propose/);
  assert.doesNotMatch(panelSource, /Still useful to add/);
});

test("proposal facts are actionable in place and the mobile panel is full bleed", () => {
  assert.match(panelSource, /Change here/);
  assert.match(panelSource, /Add here/);
  assert.match(panelSource, /saveDate/);
  assert.match(panelSource, /saveContextFact/);
  assert.match(panelSource, /saveBudget/);
  assert.match(panelSource, /class="-mx-3 mt-4 min-w-0 sm:mx-0"/);
  assert.match(homeSource, /\{ id: "enquired", label: "Enquired" \}, \{ id: "proposals", label: "Proposals" \}/);
});

test("Oracle forwards the false-default proposal rollout controls to the homeserver", () => {
  assert.match(
    oracleComposeSource,
    /OMNYID_WEDDING_INVITE_PROPOSALS_ENABLED: \$\{OMNYID_WEDDING_INVITE_PROPOSALS_ENABLED:-false\}/,
  );
  assert.match(
    oracleComposeSource,
    /OMNYID_WEDDING_INVITE_PROPOSALS_ALLOWLIST: \$\{OMNYID_WEDDING_INVITE_PROPOSALS_ALLOWLIST:-\}/,
  );
});
