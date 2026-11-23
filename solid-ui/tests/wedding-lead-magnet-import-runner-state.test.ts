import assert from "node:assert/strict";
import test from "node:test";
import {
  completeWeddingLeadMagnetImportRequest,
  requestWeddingLeadMagnetImport,
  weddingLeadMagnetImportRequested,
} from "../src/lib/weddingLeadMagnetImportRunnerState.ts";

function target(): Window {
  const values = new Map<string, string>();
  return {
    sessionStorage: {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
    dispatchEvent: () => true,
  } as unknown as Window;
}

test("a sign-in request survives until the planner completes its import", () => {
  const windowTarget = target();
  requestWeddingLeadMagnetImport(windowTarget);
  assert.equal(weddingLeadMagnetImportRequested(windowTarget), true);
  completeWeddingLeadMagnetImportRequest(windowTarget);
  assert.equal(weddingLeadMagnetImportRequested(windowTarget), false);
});
