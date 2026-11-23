import assert from "node:assert/strict";
import test from "node:test";

import { weddingImportNextActionTarget } from "@/lib/weddingImportNextActionState";

test("weddingImportNextActionTarget routes budget and payment review to Budget", () => {
  const target = weddingImportNextActionTarget("Verify formula-backed budget/payment totals against the original workbook before deposits.");

  assert.equal(target.menuId, "budget");
  assert.equal(target.actionLabel, "Open budget");
});

test("weddingImportNextActionTarget routes spreadsheet parser and source evidence work to Advanced", () => {
  assert.equal(
    weddingImportNextActionTarget("Connect Excel workbook import before relying on older XLS files.").menuId,
    "advanced",
  );
  assert.equal(
    weddingImportNextActionTarget("Save original wedding imports to Files before sharing or relying on them.").menuId,
    "advanced",
  );
});

test("weddingImportNextActionTarget keeps generic import review on wedding documents", () => {
  const target = weddingImportNextActionTarget("Review 2 imports that did not expose clear rows.");

  assert.equal(target.menuId, "documents");
  assert.equal(target.actionLabel, "Open wedding documents");
});
