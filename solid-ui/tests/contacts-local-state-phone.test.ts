import assert from "node:assert/strict";
import test from "node:test";

import { loadContacts, saveContacts, CONTACTS_KEY, type Contact } from "@/lib/contactsLocalState";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

test("contacts local state preserves optional phone and notes for delegated wedding contacts", () => {
  const original = globalThis.localStorage;
  const storage = new MemoryStorage() as unknown as Storage;
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  try {
    const contacts: Contact[] = [{
      id: "wedding-delegate:legal:maya",
      name: "Maya Chen",
      relationshipKind: "friend",
      phone: "+61 400 111 222",
      notes: "Wedding responsibility: Legal and NOIM",
      lastContactedAt: "2026-09-14T10:00:00.000Z",
      lastContactedBy: "agent",
      lastResponseAt: "2026-09-14T11:00:00.000Z",
      lastResponseSource: "imported",
      lastResponseSummary: "Confirmed availability and asked for the preferred ceremony time.",
      responseSummaryEnabled: true,
      followUpOutcome: "called",
      followUpOutcomeAt: "2026-09-14T12:00:00.000Z",
      followUpOutcomeNote: "Called to clarify ceremony time.",
    }];
    saveContacts(contacts, "user-1");
    const loaded = loadContacts("user-1");

    assert.equal(loaded[0]?.phone, "+61 400 111 222");
    assert.match(loaded[0]?.notes ?? "", /Legal and NOIM/);
    assert.equal(loaded[0]?.lastContactedAt, "2026-09-14T10:00:00.000Z");
    assert.equal(loaded[0]?.lastContactedBy, "agent");
    assert.equal(loaded[0]?.lastResponseAt, "2026-09-14T11:00:00.000Z");
    assert.equal(loaded[0]?.lastResponseSource, "imported");
    assert.equal(loaded[0]?.lastResponseSummary, "Confirmed availability and asked for the preferred ceremony time.");
    assert.equal(loaded[0]?.responseSummaryEnabled, true);
    assert.equal(loaded[0]?.followUpOutcome, "called");
    assert.equal(loaded[0]?.followUpOutcomeAt, "2026-09-14T12:00:00.000Z");
    assert.equal(loaded[0]?.followUpOutcomeNote, "Called to clarify ceremony time.");
    assert.equal(storage.getItem(CONTACTS_KEY), null);
  } finally {
    Object.defineProperty(globalThis, "localStorage", { value: original, configurable: true });
  }
});
