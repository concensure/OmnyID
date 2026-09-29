import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

test("master agent preview conversion falls back instead of crashing the workspace", () => {
  const appSource = read("src/App.tsx");

  assert.match(appSource, /function buildCommandPreviewRenderFailureMessage/);
  assert.match(appSource, /console\.error\("\[command-preview\] failed to render preview"/);
  assert.match(appSource, /return buildCommandPreviewRenderFailureMessage\(result, lastQuery\(\), error\)/);
});

test("dynamic AFP renderer failures are contained inside the result card", () => {
  const dispatcherSource = read("src/components/ViewDispatcher.tsx");

  assert.match(dispatcherSource, /import \{ ErrorBoundary, Show, Suspense, lazy \} from "solid-js"/);
  assert.match(dispatcherSource, /<ErrorBoundary fallback=\{\(err, reset\) => \(/);
  assert.match(dispatcherSource, /function RendererErrorFallback/);
  assert.match(dispatcherSource, /This result could not render\./);
});

test("wedding response queue route has a local recovery boundary", () => {
  const appSource = read("src/App.tsx");
  const responseQueueRoute = appSource.slice(
    appSource.indexOf('<Show when={activeView() === "response_queue" && (Boolean(session()?.token) || guestUsesSampleWorkspace())}>'),
    appSource.indexOf("{/* Cost Dashboard", appSource.indexOf('<Show when={activeView() === "response_queue"')),
  );

  assert.match(responseQueueRoute, /<ErrorBoundary/);
  assert.match(responseQueueRoute, /<ResponseQueueRouteFallback/);
  assert.match(appSource, /function ResponseQueueRouteFallback/);
  assert.match(appSource, /Retry Wedding Planner/);
});
