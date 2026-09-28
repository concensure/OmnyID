import test from "node:test";
import assert from "node:assert/strict";

import { buildSovereignDataBundle } from "../src/lib/exportSovereignDataBundle.ts";

function storageFromEntries(entries: Array<[string, string]>): Pick<Storage, "length" | "key" | "getItem"> {
  return {
    length: entries.length,
    key(index: number) {
      return entries[index]?.[0] ?? null;
    },
    getItem(key: string) {
      return entries.find((entry) => entry[0] === key)?.[1] ?? null;
    },
  };
}

test("buildSovereignDataBundle exports only omnyid keys and preserves raw corrupt values", () => {
  const bundle = buildSovereignDataBundle(storageFromEntries([
    ["omnyid.valid", JSON.stringify({ ok: true })],
    ["omnyid.raw", "not json"],
    ["other.key", JSON.stringify({ ignored: true })],
  ]));

  assert.equal(typeof bundle.exportedAt, "string");
  assert.equal(bundle.version, "1");
  assert.deepEqual(bundle["omnyid.valid"], { ok: true });
  assert.equal(bundle["omnyid.raw"], "not json");
  assert.equal("other.key" in bundle, false);
});

test("buildSovereignDataBundle skips storage entries that throw while reading", () => {
  const storage = {
    length: 2,
    key(index: number) {
      if (index === 0) throw new Error("blocked key");
      return "omnyid.safe";
    },
    getItem() {
      throw new Error("blocked value");
    },
  };

  const bundle = buildSovereignDataBundle(storage);

  assert.equal("omnyid.safe" in bundle, false);
});
