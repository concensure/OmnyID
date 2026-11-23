import test from "node:test";
import assert from "node:assert/strict";

import {
  archiveOnlyActiveLabel,
  archiveOnlyToggleLabel,
  archiveOnlyWarningTitle,
} from "../src/lib/storageMode.ts";

test("archiveOnlyToggleLabel reflects save state and enabled state", () => {
  assert.equal(archiveOnlyToggleLabel({ plan: "paid", status: "active" }, true), "Saving...");
  assert.equal(
    archiveOnlyToggleLabel({ plan: "paid", status: "active" }, false),
    "Archive-only mode unavailable",
  );
  assert.equal(
    archiveOnlyToggleLabel({ plan: "paid", status: "active", archive_only_enabled: true }, false),
    "Disable archive-only mode",
  );
  assert.equal(
    archiveOnlyToggleLabel({ plan: "paid", status: "active", archive_only_enabled: false }, false),
    "Enable archive-only mode",
  );
});

test("archiveOnlyActiveLabel is only present when archive-only mode is enabled", () => {
  assert.equal(
    archiveOnlyActiveLabel({ plan: "paid", status: "active", archive_only_enabled: true }),
    "Archive-only mode active",
  );
  assert.equal(
    archiveOnlyActiveLabel({ plan: "paid", status: "active", archive_only_enabled: false }),
    null,
  );
});

test("archiveOnlyWarningTitle reflects whether the mode is already active", () => {
  assert.equal(
    archiveOnlyWarningTitle({ plan: "paid", status: "active" }),
    "Archive-only policy unavailable",
  );
  assert.equal(
    archiveOnlyWarningTitle({ plan: "paid", status: "active", archive_only_enabled: true }),
    "Archive-only mode active",
  );
  assert.equal(
    archiveOnlyWarningTitle({ plan: "paid", status: "active", archive_only_enabled: false }),
    "Archive-only mode on quota overflow",
  );
});
