import test from "node:test";
import assert from "node:assert/strict";

import { extractWorkspaceBundleSignature } from "../src/lib/workspaceUpdateState.ts";

test("extractWorkspaceBundleSignature returns the asset hash from workspace html", () => {
  assert.equal(
    extractWorkspaceBundleSignature('<script type="module" src="/workspace/assets/index-AbCd1234.js"></script>'),
    "AbCd1234",
  );
});

test("extractWorkspaceBundleSignature returns null when no asset signature is mounted", () => {
  assert.equal(extractWorkspaceBundleSignature("<html><body>No bundle yet</body></html>"), null);
});
