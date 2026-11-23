import assert from "node:assert/strict";
import test from "node:test";

import {
  workflowTimelineTriggerChipPresentationClassDisplayValue,
  workflowTimelineTriggerChipPresentationLabelDisplayValue,
  workflowTimelineTriggerChipPresentationTitleDisplayValue,
  workflowTimelineTriggerChipDisplayClass,
  workflowTimelineTriggerChipDisplayLabel,
  workflowTimelineTriggerChipDisplayTitle,
  workflowTimelineTriggerChipClass,
  workflowTimelineRuntimeTriggerKindDisplayValue,
  workflowTimelineRuntimeTriggerKindInputDisplayValue,
  workflowTimelineTriggerChipInputDisplayValue,
  workflowTimelineOptionalTriggerChipDisplayValue,
  workflowTimelineOptionalTriggerChipPresentation,
  workflowTimelineTriggerChipPresentation,
  workflowTimelineTriggerChipShellClass,
  workflowTimelineTriggerFamily,
  workflowTimelineTriggerLabel,
  workflowTimelineTriggerTitle,
} from "../src/lib/workflowTimelineTriggerPresentation.ts";

test("workflowTimelineTriggerFamily preserves timeline trigger grouping rules", () => {
  assert.equal(workflowTimelineTriggerFamily("manual"), "manual");
  assert.equal(workflowTimelineTriggerFamily("replay"), "replay");
  assert.equal(workflowTimelineTriggerFamily("schedule.daily"), "schedule");
  assert.equal(workflowTimelineTriggerFamily("event.webhook"), "event");
  assert.equal(workflowTimelineTriggerFamily("wait_resume_timeout"), "delayed_continuation");
  assert.equal(workflowTimelineTriggerFamily("continuation_branch"), "delayed_continuation");
  assert.equal(workflowTimelineTriggerFamily("something_else"), "hybrid");
});

test("workflowTimelineTriggerChipClass maps trigger families to stable chip palettes", () => {
  assert.match(workflowTimelineTriggerChipClass("manual"), /slate-/);
  assert.match(workflowTimelineTriggerChipClass("schedule"), /sky-/);
  assert.match(workflowTimelineTriggerChipClass("event"), /emerald-/);
  assert.match(workflowTimelineTriggerChipClass("delayed_continuation"), /amber-/);
  assert.match(workflowTimelineTriggerChipClass("replay"), /indigo-/);
  assert.match(workflowTimelineTriggerChipClass("hybrid"), /violet-/);
});

test("workflowTimelineTriggerChipShellClass preserves the full trigger chip shell", () => {
  assert.equal(
    workflowTimelineTriggerChipShellClass("schedule"),
    "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] border-sky-200/70 bg-sky-50/80 text-sky-700",
  );
  assert.equal(
    workflowTimelineTriggerChipShellClass("replay"),
    "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] border-indigo-200/70 bg-indigo-50/80 text-indigo-700",
  );
});

test("workflow timeline trigger presentation formats chip labels", () => {
  assert.equal(workflowTimelineTriggerLabel("manual"), "manual");
  assert.equal(workflowTimelineTriggerLabel("replay"), "replay");
  assert.equal(workflowTimelineTriggerLabel("schedule.daily"), "schedule / schedule.daily");
  assert.equal(workflowTimelineTriggerLabel("event.webhook"), "event / event.webhook");
});

test("workflow timeline trigger presentation formats chip titles", () => {
  assert.equal(
    workflowTimelineTriggerTitle("wait_resume_timeout"),
    "Activated by delayed_continuation trigger (kind: wait_resume_timeout)",
  );
  assert.equal(
    workflowTimelineTriggerTitle("manual"),
    "Activated by manual trigger (kind: manual)",
  );
});

