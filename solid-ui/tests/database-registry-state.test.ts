import assert from "node:assert/strict";
import test from "node:test";

import {
  existingDatabaseDefinitionForProfile,
  projectDatabaseDefinitions,
  reconcileSelectedDatabaseId,
  registeredDatabaseProfiles,
} from "../src/lib/databaseRegistryState.ts";

function definition(id: string, revision: number, name: string, accountId = "account-1") {
  return {
    id: `${id}-${revision}`,
    type: "database_definition",
    timestamp: `2026-10-29T00:00:0${revision}Z`,
    content: {
      kind: "database_definition",
      contract_version: 1,
      database_id: id,
      name,
      default_table: "items",
      scope: { account_id: accountId },
      revision,
      idempotency_key: `${id}-definition-${revision}`,
    },
  };
}

test("database registry applies account-scoped sequential definitions and archive state", () => {
  const messages = [
    definition("database:clients", 1, "Clients"),
    definition("database:clients", 2, "Client work"),
    definition("database:foreign", 1, "Foreign", "account-2"),
    {
      id: "archive-1",
      type: "database_archive",
      timestamp: "2026-10-29T00:00:03Z",
      content: {
        kind: "database_archive",
        contract_version: 1,
        database_id: "database:clients",
        archived: true,
        revision: 1,
        idempotency_key: "database-clients-archive-1",
      },
    },
  ];
  const projected = projectDatabaseDefinitions({ messages, accountId: "account-1", hasLegacyRecords: false });
  assert.equal(projected.length, 1);
  assert.equal(projected[0].name, "Client work");
  assert.equal(projected[0].revision, 2);
  assert.equal(projected[0].archived, true);
  assert.equal(projected[0].archiveRevision, 1);
});

test("a profile resolves to one definition per wedding plan", () => {
  const definitions = projectDatabaseDefinitions({
    messages: [{
      ...definition("database:runsheet", 1, "Wedding run sheet"),
      content: {
        ...definition("database:runsheet", 1, "Wedding run sheet").content,
        profile_id: "wedding_runsheet.v1",
        scope: { account_id: "account-1", wedding_plan_id: "plan-2027" },
      },
    }],
    accountId: "account-1",
    hasLegacyRecords: false,
  });
  assert.equal(existingDatabaseDefinitionForProfile(definitions, "wedding_runsheet.v1", "plan-2027")?.databaseId, "database:runsheet");
  assert.equal(existingDatabaseDefinitionForProfile(definitions, "wedding_runsheet.v1", "plan-other"), null);
  assert.equal(existingDatabaseDefinitionForProfile(definitions, null, null), null);
});

test("legacy records stay visible and archived databases remain selectable for restore", () => {
  const projected = projectDatabaseDefinitions({
    messages: [
      definition("database:active", 1, "Active"),
      definition("database:archived", 1, "Archived"),
      {
        id: "archive-1",
        content: { kind: "database_archive", contract_version: 1, database_id: "database:archived", archived: true, revision: 1, idempotency_key: "archive-1" },
      },
    ],
    accountId: "account-1",
    hasLegacyRecords: true,
  });
  assert.ok(projected.some((entry) => entry.databaseId === "database:legacy" && entry.legacy));
  assert.equal(reconcileSelectedDatabaseId(projected, "database:archived"), "database:archived");
  assert.equal(reconcileSelectedDatabaseId(projected, null), "database:active");
});

test("wedding run-sheet profile is offered only when an accessible plan reference exists", () => {
  assert.deepEqual(registeredDatabaseProfiles([]), []);
  const profiles = registeredDatabaseProfiles([{
    id: "wedding-context",
    content: { kind: "wedding_plan", wedding_plan_id: "plan-2027" },
  }]);
  assert.deepEqual(profiles.map((profile) => [profile.profileId, profile.weddingPlanId]), [
    ["wedding_runsheet.v1", "plan-2027"],
  ]);
});
