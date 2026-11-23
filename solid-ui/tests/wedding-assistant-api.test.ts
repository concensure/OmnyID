import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeWeddingAssistantResponse } from "../src/lib/weddingAssistantApi";

const projectRoot = resolve(import.meta.dirname, "../..");

test("normalizes a review-first Wedding navigation suggestion", () => {
  assert.deepEqual(normalizeWeddingAssistantResponse({
    answer: "Open Budget and review the amount before saving.",
    model: "funded-model",
    suggested_action: { kind: "stage_update", target: "budget", label: "Review Budget", draft_fields: { budget_target_aud: 35000 } },
  }), {
    answer: "Open Budget and review the amount before saving.",
    links: [],
    model: "funded-model",
    suggestedAction: { kind: "stage_update", target: "budget", label: "Review Budget", draftFields: { budgetTargetAud: 35000 } },
  });
});

test("drops unknown destinations instead of navigating outside Wedding", () => {
  assert.equal(normalizeWeddingAssistantResponse({
    answer: "I can only help in Wedding.",
    suggested_action: { kind: "open_view", target: "admin", label: "Open admin" },
  }).suggestedAction, null);
});

test("Wedding assistant is proxied before static Wedding files and enforced by deploy smoke", () => {
  const caddy = readFileSync(resolve(projectRoot, "Caddyfile"), "utf8");
  const deploy = readFileSync(resolve(projectRoot, "scripts/deploy-oracle.ps1"), "utf8");
  assert.ok(caddy.indexOf("handle /wedding/assistant") >= 0);
  assert.ok(caddy.indexOf("handle /wedding/assistant") < caddy.indexOf("handle /wedding/*"));
  assert.match(deploy, /staged Caddyfile is missing the account-scoped wedding assistant proxy route/);
  assert.match(deploy, /running Caddyfile is missing the account-scoped wedding assistant proxy route/);
});