test("workflowTimelineTriggerChipPresentation preserves the full trigger chip contract", () => {
  assert.deepEqual(workflowTimelineTriggerChipPresentation("schedule.daily"), {
    className:
      "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] border-sky-200/70 bg-sky-50/80 text-sky-700",
    label: "schedule / schedule.daily",
    title: "Activated by schedule trigger (kind: schedule.daily)",
  });
  assert.deepEqual(workflowTimelineTriggerChipPresentation("manual"), {
    className:
      "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] border-slate-200/70 bg-slate-50/90 text-slate-700",
    label: "manual",
    title: "Activated by manual trigger (kind: manual)",
  });
});

test("workflowTimelineTriggerChipDisplayLabel preserves rendered trigger-chip copy", () => {
  assert.equal(
    workflowTimelineTriggerChipPresentationLabelDisplayValue({
      className:
        "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
      label: "schedule / schedule.daily",
      title: "Activated by schedule trigger (kind: schedule.daily)",
    }),
    "schedule / schedule.daily",
  );
  assert.equal(
    workflowTimelineTriggerChipDisplayLabel("schedule / schedule.daily"),
    "schedule / schedule.daily",
  );
});

test("workflowTimelineTriggerChipDisplayTitle preserves rendered trigger-chip tooltip copy", () => {
  assert.equal(
    workflowTimelineTriggerChipPresentationTitleDisplayValue({
      className:
        "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
      label: "schedule / schedule.daily",
      title: "Activated by schedule trigger (kind: schedule.daily)",
    }),
    "Activated by schedule trigger (kind: schedule.daily)",
  );
  assert.equal(
    workflowTimelineTriggerChipDisplayTitle(
      "Activated by schedule trigger (kind: schedule.daily)",
    ),
    "Activated by schedule trigger (kind: schedule.daily)",
  );
});

test("workflowTimelineTriggerChipDisplayClass preserves rendered trigger-chip shell", () => {
  assert.equal(
    workflowTimelineTriggerChipPresentationClassDisplayValue({
      className:
        "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
      label: "manual",
      title: "Activated by manual trigger (kind: manual)",
    }),
    "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
  );
  assert.equal(
    workflowTimelineTriggerChipDisplayClass(
      "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
    ),
    "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
  );
});

test("workflowTimelineOptionalTriggerChipPresentation preserves optional trigger display rules", () => {
  assert.equal(
    workflowTimelineRuntimeTriggerKindInputDisplayValue("manual"),
    "manual",
  );
  assert.equal(workflowTimelineRuntimeTriggerKindInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineRuntimeTriggerKindDisplayValue("manual"),
    "manual",
  );
  assert.equal(workflowTimelineRuntimeTriggerKindDisplayValue(null), null);
  assert.deepEqual(
    workflowTimelineTriggerChipInputDisplayValue({
      className:
        "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] border-slate-200/70 bg-slate-50/90 text-slate-700",
      label: "manual",
      title: "Activated by manual trigger (kind: manual)",
    }),
    {
      className:
        "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] border-slate-200/70 bg-slate-50/90 text-slate-700",
      label: "manual",
      title: "Activated by manual trigger (kind: manual)",
    },
  );
  assert.deepEqual(
    workflowTimelineOptionalTriggerChipDisplayValue({
      className:
        "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] border-slate-200/70 bg-slate-50/90 text-slate-700",
      label: "manual",
      title: "Activated by manual trigger (kind: manual)",
    }),
    {
      className:
        "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] border-slate-200/70 bg-slate-50/90 text-slate-700",
      label: "manual",
      title: "Activated by manual trigger (kind: manual)",
    },
  );
  assert.equal(workflowTimelineOptionalTriggerChipDisplayValue(null), null);
  assert.equal(workflowTimelineOptionalTriggerChipPresentation(null), null);
  assert.equal(workflowTimelineOptionalTriggerChipPresentation(undefined), null);
  assert.deepEqual(workflowTimelineOptionalTriggerChipPresentation("manual"), {
    className:
      "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] border-slate-200/70 bg-slate-50/90 text-slate-700",
    label: "manual",
    title: "Activated by manual trigger (kind: manual)",
  });
});
