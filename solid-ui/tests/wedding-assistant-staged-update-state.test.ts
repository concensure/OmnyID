import assert from "node:assert/strict";
import test from "node:test";
import { setWeddingLocalAccountScope } from "../src/lib/weddingLocalAccountScope";
import { consumeWeddingAssistantStagedUpdate, saveWeddingAssistantStagedUpdate } from "../src/lib/weddingAssistantStagedUpdateState";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

test("staged Wedding updates require review and remain account scoped", () => {
  const storage = memoryStorage();
  setWeddingLocalAccountScope("account-a");
  saveWeddingAssistantStagedUpdate({
    kind: "stage_update",
    target: "budget",
    label: "Open Budget",
    draftFields: { budgetTargetAud: 35_000 },
  }, storage);
  setWeddingLocalAccountScope("account-b");
  assert.equal(consumeWeddingAssistantStagedUpdate("budget", storage), null);
  setWeddingLocalAccountScope("account-a");
  assert.equal(consumeWeddingAssistantStagedUpdate("budget", storage)?.draftFields.budgetTargetAud, 35_000);
  assert.equal(consumeWeddingAssistantStagedUpdate("budget", storage), null);
  setWeddingLocalAccountScope(null);
});
