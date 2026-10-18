import { render } from "solid-js/web";

import "../../src/index.css";
import { PlanningConstraintCaptureCard } from "../../src/components/PlanningConstraintCaptureCard";
import type { WeddingResponseWorkspaceViewProps } from "../../src/components/WeddingResponseWorkspaceViewTypes";

const confirmedBodies: unknown[] = [];
window.fetch = async (input, init) => {
  const url = String(input);
  if (url.includes("/planning/constraints/capture")) {
    return new Response(JSON.stringify({
      status: "proposal",
      retained_remark: "We need step-free access.",
      proposals: [{
        summary: "Step-free access",
        confirmation_label: "Confirm must-have",
        constraint: {
          schema_version: "planning.constraint.v1",
          constraint_id: "constraint:capture:fixture",
          template_id: "wedding_planning",
          plan_id: "wedding_plan:fixture",
          subject_ref: { kind: "plan", id: "plan:wedding:fixture" },
          kind: "accessibility_requirement",
          operator: "requires",
          value: { type: "boolean", value: true },
          strength: "hard",
          authority: "deterministic",
          privacy: "plan_private",
          source_ref: "fixture-source",
          source_anchor: { message_id: "fixture-source", source_version_id: "fixture-v1", locator: "content.remark", exact_excerpt: "step-free" },
          observed_at: "2026-10-19T01:02:03Z",
          effective_window: null,
          status: "proposed",
          supersedes: null,
        },
      }],
      clarifying_question: null,
      a2ui: { schema_version: "a2ui.v1", kind: "panel" },
      model: "must-not-render",
      provider: "must-not-render",
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.endsWith("/planning/constraints")) {
    confirmedBodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ inserted: true }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response("Not found", { status: 404 });
};

const workspace = {
  state: {
    workspace: {
      metadata: {
        template: "wedding_planning",
        weddingPlanId: "wedding_plan:fixture",
        responseWorkspaceId: "response_workspace:fixture",
        sourceResponseId: null,
        artifactKind: null,
        supertags: ["wedding"],
        privacyScope: "private",
        approvalState: "draft",
      },
    },
  },
  saveProjection: async () => ({ success: true }),
} as unknown as WeddingResponseWorkspaceViewProps;

function Fixture() {
  return <main class="mx-auto min-h-screen max-w-xl bg-wedding-canvas p-3"><PlanningConstraintCaptureCard workspace={workspace} enabled /></main>;
}

Object.assign(window, { __confirmedPlanningConstraintBodies: confirmedBodies });
render(() => <Fixture />, document.getElementById("root")!);
