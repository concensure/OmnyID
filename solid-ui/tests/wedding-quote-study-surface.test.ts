import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("public quote study requires explicit consent and keeps analysis server-side", async () => {
  const [page, script] = await Promise.all([
    read("wedding/blog/before-you-accept-that-wedding-quote.html"),
    read("wedding/assets/js/quote-study.js"),
  ]);

  assert.match(page, /stored <strong>unencrypted<\/strong> in private SeaweedFS/i);
  assert.match(page, /openai\/gpt-5-mini/i);
  assert.match(page, /type="checkbox" required/i);
  assert.match(page, /authorised to upload/i);
  assert.match(page, /private deletion token/i);
  assert.match(page, /venue quote — detailed venue checks/i);
  assert.match(page, /another wedding vendor — generic quote checks/i);
  assert.doesNotMatch(page + script, /OPENROUTER_API_KEY\s*=/i);
  assert.match(script, /fetch\("\/wedding\/quote-study"/);
  assert.match(script, /textContent/);
  assert.doesNotMatch(script, /resultBody\.innerHTML/);
});

test("operator quote-study view is mounted and does not expose object keys", async () => {
  const [panel, section, api] = await Promise.all([
    read("solid-ui/src/components/UsageAdminWeddingQuoteStudyPanel.tsx"),
    read("solid-ui/src/components/UsageOperatorSection.tsx"),
    read("solid-ui/src/lib/weddingQuoteStudyAdminApi.ts"),
  ]);

  assert.match(section, /UsageAdminWeddingQuoteStudyPanel/);
  assert.match(panel, /Download consented original/);
  assert.match(panel, /private SeaweedFS objects/);
  assert.match(api, /\/admin\/wedding\/quote-study/);
  assert.doesNotMatch(api, /storage_key|storage_backend/);
});

test("all release workbooks cap human intervention at three evidence-bound gates", async () => {
  const [configs, runner] = await Promise.all([
    read("Documents/issues/wedding planner/gate-execution-configs.js"),
    read("Documents/issues/wedding planner/gate-execution.js"),
  ]);

  for (const gate of ["MAIL-EXT-01", "HUM-ACCESS-01", "REL-EXT-01"]) {
    assert.match(configs, new RegExp(gate));
  }
  for (const field of ["why", "current", "target", "actions", "expected", "criteria", "recovery", "resume", "blocking"]) {
    assert.match(configs, new RegExp(`${field}:`));
  }
  assert.match(runner, /config\.gates\.slice\(0, 3\)/);
  assert.match(runner, /Evidence SHA-256/);
  assert.match(runner, /sourceCommit/);
  assert.match(runner, /runtimeCommit/);
});
