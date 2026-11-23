import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(process.cwd(), "src/components/WeddingWorkspaceContextPanels.tsx"), "utf8");

test("Plan aggregate actions stack title detail and status with usable mobile spacing", () => {
  assert.match(source, /flex min-h-\[10rem\] min-w-0 flex-col items-start gap-3/);
  assert.match(source, /p-5 text-left/);
  assert.match(source, /block w-full text-xs leading-5/);
  assert.match(source, /mt-auto block w-full text-\[11px\]/);
});
