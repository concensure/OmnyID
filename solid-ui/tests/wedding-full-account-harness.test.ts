import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const stack = readFileSync(new URL("../../scripts/e2e-wedding-stack.ps1", import.meta.url), "utf8");
const seed = readFileSync(new URL("../../src/bin/wedding_e2e_seed.rs", import.meta.url), "utf8");
const journey = readFileSync(new URL("../tests/e2e-full-account/wedding-full-account.spec.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("../../src/server/mod.rs", import.meta.url), "utf8");
const vite = readFileSync(new URL("../vite.config.mjs", import.meta.url), "utf8");

test("full-account stack is disposable and refuses unsafe targets", () => {
  assert.match(stack, /--tmpfs/);
  assert.match(stack, /127\.0\.0\.1:\$dbPort/);
  assert.match(stack, /omnyid_test/);
  assert.match(stack, /Refusing to build or run.+dirty tree/);
  assert.match(stack, /OMNYID_DISABLE_DOTENV_AUTOLOAD = "true"/);
  assert.match(stack, /OMNYID_ALLOWED_ORIGINS = \$uiOrigin/);
  assert.match(stack, /OMNYID_VENDOR_MAIL_ENABLED = "false"/);
  assert.match(stack, /OMNYID_TRANSACTIONAL_CLOUDFLARE_API_TOKEN = ""/);
  assert.match(stack, /OMNYID_ENCRYPTION_KEY_HEX = \("32" \* 32\)/);
  assert.match(stack, /docker stop \$container/);
  assert.match(stack, /docker rm \$container/);
  assert.match(stack, /auth\/google\/config/);
  assert.match(seed, /only synthetic @omnyid\.test accounts are allowed/);
  assert.match(seed, /refusing non-disposable database/);
  assert.match(seed, /\/auth\/register/);
});

test("journey isolates sessions and challenges cross-couple grant identifiers", () => {
  for (const email of ["mia", "jordan", "priya", "sam", "alex"]) {
    assert.match(journey, new RegExp(`${email}\\@omnyid\\.test`));
  }
  assert.match(journey, /new Set\(sessions\.map/);
  assert.match(journey, /__http_only_cookie__/);
  assert.match(journey, /fetch\("\/auth\/session"\)/);
  assert.match(journey, /cache: "no-store"/);
  assert.match(journey, /e2e-mia-submit/);
  assert.match(journey, /e2e-mia-withdraw/);
  assert.match(journey, /e2e-alex-catering-change/);
  assert.match(journey, /e2e-mia-approve-alex/);
  assert.match(journey, /not\.toContain\(miaCouple\.private_household_id\)/);
  assert.match(journey, /priyaGrant\.grant_id.*revoke/s);
  assert.match(journey, /status\)\.toBe\(404\)/);
});

test("real server exposes an explicit harness bind without changing its production default", () => {
  assert.match(server, /OMNYID_HTTP_BIND_ADDR/);
  assert.match(server, /"0\.0\.0\.0:8080"/);
  assert.match(server, /let http_addr = http_bind_addr\(\)/);
});

test("clean UI builds resolve SDK runtime dependencies from the UI package", () => {
  assert.match(vite, /find: \/\^zod\\\/v3\$\//);
  assert.match(vite, /node_modules\/zod\/v3\/index\.js/);
});
