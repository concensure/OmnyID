import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const panel = read("src/components/WeddingBoundaryAccessManagementPanel.tsx");
const context = read("src/components/WeddingWorkspaceContextPanels.tsx");
const api = read("src/lib/weddingBoundaryGovernanceApi.ts");
const server = read("../src/server/wedding_boundary_routes/delegated_access.rs");

test("Family Boundary access management projects existing server grants instead of a parallel store", () => {
  assert.match(context, /WeddingBoundaryAccessManagementPanel/);
  assert.match(panel, /listWeddingBoundaryHelperGrants/);
  assert.match(panel, /listWeddingBoundaryDelegatedGrants/);
  assert.match(panel, /createWeddingBoundaryHelperGrant/);
  assert.match(panel, /createWeddingBoundaryDelegatedGrant/);
  assert.match(panel, /revokeWeddingBoundaryHelperGrant/);
  assert.match(panel, /revokeWeddingBoundaryDelegatedGrant/);
  assert.doesNotMatch(panel, /localStorage|sessionStorage/);
});

test("Family Boundary access controls disclose rollout state and minimum-necessary permissions", () => {
  assert.match(api, /\/wedding\/boundaries\/access\/capabilities/);
  assert.match(server, /helper_links_enabled: helper_enabled\(\)/);
  assert.match(server, /authenticated_delegates_enabled: access_enabled\(&owner\.id\)/);
  assert.match(panel, /Proposal access creates a request for your approval; it never edits the guest list directly/);
  assert.match(panel, /Private notes, dietary details and seating-conflict reasons stay hidden/);
  assert.match(panel, /New helper links are off in this environment/);
  assert.match(panel, /New authenticated delegates are off for this account/);
  assert.match(panel, /\["view_summary", "propose_request"\]/);
  assert.doesNotMatch(panel, /approve_request/);
});

test("Family Boundary access controls are labelled, mobile-reflowing and confirm revocation", () => {
  assert.match(panel, /aria-labelledby="family-access-title"/);
  assert.match(panel, /aria-expanded=\{expanded\(\)\}/);
  assert.match(panel, /aria-controls="family-access-controls"/);
  assert.match(panel, /role="status"/);
  assert.match(panel, /role="alertdialog"/);
  assert.match(panel, /aria-modal="true"/);
  assert.match(panel, /Cancel<\/button>/);
  assert.match(panel, /Confirm revoke<\/button>/);
  assert.match(panel, /grid gap-4 xl:grid-cols-2/);
  assert.match(panel, /min-h-11/);
});

test("capability token is one-time, copy-only and never rehydrated from grant listings", () => {
  assert.match(panel, /Only a digest is stored\. OmnyID cannot show the full code again/);
  assert.match(panel, /setOneTimeToken\(result\.token\)/);
  assert.match(panel, /setOneTimeToken\(""\)/);
  const listedGrantType = api.match(/export type WeddingBoundaryHelperGrant = \{([\s\S]*?)\n\};/)?.[1] ?? "";
  assert.doesNotMatch(listedGrantType, /token:/);
});
