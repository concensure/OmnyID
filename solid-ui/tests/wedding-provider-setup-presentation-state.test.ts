import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingProviderSetupPresentationState,
} from "@/lib/weddingProviderSetupPresentationState";

test("provider setup presentation routes email to email setup", () => {
  const state = buildWeddingProviderSetupPresentationState({
    capability: "email",
    setupView: "email",
  } as any);

  assert.equal(state.buttonLabel, "Open email setup");
  assert.equal(state.destinationLabel, "Email");
});

test("provider setup presentation routes calendar to calendar setup", () => {
  const state = buildWeddingProviderSetupPresentationState({
    capability: "calendar",
    setupView: "calendar",
  } as any);

  assert.equal(state.buttonLabel, "Open calendar setup");
  assert.equal(state.destinationLabel, "Calendar");
});

test("provider setup presentation routes registry to connected apps", () => {
  const state = buildWeddingProviderSetupPresentationState({
    capability: "registry",
    setupView: "connected_apps",
  } as any);

  assert.equal(state.buttonLabel, "Open Connected Apps");
  assert.equal(state.destinationLabel, "Connected Apps");
});

test("provider setup presentation routes vendor search to connected provider setup", () => {
  const state = buildWeddingProviderSetupPresentationState({
    capability: "vendor_search",
    setupView: "connected_apps",
  } as any);

  assert.equal(state.buttonLabel, "Connect vendor search");
  assert.equal(state.destinationLabel, "Connected Apps - Brave, Google Places, or OSM/Overpass");
});

test("provider setup presentation hides setup when no external route exists", () => {
  const state = buildWeddingProviderSetupPresentationState({
    capability: "sharing",
    setupView: null,
  } as any);

  assert.equal(state.buttonLabel, "No setup needed");
  assert.equal(state.destinationLabel, null);
});
