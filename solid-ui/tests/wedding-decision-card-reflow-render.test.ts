import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("Decision Card keeps all standard options and wraps narrow content safely", () => {
  const source = read("src/components/DecisionCard.tsx");
  assert.match(source, /mode\(\) === "compact"[\s\S]*slice\(0, 2\)[\s\S]*card\(\)\.patternSlots\.options!/);
  assert.doesNotMatch(source, /slice\(0, mode\(\) === "compact" \? 2 : 3\)/);
  assert.match(source, /recommendation\(\)\.reasons\.slice\(0, 3\)/);
  assert.match(source, /patternSlots\.reviewItems/);
  assert.match(source, /overflow-wrap:anywhere/);
});

test("A2UI comparison and structured actions survive 320px and 400 percent reflow", () => {
  const source = read("src/components/renderers/A2UIRenderer.tsx");
  assert.match(source, /isRecord\(value\) \? Object\.values\(value\) : \[\]/);
  assert.match(source, /asString\(item\.label\)/);
  assert.match(source, /max-w-full min-w-0 overflow-x-auto/);
  assert.match(source, /min-w-\[36rem\] table-fixed/);
  assert.match(source, /min-w-32 break-words[\s\S]*overflow-wrap:anywhere/);
});
