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

test("minimal Oracle profile passes protected Cloudflare account mail configuration", () => {
  const compose = read("docker-compose.oracle.minimal.yml");
  for (const variable of [
    "OMNYID_TRANSACTIONAL_CLOUDFLARE_API_TOKEN_FILE",
    "OMNYID_TRANSACTIONAL_CLOUDFLARE_ACCOUNT_ID",
    "OMNYID_TRANSACTIONAL_FROM_ADDRESS",
    "OMNYID_VENDOR_MAIL_CLOUDFLARE_API_TOKEN_FILE",
    "OMNYID_VENDOR_MAIL_CLOUDFLARE_ACCOUNT_ID",
  ]) {
    assert.ok(compose.includes(`${variable}: \${${variable}:-}`), `${variable} must reach the homeserver`);
  }
});

test("RSVP reminder delivery stays default-off and its authenticated routes bypass the static wedding site", () => {
  const flag = "OMNYID_WEDDING_RSVP_REMINDER_SEND_ENABLED";
  const composeValues = new Map([
    ["docker-compose.yml", `${flag}: "false"`],
    ["docker-compose.oracle.yml", `${flag}: \${${flag}:-false}`],
    ["docker-compose.oracle.minimal.yml", `${flag}: \${${flag}:-false}`],
    ["docker-compose.oracle.staging.yml", `${flag}: \${OMNYID_STAGING_WEDDING_RSVP_REMINDER_SEND_ENABLED:-false}`],
  ]);
  for (const [path, expected] of composeValues) {
    assert.ok(read(path).includes(expected), `${path} must pass ${flag} default-off`);
  }
  assert.match(read("Caddyfile"), /handle \/wedding\/rsvp\/reminders\/\*/);
  assert.match(read("scripts/deploy-oracle.ps1"), /staged Caddyfile is missing the RSVP reminder proxy route/);
  assert.match(read("scripts/deploy-oracle.ps1"), /running Caddyfile is missing the RSVP reminder proxy route/);
});
