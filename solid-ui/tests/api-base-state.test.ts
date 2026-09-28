import test from "node:test";
import assert from "node:assert/strict";

import { deriveDefaultApiBase } from "../src/lib/apiBaseState.ts";

test("deriveDefaultApiBase keeps localhost origins on the same origin", () => {
  assert.equal(deriveDefaultApiBase("http://localhost:4173"), "http://localhost:4173");
  assert.equal(deriveDefaultApiBase("http://127.0.0.1:3000"), "http://127.0.0.1:3000");
});

test("deriveDefaultApiBase keeps api and cloud subdomains unchanged", () => {
  assert.equal(deriveDefaultApiBase("https://api.omnyid.com"), "https://api.omnyid.com");
  assert.equal(deriveDefaultApiBase("https://cloud.omnyid.com"), "https://cloud.omnyid.com");
});

test("deriveDefaultApiBase upgrades the main domain to the api subdomain", () => {
  assert.equal(deriveDefaultApiBase("https://omnyid.com"), "https://api.omnyid.com");
});

test("deriveDefaultApiBase upgrades nested hostnames to api-prefixed hostnames", () => {
  assert.equal(deriveDefaultApiBase("https://staging.omnyid.com"), "https://api.staging.omnyid.com");
});
