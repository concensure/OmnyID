import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

test("application view selection writes browser entries and consumes Back or Forward events", () => {
  assert.match(appSource, /window\.history\.pushState\(nextState, "", nextUrl\)/);
  assert.match(appSource, /window\.addEventListener\("popstate", onPopState\)/);
  assert.match(appSource, /selectViewWithHistory\(view, "none"\)/);
});

test("template launch preloads its destination before switching views", () => {
  assert.match(appSource, /await preloadViewModule\(view\);\s*selectView\(view\)/);
  assert.match(appSource, /LazyTemplatesView onLaunch=\{\(view\) => launchPreloadedTemplateView\(view\)\}/);
});
