import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

test("runtime backup selectors do not import recovery metrics", () => {
  const source = read("src/lib/runtimeBackupsState.ts");

  assert.equal(
    source.includes("./runtimeRecoveryMetricsState"),
    false,
    "runtimeBackupsState must stay independent from runtimeRecoveryMetricsState to avoid route chunk cycles.",
  );
});

test("wedding collaboration state modules share types without importing each other", () => {
  const aggregate = read("src/lib/weddingCollaborationState.ts");
  const lifecycle = read("src/lib/weddingCollaborationInviteLifecycleState.ts");
  const permission = read("src/lib/weddingCollaborationPermissionState.ts");

  assert.match(aggregate, /from "\.\/weddingCollaborationTypes"/);
  assert.match(lifecycle, /from "\.\/weddingCollaborationTypes"/);
  assert.match(permission, /from "\.\/weddingCollaborationTypes"/);
  assert.equal(
    lifecycle.includes("./weddingCollaborationState"),
    false,
    "invite lifecycle state must not import aggregate collaboration state.",
  );
  assert.equal(
    permission.includes("./weddingCollaborationState"),
    false,
    "permission state must not import aggregate collaboration state.",
  );
});
