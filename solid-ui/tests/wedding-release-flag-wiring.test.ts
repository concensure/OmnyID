import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("ranking policy V2 uses one Vite-exposed, default-off production flag", () => {
  const dockerfile = read("solid-ui/Dockerfile");
  const compose = read("docker-compose.oracle.minimal.yml");
  const registry = JSON.parse(read("config/wedding_vendor_production_v1.json"));
  const flag = "VITE_WEDDING_VENDOR_RANKING_POLICY_V2";

  assert.equal(registry.feature_flags.ranking_policy_v2, flag);
  assert.match(dockerfile, new RegExp(`ARG ${flag}="false"`));
  assert.ok(dockerfile.includes(`ENV ${flag}=$${flag}`));
  assert.ok(compose.includes(`${flag}: \${${flag}:-false}`));
});

test("all quotation capability flags reach every Oracle homeserver profile default-off", () => {
  const flags = [
    "OMNYID_QUOTATION_VENDOR_RESPONSE_CAPABILITIES_ENABLED",
    "OMNYID_QUOTATION_CLAIMED_VENDOR_RESPONSES_ENABLED",
    "OMNYID_QUOTATION_EMAIL_RESPONSE_RECONCILIATION_ENABLED",
  ];
  for (const path of [
    "docker-compose.oracle.yml",
    "docker-compose.oracle.minimal.yml",
    "docker-compose.oracle.staging.yml",
  ]) {
    const source = read(path);
    for (const flag of flags) {
      assert.ok(source.includes(`${flag}: \${${flag}:-false}`), `${path} must pass ${flag}`);
    }
  }
});
