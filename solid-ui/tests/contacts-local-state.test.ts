import test from "node:test";
import assert from "node:assert/strict";

import { accountScopedStorageKey } from "../src/lib/accountScopedStorage.ts";
import {
  CONTACTS_CHANGED_EVENT,
  CONTACTS_KEY,
  contactStorageEventMatchesUser,
  loadContacts,
  readContactsChangedEventDetail,
  saveContacts,
  subscribeContactsChangedEvent,
} from "../src/lib/contactsLocalState.ts";

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

class ContactsEventTarget {
  listeners = new Map<string, Set<(event: Event) => void>>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const fn = typeof listener === "function" ? listener : (event: Event) => listener.handleEvent(event);
    const listeners = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    listeners.add(fn);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const fn = typeof listener === "function" ? listener : (event: Event) => listener.handleEvent(event);
    this.listeners.get(type)?.delete(fn);
  }

  dispatchEvent(event: Event) {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    return true;
  }
}

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
        roles: [" guest ", "Guest", "wedding PLANNER"],
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
      roles: ["Guest", "Wedding planner"],
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
      roles: ["Guest", "Wedding planner"],
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

test("authenticated contacts never adopt unowned legacy global storage", () => {
  localStorageState.clear();
  localStorageState.set(CONTACTS_KEY, JSON.stringify([{ id: "1", name: "Alice", relationshipKind: "friend" }]));

  assert.deepEqual(loadContacts("user-1"), []);
  assert.equal(localStorageState.has(CONTACTS_KEY), true);
  assert.equal(localStorageState.has(accountScopedStorageKey(CONTACTS_KEY, "user-1")), false);
});

test("saveContacts dispatches contact changed events for same-tab refreshes", () => {
  localStorageState.clear();
  const previousWindow = globalThis.window;
  const target = new ContactsEventTarget();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: target,
  });
  const seen: unknown[] = [];
  try {
    target.addEventListener(CONTACTS_CHANGED_EVENT, (event) => {
      seen.push(readContactsChangedEventDetail(event));
    });

    saveContacts([{ id: "1", name: "Alice", relationshipKind: "friend" }], " user-1 ");
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow,
    });
  }

  assert.deepEqual(seen, [{ userId: "user-1" }]);
});

test("subscribeContactsChangedEvent relays normalized detail and unsubscribes cleanly", () => {
  const target = new ContactsEventTarget();
  const seen: unknown[] = [];
  const unsubscribe = subscribeContactsChangedEvent((detail) => seen.push(detail), target);

  target.dispatchEvent(new CustomEvent(CONTACTS_CHANGED_EVENT, { detail: { userId: " user-1 " } }));
  target.dispatchEvent(new CustomEvent(CONTACTS_CHANGED_EVENT, { detail: { userId: "" } }));
  target.dispatchEvent(new CustomEvent(CONTACTS_CHANGED_EVENT, { detail: "invalid" }));
  unsubscribe();
  target.dispatchEvent(new CustomEvent(CONTACTS_CHANGED_EVENT, { detail: { userId: "user-2" } }));

  assert.deepEqual(seen, [{ userId: "user-1" }, { userId: null }]);
});

test("contactStorageEventMatchesUser scopes cross-tab refreshes to the current contacts bucket", () => {
  assert.equal(
    contactStorageEventMatchesUser({ key: accountScopedStorageKey(CONTACTS_KEY, "user-1") }, "user-1"),
    true,
  );
  assert.equal(
    contactStorageEventMatchesUser({ key: accountScopedStorageKey(CONTACTS_KEY, "user-2") }, "user-1"),
    false,
  );
  assert.equal(contactStorageEventMatchesUser({ key: CONTACTS_KEY }, "user-1"), true);
  assert.equal(contactStorageEventMatchesUser({ key: null }, "user-1"), true);
  assert.equal(contactStorageEventMatchesUser({ key: "omnyid.other" }, "user-1"), false);
});
