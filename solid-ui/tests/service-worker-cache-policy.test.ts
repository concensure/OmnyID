import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const serviceWorkerSource = readFileSync(resolve("public/sw.js"), "utf8");

test("workspace service worker bumps the shell cache after asset-cache policy changes", () => {
  assert.match(serviceWorkerSource, /const SHELL_CACHE = "omnyid-shell-v17"/);
  assert.doesNotMatch(serviceWorkerSource, /API_CACHE/);
});

test("workspace service worker does not cache-first JS and CSS module assets", () => {
  assert.match(serviceWorkerSource, /url\.pathname\.startsWith\("\/workspace\/assets\/"\)/);
  assert.match(serviceWorkerSource, /event\.request\.destination === "script"/);
  assert.match(serviceWorkerSource, /event\.request\.destination === "style"/);
  assert.match(serviceWorkerSource, /url\.pathname === "\/workspace\/"[\s\S]*event\.respondWith\(networkOnly\(event\.request\)\)/);
  assert.match(serviceWorkerSource, /url\.pathname\.startsWith\("\/workspace\/assets\/"\)[\s\S]*event\.respondWith\(networkOnly\(event\.request\)\)/);
  assert.match(serviceWorkerSource, /stale module graph/i);
});

test("workspace service worker never caches account-scoped API responses", () => {
  for (const prefix of ["api", "auth", "agent", "dashboard", "relay", "files", "wedding"]) {
    assert.match(serviceWorkerSource, new RegExp(`url\\.pathname\\.startsWith\\(\"/${prefix}/\"\\)`));
  }
  assert.match(serviceWorkerSource, /event\.respondWith\(networkOnly\(event\.request\)\)/);
  assert.doesNotMatch(serviceWorkerSource, /cacheFirstWithNetwork/);
  assert.match(serviceWorkerSource, /Cache-Control": "no-store"/);
});
