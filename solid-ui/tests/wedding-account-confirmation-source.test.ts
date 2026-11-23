import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf8");

test("registration and resend preserve the bounded signup source for the email link", () => {
  assert.match(appSource, /signupSource=\{pendingAuthSource \?\? undefined\}/);
  assert.match(appSource, /source: tab\(\) === "signup" \? props\.signupSource : undefined/);
  assert.match(appSource, /resendVerificationEmailRequest\(targetEmail, props\.signupSource\)/);
  assert.match(apiSource, /args\.mode === "register" && args\.source \? \{ source: args\.source \} : \{\}/);
  assert.match(apiSource, /bodyJson: \{ email, \.\.\.\(source \? \{ source \} : \{\}\) \}/);
});
