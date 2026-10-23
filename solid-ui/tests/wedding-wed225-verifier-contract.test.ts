import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const verifier = readFileSync(
  resolve(process.cwd(), "../scripts/verify-quotation-vendor-portal-readiness.ps1"),
  "utf8",
);

test("WED-225 source line budget ignores generated dependency lockfiles only", () => {
  assert.match(verifier, /\$generatedDependencyLockfiles = @\("Cargo\.lock", "package-lock\.json"\)/);
  assert.match(verifier, /\$generatedDependencyLockfiles -contains \[System\.IO\.Path\]::GetFileName\(\$relative\)/);
  assert.match(verifier, /if \(\$relative\.Replace\("\\", "\/"\)\.StartsWith\("\.agent\/"\)\) \{ continue \}/);
  assert.doesNotMatch(verifier, /generatedDependencyLockfiles[^\n]+\.rs/);
  assert.doesNotMatch(verifier, /generatedDependencyLockfiles[^\n]+\.tsx/);
});
