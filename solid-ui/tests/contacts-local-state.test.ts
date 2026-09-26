import test from "node:test";
import assert from "node:assert/strict";

import { accountScopedStorageKey } from "../src/lib/accountScopedStorage.ts";
import { CONTACTS_KEY, loadContacts, saveContacts } from "../src/lib/contactsLocalState.ts";

const localStorageState = new Map<string, string>();

Object.assign(globalThis, {
  localStorage: {
    getItem(key: string) {
      return localStorageState.has(key) ? localStorageState.get(key)! : null;
    },
    setItem(key: string, value: string) {
      localStorageState.set(key, value);
    },
    removeItem(key: string) {
      localStorageState.delete(key);
    },
  },
});

test("loadContacts keeps only valid trimmed contacts and optional fields", () => {
  localStorageState.clear();
  localStorageState.set(
    accountScopedStorageKey(CONTACTS_KEY, "user-1"),
    JSON.stringify([
      {
        id: " contact-1 ",
        name: " Alice ",
        email: " alice@example.com ",
        agentId: " agent://alice ",
        relationshipKind: "client",
        roles: [" Guest ", "Guest", "Planner"],
        responseSlaHours: 24,
      },
      {
        id: "contact-2",
        name: "Bob",
        relationshipKind: "unknown",
      },
      {
        id: "contact-3",
        name: "Carol",
        relationshipKind: "team",
        responseSlaHours: "12",
      },
      {
        id: "   ",
        name: "Blank",
        relationshipKind: "other",
      },
      7,
    ]),
  );

  assert.deepEqual(loadContacts("user-1"), [
    {
      id: "contact-1",
      name: "Alice",
      email: "alice@example.com",
      agentId: "agent://alice",
      relationshipKind: "client",
      roles: ["Guest", "Planner"],
      responseSlaHours: 24,
    },
    {
      id: "contact-3",
      name: "Carol",
      relationshipKind: "team",
    },
  ]);
  assert.deepEqual(JSON.parse(localStorageState.get(accountScopedStorageKey(CONTACTS_KEY, "user-1")) ?? "null"), [
    {
      id: "contact-1",
      name: "Alice",
      email: "alice@example.com",
      agentId: "agent://alice",
      relationshipKind: "client",
      roles: ["Guest", "Planner"],
      responseSlaHours: 24,
    },
    {
      id: "contact-3",
      name: "Carol",
      relationshipKind: "team",
    },
  ]);
});

test("loadContacts clears unparseable stored contacts", () => {
  localStorageState.clear();
  localStorageState.set(accountScopedStorageKey(CONTACTS_KEY, "user-1"), "{bad json");
  assert.deepEqual(loadContacts("user-1"), []);
  assert.equal(localStorageState.has(accountScopedStorageKey(CONTACTS_KEY, "user-1")), false);
});

test("saveContacts persists only normalized contact rows", () => {
  localStorageState.clear();
  saveContacts([
    {
      id: " contact-1 ",
      name: " Alice ",
      email: " alice@example.com ",
      relationshipKind: "friend",
      roles: [" Guest ", "Helper"],
      responseSlaHours: 8,
    },
    {
      id: "",
      name: "Bad",
      relationshipKind: "other",
    },
  ], "user-1");

  assert.deepEqual(JSON.parse(localStorageState.get(accountScopedStorageKey(CONTACTS_KEY, "user-1")) ?? "null"), [
    {
      id: "contact-1",
      name: "Alice",
      email: "alice@example.com",
      relationshipKind: "friend",
      roles: ["Guest", "Helper"],
      responseSlaHours: 8,
    },
  ]);
});

test("loadContacts migrates legacy global contacts storage into the scoped key", () => {
  localStorageState.clear();
  localStorageState.set(CONTACTS_KEY, JSON.stringify([{ id: "1", name: "Alice", relationshipKind: "friend" }]));

  assert.deepEqual(loadContacts("user-1"), [{ id: "1", name: "Alice", relationshipKind: "friend" }]);
  assert.equal(localStorageState.has(CONTACTS_KEY), false);
  assert.equal(
    localStorageState.get(accountScopedStorageKey(CONTACTS_KEY, "user-1")),
    JSON.stringify([{ id: "1", name: "Alice", relationshipKind: "friend" }]),
  );
});
