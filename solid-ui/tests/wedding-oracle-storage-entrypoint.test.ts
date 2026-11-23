import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");

for (const composeFile of [
  "docker-compose.yml",
  "docker-compose.oracle.yml",
  "docker-compose.oracle.minimal.yml",
  "docker-compose.oracle.quic.yml",
]) {
  test(`${composeFile} normalizes Windows line endings before launch`, () => {
    const compose = readFileSync(resolve(root, composeFile), "utf8");

    assert.match(compose, /tr -d '\\\\r'/);
    assert.ok(compose.includes(
      "exec /bin/sh /tmp/seaweedfs-secure-entrypoint.sh",
    ));
    assert.ok(compose.includes(
      "./scripts/seaweedfs-secure-entrypoint.sh:/usr/local/bin/seaweedfs-secure-entrypoint.sh:ro",
    ));
  });
}

for (const composeFile of [
  "docker-compose.oracle.yml",
  "docker-compose.oracle.minimal.yml",
]) {
  test(`${composeFile} keeps OpenRouter credentials file-backed`, () => {
    const compose = readFileSync(resolve(root, composeFile), "utf8");

    assert.match(
      compose,
      /OPENROUTER_API_KEY_FILE: \$\{OPENROUTER_API_KEY_FILE:-\/run\/secrets\/openrouter_api_key\}/,
    );
    assert.doesNotMatch(compose, /^\s+OPENROUTER_API_KEY:/m);
  });
}
