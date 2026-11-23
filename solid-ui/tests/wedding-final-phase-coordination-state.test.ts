import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingFinalPhaseCoordinationState,
  buildWeddingFinalPhaseTaskItems,
} from "../src/lib/weddingFinalPhaseCoordinationState.ts";
import { buildWeddingWeatherProviderReadinessState } from "../src/lib/weddingWeatherProviderReadinessState.ts";

test("buildWeddingFinalPhaseCoordinationState creates draft run sheet and provider-gated weather options", () => {
  const state = buildWeddingFinalPhaseCoordinationState({
    metadata: {
      weddingPlanId: "wedding_plan:harbour",
      responseWorkspaceId: "response_workspace:harbour",
    },
    planningContext: {
      dateOrSeason: "2027-07-01",
      location: "Garden, Sydney NSW",
    },
  });

  assert.equal(state.runSheetReadiness, "ready_for_draft");
  assert.equal(state.weatherReadiness, "provider_needed");
  assert.ok(state.runSheetItems.some((item) => /Hair and makeup/i.test(item.title)));
  assert.ok(state.delayOptions.some((option) => /Shorten cocktail hour/i.test(option)));
  assert.ok(state.vendorShareRules.some((rule) => /Photographer sees only/i.test(rule)));
  assert.ok(state.weatherBackupOptions.some((option) => /indoor backup/i.test(option)));
  assert.ok(state.finalConfirmationItems.some((item) => item.vendor === "Caterer" && /headcount/i.test(item.confirmation)));
  assert.ok(state.guestFinalCountDecision.options.some((option) => /Wait for outstanding RSVPs/i.test(option)));
  assert.ok(state.dayOfExecutionScenarios.some((scenario) => scenario.scenario === "Vendor delay" && /caterer/i.test(scenario.trigger)));
  assert.ok(state.dayOfExecutionScenarios.some((scenario) => scenario.scenario === "Vendor no-show" && /backup vendor/i.test(scenario.options.join(" "))));
  assert.ok(state.dayOfExecutionScenarios.some((scenario) => scenario.scenario === "Weather emergency" && /E2EE/i.test(scenario.options.join(" "))));
  assert.ok(state.dayOfExecutionScenarios.some((scenario) => scenario.scenario === "Guest coordination incident" && /lost item/i.test(scenario.trigger)));
  assert.ok(state.dayOfExecutionScenarios.some((scenario) => scenario.scenario === "Payment verification" && /receipt/i.test(scenario.options.join(" "))));
  assert.ok(state.emergencyKitItems.includes("Sewing kit"));
  assert.ok(state.scheduleItems.some((item) => /Ceremony/i.test(item.title)));
  assert.ok(state.taskItems.some((task) => task.kind === "run_sheet"));
  assert.ok(state.taskItems.some((task) => task.kind === "weather_contingency"));
  assert.ok(state.taskItems.some((task) => /final vendors/i.test(task.title)));
  assert.ok(state.taskItems.some((task) => /final guest count/i.test(task.title)));
  assert.ok(state.taskItems.some((task) => /emergency kit/i.test(task.title)));
  assert.ok(state.taskItems.some((task) => /payment schedule/i.test(task.title)));
  assert.ok(state.taskItems.some((task) => /vendor delay/i.test(task.title)));
  assert.ok(state.taskItems.some((task) => /no-show/i.test(task.title)));
  assert.ok(state.taskItems.some((task) => /guest-safe live update/i.test(task.notes ?? "")));
  assert.ok(state.taskItems.some((task) => /payment receipt/i.test(task.title)));
  assert.ok(state.taskItems.some((task) => /vendor delay/i.test(task.title) && task.dueLabel === "Wedding day / live run sheet"));
  assert.ok(state.taskItems.some((task) => /no-show/i.test(task.title) && task.dueLabel === "Final week / wedding day"));
  assert.ok(state.taskItems.some((task) => /payment receipt/i.test(task.title) && task.dueLabel === "Before final payment / wedding day"));
  assert.ok(state.taskItems.some((task) => /payment receipt/i.test(task.title) && (task.metadata as Record<string, unknown>).second_order_loop === "commitment_timing"));
  assert.ok(state.taskItems.some((task) => /no-show/i.test(task.title) && (task.metadata as Record<string, unknown>).second_order_loop === "contact_follow_up"));
  assert.ok(state.taskItems.every((task) => (task.metadata as Record<string, unknown>).final_phase_task === true));
  assert.ok(state.taskItems.some((task) => (task.metadata as Record<string, unknown>).final_phase_action_id === "final-vendor-confirmations"));
  assert.match(state.artifact.markdown, /Draft run sheet/i);
  assert.match(state.artifact.markdown, /Day-of execution incident playbooks/i);
  assert.match(state.artifact.markdown, /Final confirmations and payments/i);
  assert.match(state.artifact.markdown, /Final guest-count decision/i);
  assert.match(state.artifact.markdown, /Emergency kit and day-of prep/i);
  assert.match(state.artifact.markdown, /Do not auto-notify vendors or guests/i);
  assert.match(state.artifact.markdown, /Do not auto-remind vendors, submit final counts, or confirm payments/i);
});

