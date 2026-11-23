import test from "node:test";
import assert from "node:assert/strict";

import {
  personaPanelActionBusy,
  personaReloadBlocked,
  personaSwitcherBusy,
} from "../src/lib/personaSwitcherViewState.ts";

test("personaPanelActionBusy returns true when any persona panel action is active", () => {
  assert.equal(
    personaPanelActionBusy({
      saving: false,
      activatingId: null,
      deletingId: null,
      installingId: null,
      reloading: false,
    }),
    false,
  );

  assert.equal(
    personaPanelActionBusy({
      saving: true,
      activatingId: null,
      deletingId: null,
      installingId: null,
      reloading: false,
    }),
    true,
  );

  assert.equal(
    personaPanelActionBusy({
      saving: false,
      activatingId: "persona-1",
      deletingId: null,
      installingId: null,
      reloading: false,
    }),
    true,
  );
});

test("personaSwitcherBusy returns true while loading, switching, or installing", () => {
  assert.equal(
    personaSwitcherBusy({
      loading: false,
      switchingId: null,
      installingTemplateId: null,
    }),
    false,
  );

  assert.equal(
    personaSwitcherBusy({
      loading: true,
      switchingId: null,
      installingTemplateId: null,
    }),
    true,
  );

  assert.equal(
    personaSwitcherBusy({
      loading: false,
      switchingId: "persona-2",
      installingTemplateId: null,
    }),
    true,
  );

  assert.equal(
    personaSwitcherBusy({
      loading: false,
      switchingId: null,
      installingTemplateId: "template-1",
    }),
    true,
  );
});

test("personaReloadBlocked only blocks signed-in reloads that are already in progress", () => {
  assert.equal(
    personaReloadBlocked({ loading: false, reloading: false, signedIn: true }),
    false,
  );

  assert.equal(
    personaReloadBlocked({ loading: true, reloading: false, signedIn: true }),
    true,
  );

  assert.equal(
    personaReloadBlocked({ loading: false, reloading: true, signedIn: true }),
    true,
  );

  assert.equal(
    personaReloadBlocked({ loading: true, reloading: false, signedIn: false }),
    false,
  );
});
