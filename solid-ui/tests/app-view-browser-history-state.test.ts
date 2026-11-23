import assert from "node:assert/strict";
import test from "node:test";

import {
  appViewFromBrowserHistory,
  browserHistoryStateForAppView,
  browserHistoryUrlForAppView,
} from "../src/lib/appViewBrowserHistoryState.ts";

test("browser view history preserves unrelated state and URL context", () => {
  assert.deepEqual(browserHistoryStateForAppView({ weddingMenu: "home" }, "templates"), {
    weddingMenu: "home",
    omnyidView: "templates",
  });
  assert.equal(
    browserHistoryUrlForAppView("https://app.example/?source=wedding#welcome", "response_queue"),
    "/?source=wedding&view=response_queue#welcome",
  );
});

test("browser view history restores state first and URL as a reload fallback", () => {
  assert.equal(
    appViewFromBrowserHistory({ omnyidView: "calendar" }, "https://app.example/?view=templates"),
    "calendar",
  );
  assert.equal(appViewFromBrowserHistory({}, "https://app.example/?view=templates"), "templates");
  assert.equal(appViewFromBrowserHistory({}, "https://app.example/?view=unknown"), null);
});
