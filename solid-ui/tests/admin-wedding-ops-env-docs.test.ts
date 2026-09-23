import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repoFile = (relativePath: string) =>
  readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");

const requiredWeddingOpsEnvNames = [
  "OMNYID_ADMIN_WEDDING_OPS_METRICS_ROOT",
  "OMNYID_ADMIN_WEDDING_OPS_METRICS_SOURCE",
  "OMNYID_WEDDING_ADMIN_AI_ROUTING_ENABLED",
  "OMNYID_WEDDING_ADMIN_AI_AUDIT_RECEIPTS_ENABLED",
  "OMNYID_WEDDING_ADMIN_AI_DAILY_USD_LIMIT",
  "OMNYID_WEDDING_ADMIN_AI_DAILY_REQUEST_LIMIT",
  "OMNYID_WEDDING_ADMIN_AI_DAILY_TOKEN_LIMIT",
];

test("wedding admin ops env controls are documented in local and Oracle examples", () => {
  const localEnvExample = repoFile(".env.example");
  const oracleEnvExample = repoFile("oracle-cloud.env.example");

  for (const envName of requiredWeddingOpsEnvNames) {
    assert.match(localEnvExample, new RegExp(`^${envName}=`, "m"));
    assert.match(oracleEnvExample, new RegExp(`^${envName}=`, "m"));
  }

  assert.match(oracleEnvExample, /^OMNYID_BRAVE_SEARCH_API_KEY_FILE=/m);
  assert.match(oracleEnvExample, /^OMNYID_GOOGLE_PLACES_API_KEY_FILE=/m);
  assert.match(localEnvExample, /not direct Master Agent queries/i);
  assert.match(oracleEnvExample, /excluding Master Agent queries/i);
});