test("buildWeddingFinalPhaseCoordinationState blocks dated schedule without date and location", () => {
  const state = buildWeddingFinalPhaseCoordinationState({});

  assert.equal(state.runSheetReadiness, "needs_date_location");
  assert.equal(state.scheduleItems.length, 0);
  assert.match(state.artifact.markdown, /Date\/season: Unknown/i);
});

test("buildWeddingFinalPhaseCoordinationState records structured verified weather evidence", () => {
  const state = buildWeddingFinalPhaseCoordinationState({
    planningContext: {
      dateOrSeason: "2027-07-01",
      location: "Garden, Sydney NSW",
    },
    weatherProviderReadiness: buildWeddingWeatherProviderReadinessState({
      provider: "bom",
      providerConnected: true,
      forecastLocationsRequested: 2,
      forecastLocationsVerified: 2,
      maxForecastAgeMinutes: 30,
      hasSourceTimestamp: true,
      hasUserFacingCaveat: true,
      hasFallbackManualCheck: true,
      errorCount: 0,
    }),
  });

  assert.equal(state.weatherReadiness, "verified");
  assert.ok(state.artifact.input.sourceLabels.some((label) => /Verified weather provider evidence/i.test(label)));
  assert.ok(state.artifact.input.sourceLabels.some((label) => /2\/2 forecast locations verified/i.test(label)));
});

test("buildWeddingFinalPhaseCoordinationState preserves manual weather fallback as handoff only", () => {
  const state = buildWeddingFinalPhaseCoordinationState({
    planningContext: {
      dateOrSeason: "2027-07-01",
      location: "Garden, Sydney NSW",
    },
    weatherProviderReadiness: buildWeddingWeatherProviderReadinessState({
      providerConnected: false,
      forecastLocationsRequested: 1,
      forecastLocationsVerified: 0,
      hasUserFacingCaveat: true,
      hasFallbackManualCheck: true,
    }),
  });

  assert.equal(state.weatherReadiness, "handoff_only");
  assert.ok(state.artifact.input.sourceLabels.some((label) => /manual weather-check fallback/i.test(label)));
});

test("buildWeddingFinalPhaseTaskItems recovers final-phase tasks from saved timeline artifacts", () => {
  const state = buildWeddingFinalPhaseCoordinationState({
    metadata: {
      weddingPlanId: "wedding_plan:harbour",
      responseWorkspaceId: "response_workspace:harbour",
    },
    planningContext: {
      dateOrSeason: "2027-07-01",
      location: "Garden, Sydney NSW",
    },
  });
  const tasks = buildWeddingFinalPhaseTaskItems({
    artifacts: [state.artifact.input],
    metadata: state.artifact.input.metadata,
  });

  assert.ok(tasks.some((task) => /final vendors/i.test(task.title)));
  assert.ok(tasks.some((task) => /guest count/i.test(task.title)));
  assert.ok(tasks.some((task) => /emergency kit/i.test(task.title)));
  assert.ok(tasks.every((task) => task.linkedArtifactId === state.artifact.input.id));
  assert.ok(tasks.every((task) => (task.metadata as Record<string, unknown>).final_phase_task === true));
});

test("buildWeddingFinalPhaseTaskItems suppresses duplicate saved final-phase tasks", () => {
  const state = buildWeddingFinalPhaseCoordinationState({
    metadata: {
      weddingPlanId: "wedding_plan:harbour",
      responseWorkspaceId: "response_workspace:harbour",
    },
  });
  const tasks = buildWeddingFinalPhaseTaskItems({
    artifacts: [state.artifact.input],
    metadata: state.artifact.input.metadata,
    existingTaskItems: [{
      id: "saved:final-confirmations",
      title: "Saved final confirmations",
      kind: "vendor_coordination",
      metadata: {
        final_phase_task: true,
        final_phase_action_id: "final-vendor-confirmations",
      },
    }],
  });

  assert.equal(tasks.some((task) =>
    (task.metadata as Record<string, unknown>).final_phase_action_id === "final-vendor-confirmations"
  ), false);
  assert.ok(tasks.some((task) =>
    (task.metadata as Record<string, unknown>).final_phase_action_id === "emergency-kit"
  ));
});
