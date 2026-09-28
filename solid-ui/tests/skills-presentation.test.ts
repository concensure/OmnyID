import assert from "node:assert/strict";
import test from "node:test";

import {
  SESSION_TTL_MS,
  categoryColour,
  contextOverheadPct,
  formatCountdown,
  skillActivationHistoryTimestampLabel,
  skillProfileSavedDateLabel,
  totalOverheadPct,
} from "../src/lib/skillsPresentation.ts";

test("skills presentation overhead heuristic follows capsule kind and integration mode", () => {
  assert.equal(contextOverheadPct({ capsule_kind: "coding", integration_mode: null }), 60);
  assert.equal(contextOverheadPct({ capsule_kind: "data", integration_mode: null }), 40);
  assert.equal(
    contextOverheadPct({ capsule_kind: null, integration_mode: "passive_monitor" }),
    10,
  );
  assert.equal(
    contextOverheadPct({ capsule_kind: null, integration_mode: "agent_assist" }),
    35,
  );
  assert.equal(
    contextOverheadPct({ capsule_kind: null, integration_mode: "editor_compose" }),
    15,
  );
  assert.equal(contextOverheadPct({ capsule_kind: null, integration_mode: null }), 20);
});

test("skills presentation total overhead is capped at ninety nine percent", () => {
  assert.equal(totalOverheadPct([]), 0);
  assert.equal(
    totalOverheadPct([
      { capsule_kind: "coding", integration_mode: null },
      { capsule_kind: "analysis", integration_mode: null },
    ]),
    99,
  );
});

test("skills presentation countdown only appears near expiry and expires cleanly", () => {
  const nowMs = 1_000_000;
  const activatedAt = nowMs - (SESSION_TTL_MS - 19 * 60_000);
  assert.equal(formatCountdown(activatedAt, nowMs), "19m left");
  assert.equal(formatCountdown(nowMs - (SESSION_TTL_MS - 30_000), nowMs), "< 1 min");
  assert.equal(formatCountdown(nowMs - (SESSION_TTL_MS - 21 * 60_000), nowMs), null);
  assert.equal(formatCountdown(nowMs - (SESSION_TTL_MS + 1), nowMs), "Expired");
});

test("skills presentation category colours fall back for unknown categories", () => {
  assert.equal(
    categoryColour("workflow"),
    "bg-emerald-100/80 text-emerald-700 border-emerald-200/60",
  );
  assert.equal(
    categoryColour("unknown"),
    "bg-white/60 text-on-surface-variant border-white/40",
  );
});

test("skills presentation timestamp helpers use shared surface formatting", () => {
  assert.equal(skillActivationHistoryTimestampLabel("2026-09-01T04:05:00Z"), "Sep 1, 2026, 2:05 PM");
  assert.equal(skillProfileSavedDateLabel("2026-09-01T04:05:00Z"), "Sep 1, 2026");
  assert.equal(skillActivationHistoryTimestampLabel("invalid"), "invalid");
});
