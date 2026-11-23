import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const sourcePath = new URL("../../solid-ui/src/lib/wedding-budget-model.v1.json", import.meta.url);
const generatedPath = new URL("../assets/js/budget-model.v1.js", import.meta.url);

test("public budget model is generated from the canonical workspace model", async () => {
  const canonical = JSON.parse(await readFile(sourcePath, "utf8"));
  const generatedSource = await readFile(generatedPath, "utf8");
  const context = { window: {} };
  vm.runInNewContext(generatedSource, context);

  assert.deepEqual(
    JSON.parse(JSON.stringify(context.window.OMNYID_WEDDING_BUDGET_MODEL_V1)),
    canonical,
  );
  assert.equal(
    canonical.categories.reduce((sum, category) => sum + category.targetShare, 0),
    100,
  );
});
