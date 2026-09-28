import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const serviceWorkerSource = readFileSync(resolve("public/sw.js"), "utf8");

test("workspace service worker bumps the shell cache after asset-cache policy changes", () => {
  assert.match(serviceWorkerSource, /const SHELL_CACHE = "omnyid-shell-v4"/);
  assert.doesNotMatch(serviceWorkerSource, /omnyid-shell-v3/);
});

test("workspace service worker does not cache-first JS and CSS module assets", () => {
  assert.match(serviceWorkerSource, /url\.pathname\.startsWith\("\/workspace\/assets\/"\)/);
  assert.match(serviceWorkerSource, /event\.request\.destination === "script"/);
  assert.match(serviceWorkerSource, /event\.request\.destination === "style"/);
  assert.match(serviceWorkerSource, /event\.respondWith\(networkFirstWithCache\(event\.request, SHELL_CACHE\)\)/);
  assert.match(serviceWorkerSource, /stale module graph/i);
});
