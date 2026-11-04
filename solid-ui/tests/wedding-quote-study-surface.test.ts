import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("public quote study requires explicit consent and keeps analysis server-side", async () => {
  const [page, script, compose] = await Promise.all([
    read("wedding/blog/before-you-accept-that-wedding-quote.html"),
    read("wedding/assets/js/quote-study.js"),
    read("docker-compose.oracle.minimal.yml"),
  ]);

  assert.match(page, /stored <strong>unencrypted<\/strong> in private SeaweedFS/i);
  assert.match(page, /openai\/gpt-5-mini/i);
  assert.match(page, /type="checkbox" required/i);
  assert.match(page, /authorised to upload/i);
  assert.match(page, /private deletion token/i);
  assert.match(page, /<details class="quote-study-disclosure">/i);
  assert.match(page, /Your consent matters:<\/strong>/i);
  assert.match(page, /venue quote — detailed venue checks/i);
  assert.match(page, /another wedding vendor — generic quote checks/i);
  assert.doesNotMatch(page + script, /OPENROUTER_API_KEY\s*=/i);
  assert.match(script, /fetch\("\/wedding\/quote-study"/);
  assert.match(script, /textContent/);
  assert.doesNotMatch(script, /resultBody\.innerHTML/);
  assert.doesNotMatch(script, /privacy notice is unavailable/i);
  assert.match(compose, /OMNYID_WEDDING_QUOTE_STUDY_ENABLED: \$\{OMNYID_WEDDING_QUOTE_STUDY_ENABLED:-false\}/);
});

test("public directory and claim flow expose database-backed discovery without exact handles", async () => {
  const [directory, directoryScript, claimFlow, claimApi] = await Promise.all([
    read("wedding/vendors.html"), read("wedding/assets/js/directory.js"),
    read("solid-ui/src/components/vendor/VendorClaimFlow.tsx"), read("solid-ui/src/lib/vendorClaimApi.ts"),
  ]);
  assert.match(directory, /vendorCategoryFilters/);
  assert.match(directoryScript, /limit=500/);
  assert.match(directoryScript, /category=/);
  assert.match(claimFlow, />Business name<\/label>/);
  assert.match(claimFlow, /role="combobox"/);
  assert.doesNotMatch(claimFlow, />Listing handle/);
  assert.match(claimApi, /\/api\/wedding\/vendor\/suggestions/);
  assert.match(claimFlow, /My business is not listed/);
  assert.match(claimFlow, /This stays out of public search until ownership and the listing are reviewed/);
  assert.match(claimApi, /\/api\/wedding\/vendor\/listing-proposals/);
});

test("solo animal quiz sharing speaks for one person and avoids fragile emoji in message text", async () => {
  const [page, home, script] = await Promise.all([read("wedding/animal-quiz.html"), read("wedding/index.html"), read("wedding/assets/js/quiz.js")]);
  assert.match(page, /quiz\.js\?v=20261101-wed309/);
  assert.match(script, /I found my wedding animal:/);
  assert.doesNotMatch(script, /I just found out our wedding animal might be/);
  assert.doesNotMatch(script, /might be the ' \+ a\.name \+ ' ' \+ a\.emoji/);
  assert.match(script, /dimension_scores/);
  assert.doesNotMatch(script, /guest_range:/);
  assert.doesNotMatch(script, /budget_stretch:/);
  assert.doesNotMatch(script, /�/);
  assert.match(home, /The Wedding Animal Quiz/);
  assert.match(home, /Find my wedding animal/);
  assert.doesNotMatch(home, /data-wedding-understanding-form/);
});

test("Wedding home promotes a source-linked approval-first run sheet", async () => {
  const [home, style] = await Promise.all([read("wedding/index.html"), read("wedding/assets/css/style.css")]);
  assert.match(home, /id="wedding-run-sheet"/);
  assert.match(home, /same wedding plan—not a second checklist to reconcile/);
  assert.match(home, /Nothing shared until you choose the audience and approve it/);
  assert.match(style, /\.run-sheet-band/);
  assert.match(style, /@media \(max-width: 480px\).*\.run-sheet-preview li/s);
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
