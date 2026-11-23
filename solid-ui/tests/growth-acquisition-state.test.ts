import assert from "node:assert/strict";
import test from "node:test";
import { sameSessionAcquisitionVisitId } from "../src/lib/growthAcquisitionState.ts";

function storage(values: Record<string, string>): Pick<Storage, "getItem"> {
  return { getItem: (key) => values[key] ?? null };
}

test("same-session acquisition carries only a bounded opaque visit", () => {
  assert.equal(sameSessionAcquisitionVisitId(storage({ "omnyid.public.visit.v1": "a1b2c3d4e5f6" })), "a1b2c3d4e5f6");
  assert.equal(sameSessionAcquisitionVisitId(storage({ "omnyid.public.visit.v1": "email@example.com" })), null);
  assert.equal(sameSessionAcquisitionVisitId(storage({ "omnyid.public.visit.v1": "a1b2c3d4e5f6?utm=x" })), null);
});
test("legacy Wedding visit migrates without creating a persistent identifier", () => {
  assert.equal(sameSessionAcquisitionVisitId(storage({ "omnyid.wedding.visit.v1": "z9y8x7w6v5u4" })), "z9y8x7w6v5u4");
  assert.equal(sameSessionAcquisitionVisitId(null), null);
});
