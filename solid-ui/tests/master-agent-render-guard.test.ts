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

test("every completed master agent command has a plain visible response before enhanced rendering", () => {
  const appSource = read("src/App.tsx");
  const plainResponse = appSource.indexOf('data-testid="master-agent-visible-response"');
  const enhancedPreview = appSource.indexOf("<Show when={commandPreviewMessage()}>");

  assert.ok(plainResponse >= 0);
  assert.ok(enhancedPreview > plainResponse);
  assert.match(appSource, /Master Agent response/);
  assert.match(appSource, /result\(\)\.summary\?\.trim\(\)/);
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

test("home operational lanes tolerate an absent projection during route recovery", () => {
  const laneSource = read("src/components/OperationalLanesSurface.tsx");

  assert.match(laneSource, /operationalLaneSurfaceState\(\)\?\.showLanesSurface === true/);
  assert.match(laneSource, /operationalLaneSurfaceState\(\)\?\.visibleDigest \?\? \[\]/);
  assert.match(laneSource, /operationalLaneSurfaceState\(\)\?\.laneViewItems \?\? \[\]/);
});

test("wedding proxy photos use the authenticated API loader instead of a bare image request", () => {
  const cardSource = read("src/components/WeddingVendorChoiceCard.tsx");
  const apiSource = read("src/lib/api.ts");

  assert.match(cardSource, /fetchGoogleWeddingVendorPhoto/);
  assert.match(cardSource, /URL\.createObjectURL/);
  assert.match(apiSource, /export async function fetchGoogleWeddingVendorPhoto/);
  assert.match(apiSource, /headers\.set\("Authorization", `Bearer \$\{token\}`\)/);
});

test("wedding planner controls follow Setup checks and response cards preserve visual contrast", () => {
  const responseQueueSource = read("src/components/ResponseQueueView.tsx");
  const focusSource = read("src/components/WeddingDecisionFocusCard.tsx");
  const followUpSource = read("src/components/WeddingVendorFollowUpPanel.tsx");

  assert.ok(responseQueueSource.indexOf('label: "Setup checks"') < responseQueueSource.indexOf('aria-label="Wedding planner controls"'));
  assert.match(responseQueueSource, /Show guide/);
  assert.match(responseQueueSource, /Upload files/);
  assert.match(responseQueueSource, /<QueueDensityToggle/);
  assert.doesNotMatch(focusSource, /\{card\.checkedLabel\}/);
  assert.match(followUpSource, /border-2 border-wedding-cta/);
  assert.match(followUpSource, /border-2 border-wedding-accent/);
});

test("vendor recommendation cards do not expose the internal availability editor", () => {
  const cardSource = read("src/components/WeddingVendorChoiceCard.tsx");

  assert.doesNotMatch(cardSource, /Update availability/);
  assert.doesNotMatch(cardSource, /AVAILABILITY_OPTIONS/);
  assert.doesNotMatch(cardSource, /recordWeddingVendorAvailability/);
});
